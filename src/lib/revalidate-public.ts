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

export function revalidateForGallery(
  slug: string | null | undefined,
  videoIds: string[] = [],
): void {
  const paths = [...STATIC_PATHS];
  if (slug) {
    paths.push(`/gallery/${slug}`);
    for (const videoId of videoIds) {
      paths.push(`/gallery/${slug}/v/${encodeURIComponent(videoId)}`);
    }
  }
  revalidatePaths(paths);
}
