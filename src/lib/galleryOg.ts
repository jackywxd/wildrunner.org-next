import type { SiteGallery } from "@/lib/content-types";
import { photosOf } from "@/lib/media/gallery-items";
import type { OgCard } from "@/lib/og-card";

// `items` rather than the old `images`: an OG image is always a picture, so
// both functions below narrow to the photos once and then read them exactly as
// they did before.
type GalleryLike = Pick<
  SiteGallery,
  "name" | "slug" | "cover" | "featured" | "items"
>;

/**
 * An album's card: its cover, else its featured picture, else its first, else
 * a card seeded on the album's own slug.
 *
 * A CARD, NOT A URL, for the reason `resolvePostOgCard` gives. The last rung
 * used to be `${baseURL}/og?title=…` built here, which is why this file needed
 * to know the base URL at all; it no longer does.
 */
export function resolveGalleryOgCard(gallery: GalleryLike): OgCard {
  const src = resolveGalleryCoverSrc(gallery);
  if (src) return { kind: "photo", src };
  // An album with no pictures in it yet still IS an album, so it gets its own
  // colours rather than the site's furniture card.
  return { kind: "rainbow", seed: gallery.slug };
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
