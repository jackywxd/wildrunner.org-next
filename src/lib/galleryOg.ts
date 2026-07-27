import type { SiteGallery } from "@/lib/content-types";

type GalleryLike = Pick<SiteGallery, "name" | "cover" | "featured" | "images">;

/**
 * Prefer R2 CDN URLs for social crawlers; avoid /_next/image which Workers
 * may not optimize the same way for unauthenticated bots.
 * Returns a direct image URL, or `${baseURL}/og?title=...` when no photo exists.
 */
export function resolveGalleryOgImage(
  gallery: GalleryLike,
  baseURL: string
): string {
  if (gallery.cover?.src) {
    if (gallery.cover.src.startsWith("http")) return gallery.cover.src;
    const coverStem = gallery.cover.src
      .split("/")
      .pop()
      ?.replace(/\.[^.]+$/, "");
    const matchedCover = coverStem
      ? gallery.images.find(
          (image) => image.filename.replace(/\.[^.]+$/, "") === coverStem
        )?.src
      : undefined;
    if (matchedCover) return matchedCover;
  }

  const firstFeaturedSlug = gallery.featured[0];
  const featuredSrc = firstFeaturedSlug
    ? gallery.images.find(
        (image) =>
          image.filename.replace(/\.[^.]+$/, "") === firstFeaturedSlug
      )?.src
    : gallery.images.find((image) => image.featured)?.src;
  if (featuredSrc) return featuredSrc;

  const firstSrc = gallery.images[0]?.src;
  if (firstSrc) return firstSrc;

  return `${baseURL}/og?title=${encodeURIComponent(gallery.name)}`;
}

/** Cover/featured photo URL only — never the /og fallback (for use as /og background). */
export function resolveGalleryCoverSrc(
  gallery: GalleryLike
): string | undefined {
  if (gallery.cover?.src) {
    if (gallery.cover.src.startsWith("http")) return gallery.cover.src;
    const coverStem = gallery.cover.src
      .split("/")
      .pop()
      ?.replace(/\.[^.]+$/, "");
    const matchedCover = coverStem
      ? gallery.images.find(
          (image) => image.filename.replace(/\.[^.]+$/, "") === coverStem
        )?.src
      : undefined;
    if (matchedCover) return matchedCover;
  }

  const firstFeaturedSlug = gallery.featured[0];
  const featuredSrc = firstFeaturedSlug
    ? gallery.images.find(
        (image) =>
          image.filename.replace(/\.[^.]+$/, "") === firstFeaturedSlug
      )?.src
    : gallery.images.find((image) => image.featured)?.src;
  if (featuredSrc) return featuredSrc;

  return gallery.images[0]?.src;
}

/** Composite OG image URL for a gallery video share page. */
export function buildVideoOgImageUrl(opts: {
  baseURL: string;
  title: string;
  subtitle: string;
  coverSrc?: string;
}): string {
  const params = new URLSearchParams();
  params.set("title", opts.title);
  params.set("subtitle", opts.subtitle);
  if (opts.coverSrc?.startsWith("http")) {
    params.set("image", opts.coverSrc);
  }
  return `${opts.baseURL}/og?${params.toString()}`;
}
