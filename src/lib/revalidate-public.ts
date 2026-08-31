import { revalidatePaths } from "@/lib/utils/cache";
import { postPublicPath } from "@/lib/content-paths";

const STATIC_PATHS = ["/", "/posts", "/gallery", "/about", "/riders"];

export function revalidateForRider(slug: string | null | undefined): void {
  const paths = [...STATIC_PATHS];
  if (slug) {
    paths.push(`/riders/${slug}`);
  }
  revalidatePaths(paths);
}

export function revalidatePublicSite(extraPaths?: string[]): void {
  revalidatePaths([...STATIC_PATHS, ...(extraPaths ?? [])]);
}

export function revalidateForPost(slug: string | null | undefined): void {
  const paths = [...STATIC_PATHS];
  if (slug) {
    paths.push(postPublicPath(slug));
  }
  revalidatePaths(paths);
}

/**
 * Deliberately NOT STATIC_PATHS.
 *
 * That list is blasted by every post, gallery and rider write, and `/races`
 * depends on none of them. The reverse holds too: a schedule edit changes
 * nothing on `/posts` or `/riders`. Only `/` is shared, because the
 * homepage carries the upcoming-races teaser.
 *
 * Both pages are `force-dynamic`, so this is belt-and-braces today — but it
 * is also the thing that would keep them correct if either is ever switched
 * to ISR, which is why the daily maintenance job calls it too.
 */
export function revalidateForRaceSchedule(): void {
  revalidatePaths(["/", "/races"]);
}

/**
 * No `videoIds` parameter, deliberately.
 *
 * It used to add `/gallery/<slug>/v/<videoId>` for each of an album's videos.
 * The only caller fed it `doc.videos[].videoId`, and `galleries.videos` has
 * not existed since #95 merged the two arrays into `items` — so every call had
 * been passing `[]` for weeks, silently. A parameter that can structurally
 * only receive an empty list reads as coverage and is not any.
 *
 * Losing it costs nothing today: those share pages are `force-dynamic`, and
 * revalidating a route that is never cached does nothing. If they are ever
 * cached, the ids now live on `media.legacyVideoId` and an album save would
 * need a query to reach them — that is the work, and it belongs with whatever
 * change starts caching those pages.
 */
export function revalidateForGallery(slug: string | null | undefined): void {
  const paths = [...STATIC_PATHS];
  if (slug) {
    paths.push(`/gallery/${slug}`);
  }
  revalidatePaths(paths);
}
