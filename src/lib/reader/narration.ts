import "server-only";

import { publicMediaUrl } from "@/lib/media-url";
import { getR2Bucket } from "@/lib/r2-bucket";

/**
 * Whether this article has narration, and where.
 *
 * R2 IS THE INDEX. There is no column to read and no table to join: the key
 * carries the post id and a hash of the script, so `head()` answers both "has
 * this been narrated" and "is that narration still the right one" in a single
 * call with no schema behind it. `article-audio.ts` explains why that shape
 * was chosen over `posts.audioKey`.
 *
 * NEVER THROWS, AND THAT IS LOAD-BEARING RATHER THAN DEFENSIVE. This runs
 * inside the article page's server render, including at build time where
 * `getPublishedPostSlugs` prerenders every post — and `getR2Bucket` throws
 * outright when there is no binding, which is exactly the situation in a
 * process that is not handling a request. An article that cannot check for
 * narration must render as an article, not as an error page: the reader falls
 * back to `ArticleReader` and the device's own voice, which is what every
 * visitor had before any of this existed.
 */
/**
 * Takes the KEY, not the article: the page holds the article as the reader
 * reads it, which on the Simplified site is not the text the narration was
 * made from. `getPostBySlugParam` works the key out from the stored words
 * before converting anything — see `SitePost.narrationKey`.
 */
export async function narrationUrl(key: string): Promise<string | null> {
  try {
    const bucket = await getR2Bucket();
    return (await bucket.head(key)) ? publicMediaUrl(key) : null;
  } catch {
    // Deliberately silent. A missing binding is the ordinary case in a
    // prerender and would otherwise log once per post on every build.
    return null;
  }
}
