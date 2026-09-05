/**
 * The languages this site is published in, and the one it is written in.
 *
 * TWO LOCALES, AND THE SECOND COST ONE LINE HERE. That was
 * the whole point of the seam: the routing, the document language, the URL
 * shape, the font, `hreflang` and the sitemap all read this list, so
 * publishing a language is an entry in it plus a dictionary — not a change to
 * the shape of the app.
 *
 * THE ORDER IS THE ORDER THE SWITCHER SHOWS. Default first.
 *
 * ENGLISH WAS HERE AND WAS TAKEN OUT, and the reason is worth keeping: an
 * English *interface* shipped, but no English *content* ever did — every
 * article, and even `/about`'s body (which comes from the `site` global), was
 * Chinese underneath English chrome. A reader who cannot read Chinese was
 * promised a site that did not exist and found out three pages in. Browser
 * translation serves that reader better than a shell does, and it serves
 * every other language too.
 *
 * The two that remain are not a shell: `/zh-hans` is a complete Simplified
 * edition, because `to-simplified.ts` converts the stored Traditional at
 * request time. Both languages here are ones the whole site is readable in.
 *
 * `label` IS WRITTEN IN ITS OWN LANGUAGE, always — 繁體中文, 简体中文.
 * A switcher that named the languages in the language you are
 * already reading is useless to the one reader who needs it: somebody who
 * cannot read this page has to recognise their own language on sight. That
 * is also why neither name is ever translated into the dictionary.
 *
 * `short` is what the header has room for; `label` is what a screen reader
 * and a title attribute get. 繁 and 简 are the characters those two scripts
 * name themselves by, and they differ from each other in both scripts, which
 * a pair like 中文/中文 would not.
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
  { segment: "zh-hant", tag: "zh-Hant", label: "繁體中文", short: "繁" },
  { segment: "zh-hans", tag: "zh-Hans", label: "简体中文", short: "简" },
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
