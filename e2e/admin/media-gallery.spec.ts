import { expect, test } from "@playwright/test";

import { ensureAdminUser } from "../helpers/auth";
import { expectOkJson, uploadMedia } from "../helpers/api";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

test.describe("P1 media, gallery and global", () => {
  test("P1-T6/T7: upload image and video, then attach to gallery", async ({
    request,
  }) => {
    await ensureAdminUser(request);
    const suffix = Date.now();

    const imageDoc = await uploadMedia(request, {
      alt: `test image ${suffix}`,
      name: `p1-image-${suffix}.png`,
      mimeType: "image/png",
      buffer: ONE_PIXEL_PNG,
    });
    expect(imageDoc.mimeType).toBe("image/png");
    expect(imageDoc.url).toBeTruthy();

    const original = await request.get(String(imageDoc.url));
    expect(original.ok()).toBeTruthy();
    expect(original.headers()["content-type"]).toContain("image/png");

    const videoDoc = await uploadMedia(request, {
      alt: `test video ${suffix}`,
      name: `p1-video-${suffix}.mp4`,
      mimeType: "video/mp4",
      buffer: Buffer.from([
        0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32,
        0x00, 0x00, 0x00, 0x00, 0x6d, 0x70, 0x34, 0x32, 0x6d, 0x70, 0x34, 0x31,
      ]),
    });
    expect(videoDoc.mimeType).toBe("video/mp4");

    const galleryBody = await expectOkJson(
      await request.post("/api/galleries", {
        data: {
          name: `P1 Gallery ${suffix}`,
          slug: `p1-gallery-${suffix}`,
          cover: imageDoc.id,
          images: [{ media: imageDoc.id, featured: true }],
          videos: [{ media: videoDoc.id, videoId: `video-${suffix}` }],
          _status: "published",
        },
      }),
    );
    const galleryDoc = galleryBody.doc ?? galleryBody;
    expect(galleryDoc.images).toHaveLength(1);
    expect(galleryDoc.videos).toHaveLength(1);
  });

  test("P1-T9: changing Site hero is visible on home", async ({
    request,
    page,
  }) => {
    await ensureAdminUser(request);

    // The Site global is a singleton shared with real content — this test
    // runs against the same database the site serves from. Capture the real
    // value first and put it back in a finally, or the staging (and later
    // production) homepage is left showing "Payload Hero <timestamp>".
    // That has happened twice; restoring the data by hand without fixing
    // the test just let it recur.
    const before = await expectOkJson(
      await request.get("/api/globals/site?depth=0"),
    );
    const originalHeroZh = before.heroTitleZh;

    const hero = `Payload Hero ${Date.now()}`;
    try {
      await expectOkJson(
        await request.post("/api/globals/site", {
          data: { heroTitleZh: hero },
        }),
      );

      await expect
        .poll(
          async () => {
            // Unique query per poll: pages ship max-age=3600, so re-visiting
            // the same URL would replay the browser's cached copy.
            await page.goto(`/?hero-poll=${Date.now()}`);
            return page.getByText(hero, { exact: true }).count();
          },
          { timeout: 15_000 },
        )
        .toBe(1);
    } finally {
      await request.post("/api/globals/site", {
        data: { heroTitleZh: originalHeroZh },
      });
    }
  });
});
