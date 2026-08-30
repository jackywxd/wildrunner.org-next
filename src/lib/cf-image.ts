import type { Media } from "@/payload-types";

/**
 * URL suitable for `next/image` `src`.
 *
 * Payload prefixes stored media URLs with its `serverURL`, so on a dev or
 * preview origin the value arrives as e.g.
 * `http://localhost:3000/api/media/file/x.png`. next/image rejects that —
 * an absolute URL's hostname has to be listed in `images.remotePatterns`,
 * and localhost never will be ("Invalid src prop ... hostname is not
 * configured"). Stripping our own origin back to a relative path keeps
 * those images working everywhere, and leaves genuinely remote URLs (the
 * R2 CDN) untouched so they still match remotePatterns.
 *
 * Takes the one field it reads rather than a whole `Media`, so a `select`ed
 * document from src/lib/content.ts satisfies it. A full `Media` still does.
 */
export function mediaImageSrc(media: Pick<Media, "url"> | null | undefined): string {
  if (!media?.url) return "";

  const url = media.url;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    const ownOrigin = process.env.NEXT_PUBLIC_SITE_URL;
    if (ownOrigin && url.startsWith(ownOrigin)) {
      const relative = url.slice(ownOrigin.replace(/\/$/, "").length);
      return relative.startsWith("/") ? relative : `/${relative}`;
    }
    return url;
  }

  return url.startsWith("/") ? url : `/${url}`;
}

export function mediaDimensions(
  media: Pick<Media, "width" | "height"> | null | undefined,
  fallback: { width: number; height: number } = { width: 1200, height: 800 },
): { width: number; height: number } {
  return {
    width: media?.width ?? fallback.width,
    height: media?.height ?? fallback.height,
  };
}
