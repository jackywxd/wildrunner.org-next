import type { SiteGallery, SitePost, SiteVideo } from "@/lib/content-types";
import {
  getGalleryBySlug as getGalleryBySlugFromPayload,
  getGalleryVideo as getGalleryVideoFromContent,
} from "@/lib/content";

export async function getGalleryBySlug(
  slug: string,
): Promise<SiteGallery | null> {
  return getGalleryBySlugFromPayload(slug);
}

export function getGalleryVideo(
  gallerySlug: string,
  videoId: string,
): Promise<
  { gallery: SiteGallery; video: SiteVideo } | undefined
> {
  return getGalleryBySlugFromPayload(gallerySlug).then((gallery) => {
    if (!gallery) return undefined;
    return getGalleryVideoFromContent(gallery, videoId);
  });
}

export type { SitePost, SiteGallery, SiteVideo };
