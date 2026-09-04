/**
 * The languages this site is published in, and the one it is written in.
 *
 * ONE LOCALE TODAY, ON PURPOSE. This module and the `[lang]` segment it
 * feeds are the seam the rest of the three-language work is built on: the
 * routing, the document language and the URL shape all move here first,
 * while the site still says exactly what it said before. A second entry in
 * `LOCALES` is then a change to this list rather than a change to the shape
 * of the app.
 *
 * THE TAGS ARE SCRIPT TAGS, NOT REGIONS — `zh-Hant`, not `zh-TW`. That
 * follows `(site)/layout.tsx`'s own reasoning about `<html lang>`: the
 * script is what is true of this site, and its readers are a Vancouver club
 * rather than a region. `zh-Hans` will be the same kind of statement.
 *
 * THE PATH SEGMENT IS LOWER-CASE and separate from the tag. A URL is typed,
 * mailed and pasted by people; `/zh-hant/posts` survives that and
 * `/zh-Hant/posts` does not, because a path is case-sensitive and nobody
 * holds shift for a language tag. The tag is what `<html lang>` and
 * `hreflang` need to be correct; the segment is what a person types.
 */
export const LOCALES = [
  { segment: "zh-hant", tag: "zh-Hant", label: "繁體中文" },
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
