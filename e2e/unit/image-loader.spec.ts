import { expect, test } from "@playwright/test";

import cloudflareImageLoader from "@/lib/image-loader";

/**
 * U-IMGLOADER — the URL every `<Image>` on the site now resolves to.
 *
 * This replaced `/_next/image`, which ran the transform inside the Worker and
 * threw on a fraction of any burst (see src/lib/image-loader.ts). The failure
 * it caused was invisible to assertions — a page that renders fine while eight
 * of its images 500 — so what has to hold is the URL itself: the right host
 * gets a `/cdn-cgi/image/` prefix, and every host that cannot serve one is
 * handed back untouched rather than pointed at a 404.
 *
 * A string function, so it is tested as one. Rendering a page to read `src`
 * off the DOM would need a server, a browser and a media fixture per case.
 */
test.describe("U-IMGLOADER next/image url building", () => {
  const CDN = "https://images.wildrunner.org";

  test("U-IMGLOADER-1: the R2 CDN gets an edge transform, not a Worker one", () => {
    expect(
      cloudflareImageLoader({ src: `${CDN}/gallery/2026/QMT/IMG_5616.webp`, width: 640 }),
    ).toBe(
      `${CDN}/cdn-cgi/image/width=640,quality=75,format=auto/gallery/2026/QMT/IMG_5616.webp`,
    );
  });

  test("U-IMGLOADER-2: width and quality are the caller's, not defaults", () => {
    expect(
      cloudflareImageLoader({ src: `${CDN}/a.webp`, width: 1920, quality: 90 }),
    ).toBe(`${CDN}/cdn-cgi/image/width=1920,quality=90,format=auto/a.webp`);
  });

  /**
   * `IMG_20260725_105655_00_117(1).jpg` is a real key on the CDN. The
   * parentheses arrive percent-encoded and have to stay that way — decoding
   * them here would produce a URL that resolves to a different object.
   */
  test("U-IMGLOADER-3: an already-encoded key is passed through as it stands", () => {
    const encoded = `${CDN}/IMG_20260725_105655_00_117%281%29.jpg`;
    expect(cloudflareImageLoader({ src: encoded, width: 1200 })).toBe(
      `${CDN}/cdn-cgi/image/width=1200,quality=75,format=auto/IMG_20260725_105655_00_117%281%29.jpg`,
    );
  });

  /**
   * The staging bucket is not a zone: `/cdn-cgi/image/…` on it answers 404,
   * checked against the live host. Rewriting there would replace an
   * occasional broken image with an always-broken one.
   */
  test("U-IMGLOADER-4: a host with no Image Resizing is left alone", () => {
    const r2 = "https://pub-f82e5464c241415f9ea3f879e8f46e7f.r2.dev/gallery/x.webp";
    expect(cloudflareImageLoader({ src: r2, width: 640 })).toBe(r2);
  });

  test("U-IMGLOADER-5: what Payload and the brand assets serve stays relative", () => {
    for (const src of [
      "/api/media/file/gallery--2026--QMT--IMG_5616.webp",
      "/static/brand/lockup-horizontal.svg",
    ]) {
      expect(cloudflareImageLoader({ src, width: 640 }), src).toBe(src);
    }
  });
});
