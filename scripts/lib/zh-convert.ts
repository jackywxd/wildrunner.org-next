import * as OpenCC from "opencc-js";

import { TO_SIMPLIFIED_GLOSSARY, toSimplified } from "../../src/lib/i18n/to-simplified";

/**
 * The 簡 → 繁 direction, and the script-side face of the pair.
 *
 * 繁 → 簡 MOVED TO `src/lib/i18n/to-simplified.ts` and is re-exported from
 * here so every existing caller and test keeps working. It moved because the
 * measurement this file used to justify staying under `scripts/` was taken
 * against the wrong thing: the "6.1MB of dictionaries" is the package root,
 * which carries both directions. Split out, 繁 → 簡 is 52,588 bytes gzipped
 * and 簡 → 繁 is 452,719. One of those belongs in a Worker and the other does
 * not, and until now they were treated as one number.
 *
 * So articles are converted at request time rather than swept into a second
 * stored copy — see that file's header for what that buys — and this one
 * keeps the direction nothing renders.
 *
 * WHY 簡 → 繁 STAYS, unused by the site. It is the reason this is a library
 * call and not a character table, and the reason is worth being able to
 * demonstrate. 繁 → 簡 is nearly one-to-one and a hand-written map would pass
 * for the characters this site's interface happens to use. 簡 → 繁 is not:
 * 发 is 發 or 髮, 干 is 幹 or 乾 or 干, 后 is 后 or 後, and only the
 * surrounding word decides. Measured against OpenCC's own phrase dictionaries:
 *
 *     头发 → 頭髮    干活 → 幹活    干净 → 乾淨    饼干 → 餅乾
 *     理发 → 理髮    皇后 → 皇后    后面 → 後面    钟表 → 鐘錶
 *
 * Every one of those is right, and none is derivable from a character map. A
 * converter that is wrong in one direction is worse than no converter,
 * because the article it mangles reads as the author's own mistake.
 */

export { toSimplified };

/** Applied to OpenCC's output, in Traditional. The mirror of the Simplified one. */
const TO_TRADITIONAL_GLOSSARY: readonly (readonly [string, string])[] = [
  ["轉檔", "轉碼"],
];

const openccToTraditional = OpenCC.Converter({ from: "cn", to: "tw" });

/**
 * A longest-match pass rather than a chain of `String.replace`.
 *
 * OpenCC's own Trie, so the glossary behaves like the dictionaries it sits on
 * top of: one left-to-right scan, longest key wins, and a replacement can
 * never be re-matched by a later entry.
 */
function glossaryPass(entries: readonly (readonly [string, string])[]) {
  if (entries.length === 0) return (text: string) => text;
  const trie = new OpenCC.Trie();
  for (const [from, to] of entries) trie.addWord(from, to);
  return (text: string) => trie.convert(text);
}

const traditionalGlossary = glossaryPass(TO_TRADITIONAL_GLOSSARY);

/** 簡體 → 繁體. */
export function toTraditional(text: string): string {
  return traditionalGlossary(openccToTraditional(text));
}

/**
 * Every glossary entry, so a test can assert about the table itself.
 *
 * The Simplified half is imported rather than restated: the generator that
 * writes `zh-Hans.json` and the renderer that converts an article have to be
 * looking at one table, or the interface and the article it frames can
 * disagree about the same word.
 */
export const GLOSSARY = {
  toSimplified: TO_SIMPLIFIED_GLOSSARY,
  toTraditional: TO_TRADITIONAL_GLOSSARY,
} as const;
