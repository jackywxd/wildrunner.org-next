import type { SitePost } from "@/lib/content-types";

import { isSimplified, toSimplified } from "./to-simplified";

/**
 * An article, in Simplified, derived from the Traditional one it is stored as.
 *
 * WHY A NAMED LIST OF FIELDS RATHER THAN A DEEP CONVERSION OF THE POST. A
 * `SitePost` carries prose and addresses in the same object, and the
 * addresses must survive untouched: `slug` and `slugAsParams` are the URL the
 * article is published at — the one `next.config.ts` rewrites, the one
 * printed into share cards already sitting in other people's chat histories —
 * and converting a character in it would produce a 404 rather than a
 * translation. `authorSlug`, `image.src` and `musicPlaylist` are addresses
 * for the same reason. So the four fields a reader actually reads are named
 * here, and anything added to `SitePost` later is left alone until somebody
 * decides it is prose.
 *
 * `author` IS CONVERTED, and that is a decision rather than an oversight. A
 * Chinese name in Traditional and in Simplified is one name in two scripts,
 * not two names — 張 and 张 are the same person. Leaving the byline alone
 * would put one Traditional word under an otherwise Simplified article, which
 * is the "two words for one thing" this whole approach exists to avoid.
 */
export function toSimplifiedPost(post: SitePost): SitePost {
  return {
    ...post,
    title: toSimplified(post.title),
    description: toSimplified(post.description),
    author: post.author === undefined ? undefined : toSimplified(post.author),
    content:
      post.content === undefined
        ? undefined
        : (toSimplifiedRichText(post.content) as SitePost["content"]),
  };
}

/**
 * Every text node in a Lexical tree, converted; every other node copied.
 *
 * WHY IT WALKS THE WHOLE TREE BUT ONLY TOUCHES `text` ON A `type: "text"`
 * NODE. Those two halves answer different risks. Walking everything is what
 * reaches prose the shape of the document cannot predict — an upload node's
 * caption is itself a rich text tree, and a list is text nested several
 * levels down — so a walk that only knew about top-level paragraphs would
 * convert an article's body and silently skip the caption under its photo.
 *
 * Touching only `text` on a text node is what keeps the walk from converting
 * things that are not prose: a link node carries its address in
 * `fields.url`, an upload node carries `value` and `relationTo`, and every
 * node carries `type`, `format` and `tag`. Those are all strings, and a
 * conversion that went by "is it a string" would rewrite a URL's characters
 * and turn `type: "paragraph"` into something Lexical cannot render. The
 * visible text of a link lives in its child text nodes, so a link's words
 * convert and its destination does not.
 */
export function toSimplifiedRichText<T>(node: T): T {
  if (Array.isArray(node)) {
    return node.map((child) => toSimplifiedRichText(child)) as unknown as T;
  }
  if (node === null || typeof node !== "object") return node;

  const source = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const isTextNode = source.type === "text" && typeof source.text === "string";

  for (const [key, value] of Object.entries(source)) {
    out[key] =
      isTextNode && key === "text"
        ? toSimplified(value as string)
        : toSimplifiedRichText(value);
  }
  return out as T;
}

/**
 * The article as `locale` should read it.
 *
 * The locale decision itself lives in `to-simplified.ts` and is shared with
 * the site name in the page title, so an article and the chrome around it
 * can never disagree about which script the page is in.
 */
export function localisePost(post: SitePost, locale: string): SitePost {
  return isSimplified(locale) ? toSimplifiedPost(post) : post;
}
