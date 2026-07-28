import { revalidatePaths } from "@/lib/utils/cache";
import { postPublicPath } from "@/lib/content-paths";

const STATIC_PATHS = ["/", "/posts", "/gallery", "/about"];

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
