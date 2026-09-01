/**
 * V-MEDIASHARE — /gallery/m/[mediaId] serves one public photo or video, and
 * nothing else.
 *
 * The route replaces what used to be a video-only share page
 * (/gallery/v/[mediaId]) and gives photos an id-based share address for the
 * first time — getGalleryPhotos() only ever returned the whole public list.
 *
 * getGalleryMediaById (src/lib/content.ts) queries `media` through Payload's
 * Local API, which defaults `overrideAccess: true` and bypasses
 * `mediaPublicRead` (src/access/index.ts) entirely. So the query has to carry
 * its own `usage: 'gallery'` filter, by hand, or the route becomes an oracle
 * that resolves any of the several hundred rows in the table by guessing an
 * id — private and article-attachment files included. V-MEDIASHARE-T3 is the
 * regression test for exactly that, and is the reason this file exists.
 *
 * V-MEDIASHARE-T1/T2 need real rendering (`page.goto`), so `test` comes from
 * ../helpers/test for the console-error guard. T3/T4 are pure HTTP checks and
 * use the same import — the guard only activates once `page` is used, so it
 * costs T3/T4 nothing.
 *
 * T1 intercepts `images.wildrunner.org`, the same way gallery-unpublish.spec.ts
 * does and for the same reason: local dev sets R2_PUBLIC_URL to that host (see
 * .env.local), so a freshly uploaded photo's `url` is absolute and points at a
 * host this sandbox cannot reach — `net::ERR_TUNNEL_CONNECTION_FAILED`, which
 * the console guard above would fail the test on even before the unreachable
 * request could time the locator out.
 */
import { expect, test } from "../helpers/test";
import { TEST_ADMIN } from "../helpers/auth";
import { budget } from "../helpers/budget";
import { recordCreated } from "../helpers/created";

/** Same fixture shape as gallery-videos.spec.ts: a real ftyp box, sniffed as video/mp4. */
const MP4_HEADER = Buffer.concat([
  Buffer.from("00000018", "hex"),
  Buffer.from("ftypmp42"),
  Buffer.from("00000000", "hex"),
  Buffer.from("mp42isom"),
  Buffer.alloc(1024),
]);

/** 1×1 transparent GIF, answered in-process so no request reaches the server. */
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

test.describe("V-MEDIASHARE /gallery/m/[mediaId] serves one public photo or video", () => {
  let mediaId: number | null = null;

  test.afterEach(async ({ request }) => {
    if (mediaId === null) return;
    const id = mediaId;
    mediaId = null;
    await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    const deleted = await request.delete(`/api/media/${id}`);
    if (!deleted.ok() && deleted.status() !== 404) {
      throw new Error(`teardown failed to delete media/${id}: ${deleted.status()}`);
    }
  });

  test("V-MEDIASHARE-T1: a gallery photo's share page renders it", async ({
    page,
    request,
  }) => {
    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    const stamp = Date.now();
    const filename = `v-mediashare-photo-${stamp}.svg`;
    const created = await request.post("/api/media", {
      multipart: {
        file: {
          name: filename,
          mimeType: "image/svg+xml",
          buffer: Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="#059669"/></svg>',
          ),
        },
        _payload: JSON.stringify({ alt: `V-MEDIASHARE photo ${stamp}`, usage: "gallery" }),
      },
    });
    expect(created.ok(), `media create failed: ${created.status()}`).toBeTruthy();
    const doc = (await created.json()).doc as { id: number };
    mediaId = doc.id;
    recordCreated({ collection: "media", id: doc.id, note: "V-MEDIASHARE photo probe" });

    await page.route(/\/api\/media\/file\/|images\.wildrunner\.org/, (route) =>
      route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL }),
    );

    await page.goto(`/gallery/m/${doc.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(`img[src*="${filename}"]`).first()).toBeVisible({
      timeout: budget(15_000),
    });
  });

  test("V-MEDIASHARE-T2: a gallery video's share page renders it at the unified route", async ({
    page,
    request,
  }) => {
    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    const stamp = Date.now();
    const uploaded = await request.post("/api/media", {
      multipart: {
        file: {
          name: `v-mediashare-video-${stamp}.mp4`,
          mimeType: "video/mp4",
          buffer: MP4_HEADER,
        },
        _payload: JSON.stringify({
          alt: `V-MEDIASHARE video ${stamp}`,
          usage: "gallery",
        }),
      },
    });
    expect(uploaded.ok(), `media upload failed: ${uploaded.status()}`).toBeTruthy();
    const doc = (await uploaded.json()).doc as { id: number };
    mediaId = doc.id;
    recordCreated({ collection: "media", id: doc.id, note: "V-MEDIASHARE video probe" });

    await page.goto(`/gallery/m/${doc.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("video").first()).toBeVisible({ timeout: budget(15_000) });
  });

  test("V-MEDIASHARE-T3: a non-gallery file is never reachable by id", async ({ request }) => {
    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    const stamp = Date.now();
    const created = await request.post("/api/media", {
      multipart: {
        file: {
          name: `v-mediashare-private-${stamp}.svg`,
          mimeType: "image/svg+xml",
          buffer: Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"></svg>',
          ),
        },
        _payload: JSON.stringify({
          alt: `V-MEDIASHARE disclosure probe ${stamp}`,
          usage: "attachment",
        }),
      },
    });
    expect(created.ok(), `media create failed: ${created.status()}`).toBeTruthy();
    const doc = (await created.json()).doc as { id: number };
    mediaId = doc.id;
    recordCreated({ collection: "media", id: doc.id, note: "V-MEDIASHARE disclosure probe" });

    // No cookies — a real anonymous request against the page route itself,
    // not the REST API (which already has its own, separately-tested rule).
    const anon = await request.get(`/gallery/m/${doc.id}`);
    expect(
      anon.status(),
      "a file that is not usage='gallery' must 404 on the share route, whatever its id",
    ).toBe(404);
  });

  test("V-MEDIASHARE-T4: the old /gallery/v/[mediaId] address redirects to the new one", async ({
    request,
  }) => {
    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    const stamp = Date.now();
    const uploaded = await request.post("/api/media", {
      multipart: {
        file: {
          name: `v-mediashare-redirect-${stamp}.mp4`,
          mimeType: "video/mp4",
          buffer: MP4_HEADER,
        },
        _payload: JSON.stringify({
          alt: `V-MEDIASHARE redirect probe ${stamp}`,
          usage: "gallery",
        }),
      },
    });
    expect(uploaded.ok(), `media upload failed: ${uploaded.status()}`).toBeTruthy();
    const doc = (await uploaded.json()).doc as { id: number };
    mediaId = doc.id;
    recordCreated({ collection: "media", id: doc.id, note: "V-MEDIASHARE redirect probe" });

    const redirected = await request.get(`/gallery/v/${doc.id}`, { maxRedirects: 0 });
    expect(redirected.status(), "the old share URL must be a permanent redirect").toBe(308);
    expect(redirected.headers()["location"]).toContain(`/gallery/m/${doc.id}`);
  });
});
