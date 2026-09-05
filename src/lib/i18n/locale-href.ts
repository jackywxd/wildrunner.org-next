import { DEFAULT_LOCALE, isLocaleSegment } from "./locales";
import { LOCALIZED_SEGMENTS } from "./rewrites";

/**
 * The address `href` should have, for a reader currently at `pathname`.
 *
 * WHY THIS EXISTS AT ALL. `localizedPath` answers "what is this page called
 * in language X" — it is what the language switcher, the sitemap and
 * `canonical`/`hreflang` need, and every one of them already knows which
 * language it means. An ordinary link is the other question: it does not
 * name a language, it should simply *stay* in the one the reader chose. That
 * distinction was missing, and the consequence was that `/zh-hans` lasted
 * exactly one click — 72 internal links across the app, every one of them
 * hard-coded to the unprefixed address, which `next.config.ts` rewrites to
 * the default locale.
 *
 * `LOCALIZED_SEGMENTS` DECIDES, NOT "DOES IT START WITH A SLASH". The first
 * version of this used the latter and would have shipped two dead links: the
 * member shell's `/admin` and an article's `/print/...`, both rendered by
 * pages that are themselves under `[lang]`, and neither of which exists with
 * a prefix. That list is the same one `next.config.ts` rewrites, so the
 * question it answers here — "is there a copy of this address under
 * `[lang]`?" — is the question it was already answering there, and the two
 * cannot drift. It also settles the switcher's own links for free: a `href`
 * that already names a language has `zh-hant`/`zh-hans` as its first
 * segment, which is not in the list, so it comes back untouched.
 *
 * PURE, AND SEPARATE FROM THE COMPONENT, so the rules below can be tested
 * without a renderer, a router or a browser. `LocaleLink` is the thin part.
 */
export function localeHref(href: string, pathname: string): string {
  // Not ours to touch: absolute URLs, protocol-relative, mailto/tel, and
  // in-page anchors and bare queries, which stay on the page they are on.
  if (!href.startsWith("/") || href.startsWith("//")) return href;

  const [, first = ""] = pathname.split("/");
  // The reader is on the default locale (an unprefixed address), or outside
  // `[lang]` entirely — `/admin`, `/print/...`. Both keep what they have:
  // the default locale IS the unprefixed address, and the other trees have
  // no language to carry.
  if (!isLocaleSegment(first) || first === DEFAULT_LOCALE) return href;

  if (href !== "/" && !isLocalizedSegment(segmentOf(href))) return href;

  return href === "/" ? `/${first}` : `/${first}${href}`;
}

/**
 * The first path segment of an internal href.
 *
 * IT ENDS AT `?` AND `#` AS WELL AS `/`. The rider and race chips link to
 * `/riders?badge=…` and `/races?view=calendar`; a segment read only up to the
 * next slash would be `riders?badge=six-majors`, match nothing in the list,
 * and leave every filter chip on the page pointing out of the reader's
 * language.
 */
function segmentOf(href: string): string {
  return href.slice(1).split(/[/?#]/)[0] ?? "";
}

function isLocalizedSegment(segment: string): boolean {
  return (LOCALIZED_SEGMENTS as readonly string[]).includes(segment);
}
