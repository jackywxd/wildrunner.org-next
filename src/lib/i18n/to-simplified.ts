import * as OpenCC from "opencc-js/t2cn";

import type { LocaleSegment } from "./locales";

/**
 * 繁體 → 簡體, at request time, inside the Worker.
 *
 * WHY THIS IS IN `src/lib/` WHEN ITS SIBLING IS UNDER `scripts/`. The rule
 * that kept OpenCC out of the Worker was measured against the wrong artifact.
 * `scripts/lib/zh-convert.ts` imports the package root, which is *both*
 * directions, and that is where the "6.1MB of dictionaries" came from. This
 * site is written in Traditional and read in Simplified, so it needs one
 * direction, and the package ships it as its own documented entry point:
 *
 *     full.js   (both)      1,195,473 raw   497,270 gzip
 *     cn2t.js   (簡 → 繁)   1,100,656 raw   452,719 gzip
 *     t2cn.js   (繁 → 簡)     109,333 raw    52,588 gzip   ← this one
 *
 * 51KB gzipped is not a bundle problem, and what it buys is that the
 * Simplified article is *derived* rather than stored: there is no second copy
 * of an article to fall out of date, no migration, and no sweep to re-run
 * after an author fixes a typo. It is the same decision `zh-Hans.json`
 * already embodies for the interface, moved from build time to request time
 * because articles change and the interface does not.
 *
 * THE GLOSSARY LIVES HERE, NOT IN THE SCRIPT, and the script imports it back.
 * One table, two callers — the generator that writes `zh-Hans.json` and the
 * renderer that converts an article. Two copies would let the interface and
 * the article it frames disagree about the same word, which is the one thing
 * converting instead of translating is for.
 *
 * The 簡 → 繁 direction is deliberately NOT here. Nothing renders it: an
 * author writing in Simplified is not something this site supports today, and
 * that direction costs 453KB gzipped — nine times this one — so it stays in
 * `scripts/`, where it is free, until something actually needs it.
 */

/**
 * Applied to OpenCC's output, in Simplified.
 *
 * Written in the target script rather than the source so that a reviewer sees
 * the words that will actually be on the page.
 *
 * DELIBERATELY TINY, and the bar has not changed now that articles run
 * through it: only a conversion that produces something that is not a word,
 * and a term this site is inconsistent about in its own source. It does
 * **not** localise Taiwanese vocabulary into mainland vocabulary — 影片,
 * 資訊, 裝置, 檢視 all survive unchanged on purpose. An author's 影片 inside
 * an article converts to 影片; rewriting the interface's to 视频 would put
 * two words for one thing on the same page, which is exactly what converting
 * rather than translating is meant to avoid.
 */
export const TO_SIMPLIFIED_GLOSSARY: readonly (readonly [string, string])[] = [
  // 轉檔 converts character-by-character to 转档, which is not a word in
  // Simplified Chinese. Cloudflare Stream's step is 转码.
  ["转档", "转码"],
  // The site says both 相冊 and 相簿 for one thing — `gallery.albumTitle` and
  // `albums.*` disagree in the Traditional dictionary. 相册 is the ordinary
  // Simplified word, so the Simplified side is where they stop disagreeing.
  ["相簿", "相册"],
];

/**
 * `from: "tw"` rather than `"t"` — the declaration of what is being converted
 * *from*, which is what this site is written in. Measured over the whole
 * interface dictionary the two produce identical output today; saying "tw" is
 * what stays true when a Taiwan-specific phrase does show up.
 */
const opencc = OpenCC.Converter({ from: "tw", to: "cn" });

/**
 * A longest-match pass rather than a chain of `String.replace`.
 *
 * OpenCC's own Trie, so the glossary behaves like the dictionaries it sits on
 * top of: one left-to-right scan, longest key wins, and a replacement can
 * never be re-matched by a later entry.
 */
const glossary = (() => {
  if (TO_SIMPLIFIED_GLOSSARY.length === 0) return (text: string) => text;
  const trie = new OpenCC.Trie();
  for (const [from, to] of TO_SIMPLIFIED_GLOSSARY) trie.addWord(from, to);
  return (text: string) => trie.convert(text);
})();

/** 繁體 → 簡體. */
export function toSimplified(text: string): string {
  return glossary(opencc(text));
}

/**
 * The one locale whose text is derived rather than stored.
 *
 * `satisfies LocaleSegment` rather than an index into `LOCALES`: naming the
 * segment says which locale this is, and the constraint makes a typo or a
 * renamed locale a compile error. Reading `LOCALES[1]` would survive both,
 * and would quietly start converting a different language the day somebody
 * reorders the list the switcher is drawn from. The constraint also catches
 * the confusion that has already cost this project once — `zh-Hans` is the
 * IETF tag and `zh-hans` is the URL segment, and only one of them is this.
 */
const SIMPLIFIED_SEGMENT = "zh-hans" satisfies LocaleSegment;

/**
 * Whether `locale` is rendered by converting what is stored.
 *
 * ONE PLACE DECIDES WHICH LOCALES ARE DERIVED, and today that is exactly one.
 * The default locale is what the site is written in, so it is returned
 * untouched — and `en` is too, because the English *interface* ships from its
 * own dictionary while English *prose* does not exist yet. Running Chinese
 * through a script converter would put Simplified under an English page,
 * which is not a translation of anything.
 */
export function isSimplified(locale: string): boolean {
  return locale === SIMPLIFIED_SEGMENT;
}

/** A stored string as `locale` should read it. See `isSimplified`. */
export function localiseText(text: string, locale: string): string {
  return isSimplified(locale) ? toSimplified(text) : text;
}
