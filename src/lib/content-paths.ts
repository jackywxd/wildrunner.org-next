/** Public URL for a post (Payload slug may be `2024/utmb` or legacy `posts/2024/utmb`). */
export function postPublicPath(slug: string): string {
  const normalized = slug.replace(/^\/+/, "");
  if (normalized.startsWith("posts/")) {
    return `/${normalized}`;
  }
  return `/posts/${normalized}`;
}

export function postSlugParams(slug: string): string {
  const normalized = slug.replace(/^\/+/, "");
  if (normalized.startsWith("posts/")) {
    return normalized.slice("posts/".length);
  }
  return normalized;
}
