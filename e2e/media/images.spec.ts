import { expect, test } from "../helpers/test";
import sharp from "sharp";

import { ensureAdminUser } from "../helpers/auth";
import { expectOkJson, uploadMedia } from "../helpers/api";

test.describe("P2 Cloudflare image optimization paths", () => {
  test("P2-T10/T11: gallery image uses Next optimizer and negotiates format", async ({
    request,
    page,
  }) => {
    await ensureAdminUser(request);
    const suffix = Date.now();
    const source = await sharp({
      create: {
        width: 1200,
        height: 800,
        channels: 3,
        background: { r: 80, g: 40, b: 160 },
      },
    })
      .png()
      .toBuffer();

    const media = await uploadMedia(request, {
      alt: `optimizer fixture ${suffix}`,
      name: `optimizer-${suffix}.png`,
      mimeType: "image/png",
      buffer: source,
    });

    await expectOkJson(
      await request.post("/api/galleries", {
        data: {
          name: `Optimizer gallery ${suffix}`,
          slug: `optimizer-gallery-${suffix}`,
          cover: media.id,
          images: [{ media: media.id, featured: true }],
          _status: "published",
        },
      }),
    );

    await page.goto(`/gallery/optimizer-gallery-${suffix}`);
    const galleryImage = page.locator('img[src*="/_next/image"]').last();
    await expect(galleryImage).toBeVisible();
    const optimizedUrl = await galleryImage.getAttribute("src");
    expect(optimizedUrl).toContain("/_next/image");

    const optimized = await request.get(optimizedUrl!, {
      headers: { Accept: "image/avif,image/webp" },
    });
    expect(optimized.ok()).toBeTruthy();
    expect(optimized.headers()["content-type"]).toMatch(
      /^image\/(avif|webp)/,
    );
    expect((await optimized.body()).byteLength).toBeLessThan(source.byteLength);
  });
});
