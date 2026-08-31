import type { SiteGallery } from "@/lib/content-types";
import { photosOf } from "@/lib/media/gallery-items";

// `items` rather than the old `images`: an OG image is always a picture, so
// both functions below narrow to the photos once and then read them exactly as
// they did before.
type GalleryLike = Pick<SiteGallery, "name" | "cover" | "featured" | "items">;

/**
 * Prefer R2 CDN URLs for social crawlers; avoid /_next/image which Workers
 * may not optimize the same way for unauthenticated bots.
 * Returns a direct image URL, or `${baseURL}/og?title=...` when no photo exists.
 */
export function resolveGalleryOgImage(
  gallery: GalleryLike,
  baseURL: string
): string {
  const images = photosOf(gallery.items);
  if (gallery.cover?.src) {
    if (gallery.cover.src.startsWith("http")) return gallery.cover.src;
    const coverStem = gallery.cover.src
      .split("/")
      .pop()
      ?.replace(/\.[^.]+$/, "");
    const matchedCover = coverStem
      ? images.find(
          (image) => image.filename.replace(/\.[^.]+$/, "") === coverStem
        )?.src
      : undefined;
    if (matchedCover) return matchedCover;
  }

  const firstFeaturedSlug = gallery.featured[0];
  const featuredSrc = firstFeaturedSlug
    ? images.find(
        (image) =>
          image.filename.replace(/\.[^.]+$/, "") === firstFeaturedSlug
      )?.src
    : images.find((image) => image.featured)?.src;
  if (featuredSrc) return featuredSrc;

  const firstSrc = images[0]?.src;
  if (firstSrc) return firstSrc;

  return `${baseURL}/og?title=${encodeURIComponent(gallery.name)}`;
}

/** Cover/featured photo URL only — never the /og fallback (for use as /og background). */
export function resolveGalleryCoverSrc(
  gallery: GalleryLike
): string | undefined {
  const images = photosOf(gallery.items);
  if (gallery.cover?.src) {
    if (gallery.cover.src.startsWith("http")) return gallery.cover.src;
    const coverStem = gallery.cover.src
      .split("/")
      .pop()
      ?.replace(/\.[^.]+$/, "");
    const matchedCover = coverStem
      ? images.find(
          (image) => image.filename.replace(/\.[^.]+$/, "") === coverStem
        )?.src
      : undefined;
    if (matchedCover) return matchedCover;
  }

  const firstFeaturedSlug = gallery.featured[0];
  const featuredSrc = firstFeaturedSlug
    ? images.find(
        (image) =>
          image.filename.replace(/\.[^.]+$/, "") === firstFeaturedSlug
      )?.src
    : images.find((image) => image.featured)?.src;
  if (featuredSrc) return featuredSrc;

  return images[0]?.src;
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
