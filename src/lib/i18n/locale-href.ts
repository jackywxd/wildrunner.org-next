import { DEFAULT_LOCALE, isLocaleSegment } from "./locales";

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

  // Already carrying a language — a link that named one on purpose, such as
  // the switcher's own. Prefixing again would produce `/zh-hans/zh-hans/...`.
  const [, target = ""] = href.split("/");
  if (isLocaleSegment(target)) return href;

  return href === "/" ? `/${first}` : `/${first}${href}`;
}
