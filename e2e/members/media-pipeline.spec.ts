import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "@playwright/test";
import sharp from "sharp";

import {
  TEST_MEMBER,
  TEST_MEMBER_TWO,
  adminContext,
  ensureMemberUser,
  loginContext,
} from "../helpers/members";

/**
 * M5 — media pipeline for member uploads.
 *
 * Before this, a freshly uploaded media's `url` was a relative
 * `/api/media/file/<name>`, which broke next/image's IMAGES-binding
 * optimizer (a self-fetch through the Worker) and made Stream ingest
 * depend on NEXT_PUBLIC_SITE_URL being correct. Migrated content never hit
 * this because it was seeded with absolute R2 URLs directly, so nothing
 * caught it until a member actually uploaded something new.
 */
test.describe("M5 member media pipeline", () => {
  const stamp = Date.now();
  let admin: APIRequestContext;
  let member: APIRequestContext;
  let memberTwo: APIRequestContext;

  const uploadedMediaIds: number[] = [];
  const createdPostIds: number[] = [];
  const createdGalleryIds: number[] = [];

  async function fixturePng(color: { r: number; g: number; b: number }) {
    return sharp({
      create: { width: 1200, height: 800, channels: 3, background: color },
    })
      .png()
      .toBuffer();
  }

  async function upload(
    context: APIRequestContext,
    name: string,
    buffer: Buffer,
    mimeType = "image/png",
  ) {
    const response = await context.post("/api/media", {
      multipart: {
        file: { name, mimeType, buffer },
        _payload: JSON.stringify({ alt: name }),
      },
    });
    expect(
      response.ok(),
      `upload ${name} failed: ${response.status()} ${await response.text()}`,
    ).toBeTruthy();
    const doc = (await response.json()).doc;
    uploadedMediaIds.push(doc.id);
    return doc;
  }

  test.beforeAll(async ({ baseURL }) => {
    admin = await adminContext(baseURL);
    await ensureMemberUser(admin, TEST_MEMBER);
    await ensureMemberUser(admin, TEST_MEMBER_TWO);
    member = await loginContext(baseURL, TEST_MEMBER);
    memberTwo = await loginContext(baseURL, TEST_MEMBER_TWO);
  });

  test.afterAll(async () => {
    for (const id of createdPostIds) await admin?.delete(`/api/posts/${id}`);
    for (const id of createdGalleryIds) await admin?.delete(`/api/galleries/${id}`);
    for (const id of uploadedMediaIds) await admin?.delete(`/api/media/${id}`);
    await Promise.all([admin?.dispose(), member?.dispose(), memberTwo?.dispose()]);
  });

  test("M5-T1: a member's upload gets a URL that resolves", async ({ baseURL }) => {
    const buffer = await fixturePng({ r: 10, g: 120, b: 200 });
    const doc = await upload(member, `m5-t1-${stamp}.png`, buffer);

    expect(doc.url).toBeTruthy();

    // Reachability is the property that has to hold everywhere. The shape
    // varies on purpose (see setMediaUrl): a deployed Worker serves the
    // file from R2's public domain, dev and CI serve it through the app.
    // Asserting "absolute" unconditionally tested which machine was running
    // rather than whether uploads work.
    const fetched = await member.get(doc.url as string);
    expect(
      fetched.ok(),
      `uploaded media is not retrievable at ${doc.url}`,
    ).toBeTruthy();

    // Only a deployed Worker needs the absolute form — next/image's
    // optimizer and Stream ingest both fetch it from outside the request.
    if (baseURL && !baseURL.includes("localhost")) {
      expect(doc.url).toMatch(/^https?:\/\//);
      expect(doc.url).not.toContain("/api/media/file/");
    }
  });

  test("M5-T2: that image renders through the Next optimizer on a public gallery page", async ({
    page,
  }) => {
    const buffer = await fixturePng({ r: 80, g: 40, b: 160 });
    const media = await upload(member, `m5-t2-${stamp}.png`, buffer);

    const slug = `m5-optimizer-gallery-${stamp}`;
    const gallery = await admin.post("/api/galleries", {
      data: {
        name: `M5 optimizer gallery ${stamp}`,
        slug,
        cover: media.id,
        images: [{ media: media.id, featured: true }],
        _status: "published",
      },
    });
    expect(gallery.ok()).toBeTruthy();
    createdGalleryIds.push((await gallery.json()).doc.id);

    await page.goto(`/gallery/${slug}`);
    const galleryImage = page
      .getByRole("group", { name: "Photo album" })
      .locator('img[src*="/_next/image"]')
      .first();
    await expect(galleryImage).toBeVisible();

    const optimizedUrl = await galleryImage.getAttribute("src");
    const optimized = await page.context().request.get(optimizedUrl!, {
      headers: { Accept: "image/avif,image/webp" },
    });
    expect(
      optimized.ok(),
      `optimizer fetch failed: ${optimized.status()}`,
    ).toBeTruthy();
    expect(optimized.headers()["content-type"]).toMatch(/^image\/(avif|webp)/);
  });

  test("M5-T3: two members uploading same-named files don't collide", async () => {
    const name = `m5-collision-${stamp}.png`;
    const bufferA = await fixturePng({ r: 200, g: 0, b: 0 });
    const bufferB = await fixturePng({ r: 0, g: 200, b: 0 });

    const docA = await upload(member, name, bufferA);
    const docB = await upload(memberTwo, name, bufferB);

    expect(docA.filename).not.toBe(docB.filename);
    expect(docA.url).not.toBe(docB.url);

    // Each URL actually resolves to its own distinct content, not one
    // overwriting the other in R2.
    const fetchedA = await admin.get(docA.url as string);
    const fetchedB = await admin.get(docB.url as string);
    expect(fetchedA.ok()).toBeTruthy();
    expect(fetchedB.ok()).toBeTruthy();
    const bodyA = await fetchedA.body();
    const bodyB = await fetchedB.body();
    expect(bodyA.equals(bodyB)).toBe(false);
  });

  test("M5-T4: a video upload succeeds even when Stream ingest can't complete", async ({
    baseURL,
  }) => {
    test.skip(
      !baseURL || baseURL.includes("localhost"),
      "Stream ingest only runs in production (NODE_ENV), not local dev",
    );

    // Not asserting streamId gets set here: this Cloudflare account does not
    // currently have the Stream product enabled ("Cloudflare Stream not
    // enabled" — confirmed via `wrangler tail` — a dashboard/billing action,
    // not something fixable in code), so real ingestion cannot succeed in
    // this environment regardless of what URL it's given. What's actually
    // verifiable here: ingestVideoToStream's try/catch (stream-ingest.ts)
    // means a Stream failure degrades gracefully rather than failing the
    // upload — the same mp4 stub e2e/media/gallery-stream.spec.ts (P5) uses
    // without asserting on streamId either.
    const doc = await upload(
      member,
      `m5-t4-${stamp}.mp4`,
      Buffer.from([
        0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34,
        0x32, 0x00, 0x00, 0x00, 0x00, 0x6d, 0x70, 0x34, 0x32, 0x6d, 0x70,
        0x34, 0x31,
      ]),
      "video/mp4",
    );

    expect(doc.url).toMatch(/^https?:\/\//);

    const refreshed = await admin.get(`/api/media/${doc.id}?depth=0`);
    expect(refreshed.ok()).toBeTruthy();
  });

  test("M5-T5: non-image/video uploads are still rejected", async () => {
    const response = await member.post("/api/media", {
      multipart: {
        file: {
          name: `m5-t5-${stamp}.pdf`,
          mimeType: "application/pdf",
          buffer: Buffer.from("%PDF-1.4 not a real pdf"),
        },
        _payload: JSON.stringify({ alt: "rejected" }),
      },
    });
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test("M5-T6: previously migrated media still resolves (no regression)", async ({
    request,
  }) => {
    const list = await request.get(
      "/api/media?limit=1&sort=id&depth=0&where[filename][not_like]=m5-",
    );
    expect(list.ok()).toBeTruthy();
    const doc = (await list.json()).docs[0];
    test.skip(!doc, "no pre-existing media to check");

    const fetched = await request.get(doc.url as string);
    expect(fetched.ok()).toBeTruthy();
  });
});
