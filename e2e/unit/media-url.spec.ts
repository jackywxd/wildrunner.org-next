import { expect, test } from "@playwright/test";

import { mediaDimensions, mediaImageSrc } from "@/lib/cf-image";

/**
 * U-IMG — turning a stored media url into something next/image accepts.
 *
 * next/image rejects an absolute URL whose hostname is not in
 * `images.remotePatterns`, and "localhost" never will be. Payload prefixes
 * stored urls with `serverURL`, so on dev and preview origins every image
 * arrives absolute — and the failure is a thrown "Invalid src prop", i.e. a
 * blank page, not a missing image.
 *
 * Genuinely remote urls (the R2 CDN) must survive untouched, or they stop
 * matching remotePatterns and fail the same way from the other direction.
 */
/**
 * `process.env` is typed from cloudflare-env.d.ts, where these keys are
 * required string literals — so TypeScript refuses both `delete` and a
 * plain assignment. The cast is to the shape Node actually has.
 */
const env = process.env as unknown as Record<string, string | undefined>;

test.describe("U-IMG media url", () => {
  const withOrigin = <T,>(origin: string | undefined, run: () => T): T => {
    const previous = env.NEXT_PUBLIC_SITE_URL;
    if (origin === undefined) delete env.NEXT_PUBLIC_SITE_URL;
    else env.NEXT_PUBLIC_SITE_URL = origin;
    try {
      return run();
    } finally {
      if (previous === undefined) delete env.NEXT_PUBLIC_SITE_URL;
      else env.NEXT_PUBLIC_SITE_URL = previous;
    }
  };

  const media = (url: string | null) => ({ url }) as never;

  test("U-IMG-1: our own origin is stripped back to a relative path", () => {
    withOrigin("http://localhost:3000", () => {
      expect(mediaImageSrc(media("http://localhost:3000/api/media/file/a.png"))).toBe(
        "/api/media/file/a.png",
      );
    });
    // A trailing slash on the configured origin must not eat the leading
    // slash of the path.
    withOrigin("https://wildrunner.org/", () => {
      expect(mediaImageSrc(media("https://wildrunner.org/api/media/file/a.png"))).toBe(
        "/api/media/file/a.png",
      );
    });
  });

  test("U-IMG-2: a genuinely remote url is left exactly as it is", () => {
    withOrigin("https://wildrunner.org", () => {
      const cdn = "https://images.wildrunner.org/posts/2024/utmb/cover.webp";
      expect(mediaImageSrc(media(cdn))).toBe(cdn);
    });
  });

  test("U-IMG-3: a relative url is normalised, and nothing is normalised to undefined", () => {
    expect(mediaImageSrc(media("api/media/file/a.png"))).toBe("/api/media/file/a.png");
    expect(mediaImageSrc(media("/api/media/file/a.png"))).toBe("/api/media/file/a.png");
    // Missing media must yield "", never undefined — next/image throws on the
    // latter and renders nothing on the former.
    expect(mediaImageSrc(media(null))).toBe("");
    expect(mediaImageSrc(null)).toBe("");
    expect(mediaImageSrc(undefined)).toBe("");
  });

  test("U-IMG-4: dimensions fall back only when they are missing", () => {
    expect(mediaDimensions({ width: 800, height: 600 } as never)).toEqual({
      width: 800,
      height: 600,
    });
    // The 1200x800 fallback is what a member's browser-measured upload avoids;
    // when it is used, the aspect ratio is a guess and the layout shifts.
    expect(mediaDimensions(null)).toEqual({ width: 1200, height: 800 });
    expect(mediaDimensions({ width: null, height: null } as never)).toEqual({
      width: 1200,
      height: 800,
    });
  });
});
