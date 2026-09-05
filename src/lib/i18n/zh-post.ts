import type { SitePost } from "@/lib/content-types";

import type { LocaleSegment } from "./locales";
import { isSimplified, toSimplified } from "./to-simplified";

/** The one locale whose articles are stored rather than derived. */
const ENGLISH_SEGMENT = "en" satisfies LocaleSegment;

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
 * THREE LANGUAGES, THREE DIFFERENT ANSWERS, and they are different in kind:
 *
 *   zh-hant  what is stored, returned untouched
 *   zh-hans  derived from it here, every time, and therefore never stale
 *   en       a stored translation if somebody made one, else the original
 *
 * The English branch is the only one that can come up empty, and it must not
 * answer with a 404: `/en/posts/<slug>` is an address that gets shared and
 * indexed, and translations arrive one article at a time. So an untranslated
 * article renders as written and says so — `untranslated` is what the page
 * reads to show that notice.
 *
 * `english` IS ALWAYS DROPPED from what comes back, in every branch. A
 * component that could still reach the stored translation could render the
 * English title under the Chinese article, and nothing in the type system
 * would object. The one place that decides is this one.
 *
 * A TRANSLATION IS THE TITLE, not the whole group. `english.content` alone,
 * with no `english.title`, is a half-finished edit in `/admin`, and showing
 * an English body under a Chinese heading is worse than showing neither —
 * so the title is what says a translation exists, and the body and
 * description fall back to the original when they are missing.
 */
export function localisePost(post: SitePost, locale: string): SitePost {
  const { english, ...rest } = post;

  if (isSimplified(locale)) return toSimplifiedPost(rest);
  if (locale !== ENGLISH_SEGMENT) return rest;

  if (!english?.title) return { ...rest, untranslated: true };

  return {
    ...rest,
    title: english.title,
    description: english.description || rest.description,
    content: english.content ?? rest.content,
  };
}
