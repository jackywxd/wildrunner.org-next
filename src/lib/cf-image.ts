import type { Media } from "@/payload-types";

/** Absolute or site-relative URL suitable for `next/image` `src`. */
export function mediaImageSrc(media: Media | null | undefined): string {
  if (!media?.url) return "";
  if (media.url.startsWith("http://") || media.url.startsWith("https://")) {
    return media.url;
  }
  return media.url.startsWith("/") ? media.url : `/${media.url}`;
}

export function mediaDimensions(
  media: Media | null | undefined,
  fallback: { width: number; height: number } = { width: 1200, height: 800 },
): { width: number; height: number } {
  return {
    width: media?.width ?? fallback.width,
    height: media?.height ?? fallback.height,
  };
}
