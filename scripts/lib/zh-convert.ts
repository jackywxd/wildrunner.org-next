import * as OpenCC from "opencc-js";

/**
 * 繁體 ↔ 簡體, in both directions, for the interface and for articles.
 *
 * WHY THIS LIVES UNDER `scripts/` AND NOT `src/lib/`. `opencc-js` carries
 * 6.1MB of dictionaries. Nothing under `scripts/` is ever bundled into the
 * Worker, so putting it here makes that a structural fact rather than a rule
 * somebody has to remember: `src/dictionaries/zh-Hans.json` is *generated*
 * and committed, and the site reads the finished JSON. The article sweep this
 * grows into is a script too.
 *
 * WHY OPENCC RATHER THAN A CHARACTER TABLE. 繁 → 簡 is nearly one-to-one and
 * a hand-written map would pass for the 274 characters this site's interface
 * happens to use today. 簡 → 繁 is not: 发 is 發 or 髮, 干 is 幹 or 乾 or 干,
 * 后 is 后 or 後, and only the surrounding word decides. Measured against
 * OpenCC's own phrase dictionaries:
 *
 *     头发 → 頭髮    干活 → 幹活    干净 → 乾淨    饼干 → 餅乾
 *     理发 → 理髮    皇后 → 皇后    后面 → 後面    钟表 → 鐘錶
 *
 * Every one of those is right, and none of them is derivable from a character
 * map. A converter that is wrong in one direction is worse than no converter,
 * because the article it mangles reads as the author's own mistake.
 *
 * THE GLOSSARY IS DELIBERATELY TINY. It holds only two kinds of entry: a
 * conversion that produces something that is not a word at all, and a term
 * this site is inconsistent about in its own source. It does **not** localise
 * Taiwanese vocabulary into mainland vocabulary — 影片, 資訊, 裝置, 檢視 all
 * survive conversion unchanged and are left that way on purpose. The reason
 * is the constraint the plan is built on: articles are converted by this same
 * module, so a glossary that rewrote 影片 to 视频 in the interface while an
 * author's own 影片 stayed put in their article would produce exactly the two
 * vocabularies for one thing that converting at all is meant to prevent.
 */

/**
 * Applied to OpenCC's output, in Simplified.
 *
 * Written in the target script rather than the source so that a reviewer sees
 * the words that will actually be on the page.
 */
const TO_SIMPLIFIED_GLOSSARY: readonly (readonly [string, string])[] = [
  // 轉檔 converts character-by-character to 转档, which is not a word in
  // Simplified Chinese. Cloudflare Stream's step is 转码.
  ["转档", "转码"],
  // The site says both 相冊 and 相簿 for one thing — `gallery.albumTitle` and
  // `albums.*` disagree in the Traditional dictionary. 相册 is the ordinary
  // Simplified word, so the Simplified side is where they stop disagreeing.
  ["相簿", "相册"],
];

/** Applied to OpenCC's output, in Traditional. The mirror of the above. */
const TO_TRADITIONAL_GLOSSARY: readonly (readonly [string, string])[] = [
  ["轉檔", "轉碼"],
];

/**
 * `from: "tw"` rather than `"t"` — the declaration of what is being converted
 * *from*, which is what this site is written in. Measured over the whole
 * interface dictionary the two produce identical output today; saying "tw" is
 * what stays true when a Taiwan-specific phrase does show up.
 */
const openccToSimplified = OpenCC.Converter({ from: "tw", to: "cn" });
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

const simplifiedGlossary = glossaryPass(TO_SIMPLIFIED_GLOSSARY);
const traditionalGlossary = glossaryPass(TO_TRADITIONAL_GLOSSARY);

/** 繁體 → 簡體. */
export function toSimplified(text: string): string {
  return simplifiedGlossary(openccToSimplified(text));
}

/** 簡體 → 繁體. */
export function toTraditional(text: string): string {
  return traditionalGlossary(openccToTraditional(text));
}

/** Every glossary entry, so a test can assert about the table itself. */
export const GLOSSARY = {
  toSimplified: TO_SIMPLIFIED_GLOSSARY,
  toTraditional: TO_TRADITIONAL_GLOSSARY,
} as const;
