import { expect, test } from "@playwright/test";

import { ensureAdminUser } from "../helpers/auth";
import { expectOkJson, uploadMedia } from "../helpers/api";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

test.describe("P5 gallery and stream UX", () => {
  test("P5-T1/T2/T4: create gallery with featured image and see public pages", async ({
    request,
    page,
  }) => {
    await ensureAdminUser(request);
    const suffix = Date.now();

    const image = await uploadMedia(request, {
      alt: `p5 cover ${suffix}`,
      name: `p5-cover-${suffix}.png`,
      mimeType: "image/png",
      buffer: ONE_PIXEL_PNG,
    });

    const video = await uploadMedia(request, {
      alt: `p5 video ${suffix}`,
      name: `p5-video-${suffix}.mp4`,
      mimeType: "video/mp4",
      buffer: Buffer.from([
        0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32,
        0x00, 0x00, 0x00, 0x00, 0x6d, 0x70, 0x34, 0x32, 0x6d, 0x70, 0x34, 0x31,
      ]),
    });

    await request.patch(`/api/media/${video.id}`, {
      data: { streamId: null, streamReady: false },
    });

    const galleryName = `P5 Gallery ${suffix}`;
    const slug = `p5-gallery-${suffix}`;
    await expectOkJson(
      await request.post("/api/galleries", {
        data: {
          name: galleryName,
          slug,
          featured: true,
          cover: image.id,
          images: [{ media: image.id, featured: true }],
          videos: [{ media: video.id, videoId: `clip-${suffix}` }],
          _status: "published",
        },
      }),
    );

    await page.goto("/gallery");
    await expect(page.getByText(galleryName)).toBeVisible();

    await page.goto(`/gallery/${slug}`);
    await expect(page.getByRole("heading", { name: galleryName })).toBeVisible();
    await expect(
      page
        .getByRole("group", { name: "Photo album" })
        .locator('img[src*="/_next/image"]')
        .first(),
    ).toBeVisible();

    // Videos play straight from R2 — Cloudflare Stream is a paid
    // per-minute product and isn't in use, so streamId is null and the
    // player falls back to a native <video> pointed at the original file.
    // (This previously asserted the opposite: a "transcoding" placeholder
    // and no video element.)
    await page.goto(`/gallery/${slug}/v/clip-${suffix}`);
    const player = page.getByTestId("direct-video");
    await expect(player).toBeVisible();
    await expect(player).toHaveAttribute("src", /^https?:\/\//);
    await expect(page.getByTestId("stream-processing")).toHaveCount(0);
  });

  test("P5-T5/T6: reject illegal media type and duplicate gallery slug", async ({
    request,
  }) => {
    await ensureAdminUser(request);
    const suffix = Date.now();

    const illegal = await request.post("/api/media", {
      multipart: {
        file: {
          name: "notes.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("not allowed"),
        },
        _payload: JSON.stringify({ alt: "illegal" }),
      },
    });
    expect(illegal.status()).toBeGreaterThanOrEqual(400);

    await expectOkJson(
      await request.post("/api/galleries", {
        data: {
          name: `Slug A ${suffix}`,
          slug: `dup-slug-${suffix}`,
          _status: "published",
        },
      }),
    );

    const duplicate = await request.post("/api/galleries", {
      data: {
        name: `Slug B ${suffix}`,
        slug: `dup-slug-${suffix}`,
        _status: "published",
      },
    });
    expect(duplicate.status()).toBeGreaterThanOrEqual(400);
  });
});
