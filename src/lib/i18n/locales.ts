/**
 * The languages this site is published in, and the one it is written in.
 *
 * TWO LOCALES, AND THE SECOND ONE COST ONE LINE HERE. That was the whole
 * point of the seam: the routing, the document language, the URL shape and
 * the font all read this list, so publishing 簡體中文 is an entry in it plus
 * a generated dictionary — not a change to the shape of the app.
 *
 * THE ORDER IS THE ORDER A SWITCHER WILL SHOW. Default first.
 *
 * THE TAGS ARE SCRIPT TAGS, NOT REGIONS — `zh-Hant`, not `zh-TW`; `zh-Hans`,
 * not `zh-CN`. That follows `(site)/layout.tsx`'s own reasoning about
 * `<html lang>`: the script is what is true of this site, and its readers are
 * a Vancouver club rather than a region. It is also the honest claim about
 * the Simplified pages, which are a script conversion of the Traditional
 * ones and carry no mainland vocabulary — see `scripts/lib/zh-convert.ts` for
 * why the glossary is kept to two entries.
 *
 * THE PATH SEGMENT IS LOWER-CASE and separate from the tag. A URL is typed,
 * mailed and pasted by people; `/zh-hant/posts` survives that and
 * `/zh-Hant/posts` does not, because a path is case-sensitive and nobody
 * holds shift for a language tag. The tag is what `<html lang>` and
 * `hreflang` need to be correct; the segment is what a person types.
 */
export const LOCALES = [
  { segment: "zh-hant", tag: "zh-Hant", label: "繁體中文" },
  { segment: "zh-hans", tag: "zh-Hans", label: "简体中文" },
] as const;

export type Locale = (typeof LOCALES)[number];
export type LocaleSegment = Locale["segment"];

/** What an address with no language in it means. */
export const DEFAULT_LOCALE: LocaleSegment = "zh-hant";

export const LOCALE_SEGMENTS: readonly string[] = LOCALES.map((l) => l.segment);

export function isLocaleSegment(value: string): value is LocaleSegment {
  return LOCALE_SEGMENTS.includes(value);
}

/** The IETF tag for `<html lang>` and `hreflang`. */
export function localeTag(segment: string): string {
  return LOCALES.find((l) => l.segment === segment)?.tag ?? "zh-Hant";
}

/**
 * The address this page has in `locale`, given its unprefixed path.
 *
 * THE DEFAULT LANGUAGE KEEPS THE BARE ADDRESS. Every URL this site has ever
 * published is unprefixed — the articles, the share cards whose `og:url` is
 * already printed into images in other people's chat histories, the PDFs with
 * the address in their footer. `next.config.ts` rewrites those to `/zh-hant`
 * internally, and this is the outward-facing half of the same decision: the
 * Traditional page's canonical stays what it always was, and only the new
 * language gets a prefix.
 */
export function localizedPath(locale: string, path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (locale === DEFAULT_LOCALE) return clean === "/" ? "/" : clean;
  return clean === "/" ? `/${locale}` : `/${locale}${clean}`;
}
