import { pinyin } from "pinyin-pro";

import { toSimplified } from "@/lib/i18n/to-simplified";

/**
 * The checks `scripts/narrate-local.ts` makes on every piece it narrates.
 *
 * Pure, and kept out of the script so they can be tested without a TTS server:
 * each of them decides whether hours of audio are published or regenerated,
 * and each was written against something that measurably went wrong in post
 * 31's narration — transcribed back with Qwen3-ASR, piece by piece:
 *
 *   - `加油打气❤️` came out as 「嗯」, and `服务🌹` as 「服务，叔」. The emoji was
 *     not skipped; the voice made a sound for it, and swallowed the words
 *     before it.
 *   - `七大马里最难的` came out as 「最难的」 — four characters never said.
 *   - one 55-character paragraph took 26.8 s, nine pauses of 0.7-1.2 s in it,
 *     and passed the length check because the words were all there.
 */

/**
 * The text as a voice should receive it: no emoji, no pictographs.
 *
 * Not in `pronounce()`, deliberately. That runs inside `articleSegments`, whose
 * output is what `articleAudioKeyForPost` hashes — moving the strip there would
 * change the key of every narration already on production, and orphan them.
 * This is applied to the copy handed to the voice and nothing else.
 *
 * `\p{Extended_Pictographic}` is the emoji set Unicode itself defines; U+FE0F
 * (the emoji presentation selector), U+200D (the joiner inside 👨‍👩‍👧) and U+20E3
 * (the keycap in 1️⃣) are what is left of a sequence once its pictographs are
 * gone, and regional indicators are the two halves of a flag.
 *
 * A dash that opens or closes a sentence goes too. Post 33's subtitle is
 * `——2026 UTMB Mont-Blanc百英里纪实`, and four tries in a row the voice
 * began it with laughter — heard back as 「哈哈哈哈哈，哈哈」. A dash *inside* a
 * sentence (`TMB——Tour du Mont Blanc`) is a pause the voice reads correctly,
 * ten times in that article, so it stays.
 */
export function speakable(text: string): string {
  return text
    .replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\u{FE0F}\u{200D}\u{20E3}]/gu, "")
    .replace(/\s+/gu, " ")
    .replace(/^[\s—–~～-]+|[\s—–~～-]+$/gu, "");
}

/**
 * Numerals in either script, and the 点 of `3点` / 「三点」.
 *
 * Removed from both sides before comparing, because how a number is written
 * and how it is heard never agree: the script says `2024`, the voice says
 * 二零二四, and the recogniser may write either. Removing them symmetrically
 * gives up checking the numbers themselves — the rewrite step (`spokenScript`'s
 * prompt) is what decides how those are said — and keeps every other character
 * comparable.
 */
const NUMERALS = /[0-9０-９零〇一二两三四五六七八九十百千万亿点]/gu;

/**
 * What a transcript and its text are compared on: the sound of each
 * character — toneless pinyin for Chinese, the letter for anything else.
 *
 * SOUNDS, NOT CHARACTERS, because a recogniser hears sounds and then guesses
 * the characters. Compared as characters, post 31's 「纽马」 heard as 「牛马」,
 * 「于我」 as 「与我」 and 「它那些」 as 「他那些」 scored the paragraph exactly
 * as badly as the one where the voice skipped four characters outright — the
 * recogniser's mistakes and the voice's were indistinguishable. As pinyin the
 * first is 0 and the second is still four.
 *
 * A run of Latin letters is one sound, however it is spelled: a recogniser
 * writes 「Verazano」 for `Verrazzano` and 「MOMI」 for `MoMA`, and counting
 * those letter by letter would fail every paragraph with an English name in
 * it for a mistake the voice did not make.
 *
 * 的, 地 and 得 are one sound as particles, and a recogniser writes 的 for all
 * three: 「杂乱地堆叠」 came back as 「杂乱的堆叠」, said correctly, and the
 * pinyin of 地 as a noun failed the piece. They are made one character on both
 * sides, so 土地 heard as 土地 still matches.
 *
 * Simplified first, because the corpus has articles in both scripts and the
 * pinyin of a few Traditional forms is resolved better that way; letters only
 * because punctuation is the recogniser's guess at where the pauses were,
 * which is not what is being checked.
 */
export function comparable(text: string): string[] {
  const letters = toSimplified(text.normalize("NFKC"))
    .toLowerCase()
    .replace(NUMERALS, "")
    .replace(/[地得]/gu, "的")
    .replace(/[^\p{L}]/gu, "");
  return letters ? pinyin(letters, { toneType: "none", type: "array", nonZh: "consecutive" }) : [];
}

function levenshtein(x: string[], y: string[]): number {
  let previous = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= y.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[y.length];
}

/**
 * Sounds that differ between what was meant and what was heard, as
 * insertions, deletions and substitutions — a count, not a fraction, because
 * a fraction is what hid the worst piece in post 31: 「十六，毫无公里」 for
 * `16-18公里` is two wrong sounds in a hundred-character paragraph, 0.02 of
 * it, and nonsense to anyone listening.
 */
export function editDistance(expected: string, heard: string): number {
  return levenshtein(comparable(expected), comparable(heard));
}

/**
 * The sounds `after` adds to `before`, or null if it also loses any.
 */
function addedSounds(before: string[], after: string[]): string[] | null {
  const table = Array.from({ length: before.length + 1 }, () => new Array<number>(after.length + 1).fill(0));
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      table[i][j] = before[i] === after[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  if (table[0][0] !== before.length) return null;
  const added: string[] = [];
  for (let i = 0, j = 0; j < after.length; ) {
    if (i < before.length && before[i] === after[j] && table[i][j] === table[i + 1][j + 1] + 1) {
      i += 1;
      j += 1;
    } else {
      added.push(after[j]);
      j += 1;
    }
  }
  return added;
}

/**
 * The words that saying a number aloud adds, as `comparable` spells them:
 * 小时 分 钟 秒, 到 至 for a range, 第 for a rank, 每公里 for a pace, 个 半, and
 * the calendar's 年 月 日 号 岁. The numerals themselves are not compared at
 * all (`NUMERALS`).
 */
const NUMBER_WORDS = new Set([
  "xiao", "shi", "fen", "zhong", "miao", "dao", "zhi", "di", "mei", "gong", "li",
  "ge", "ban", "nian", "yue", "ri", "hao", "sui",
]);

/**
 * Whether a rewrite only changed how numbers are said.
 *
 * `spokenScript`'s line count catches a merged or dropped sentence and not a
 * reworded one, and the local model rewords a great deal. Run over post 33 it
 * turned `Sub 30` — under thirty hours, for a hundred-mile race — into
 * 「三小时以内」 a dozen times, `30小时内完赛` into 「三十分钟内完赛」,
 * `23小时32分09秒` into 「二十三日三十二分零九秒」, and 视频 into 影片 wherever
 * it appeared. Every one of those reads fluently, and every one is wrong.
 *
 * Whether a number was said *correctly* takes judgement this cannot have. But
 * saying a number only ever ADDS words — `415` becomes 「每公里四分十五秒」 —
 * and never needs to remove one, so that is the test: every sound of the
 * original survives in order, and what is added is drawn from `NUMBER_WORDS`,
 * six per number actually rewritten. Each mistake above removed something
 * (小时, sub, 视频). The cost is the prompt's own `300兔子` → 「三小时配速员」,
 * which replaces a word and is refused with them; that line is said as
 * written, which is always the safe answer.
 */
export function rewriteKeepsWords(original: string, rewritten: string): boolean {
  const numbers = (original.match(/\d+/gu) ?? []).filter((run) => !rewritten.includes(run)).length;
  const added = addedSounds(comparable(original), comparable(rewritten));
  return added !== null && added.length <= numbers * 6 && added.every((sound) => NUMBER_WORDS.has(sound));
}

export type Wav = { rate: number; samples: Int16Array };

/**
 * Silence inside a piece longer than `maxPause` is shortened to it, and the
 * silence at either end is trimmed to `edge`.
 *
 * Measured: the same 47-character sentence, generated five times at
 * temperature 0.6, came back with 0.9 s to 5.2 s of pauses of half a second or
 * more. The words were right every time — the pause length is simply another
 * thing the model samples — so regenerating until it comes out short would be
 * a lottery, and this is deterministic. The ends matter for the same reason:
 * the script puts a fixed gap between pieces, and whatever silence the model
 * left at the start and end of each was being added to it at random.
 *
 * Cut from the middle of each run, so the decay of the word before and the
 * onset of the word after are kept; a run is silence only below -40 dBFS on
 * the levelled signal, where a cut makes no audible click.
 */
export function tidyPauses(wav: Wav, { maxPause, edge }: { maxPause: number; edge: number }): Wav {
  const { rate, samples } = wav;
  const frame = Math.max(1, Math.round(rate * 0.01));
  const frames = Math.ceil(samples.length / frame);
  const silent: boolean[] = [];
  for (let f = 0; f < frames; f += 1) {
    const start = f * frame;
    const end = Math.min(samples.length, start + frame);
    let sum = 0;
    for (let i = start; i < end; i += 1) sum += (samples[i] / 32768) ** 2;
    silent.push(sum / (end - start) < 1e-4);
  }

  const first = silent.indexOf(false);
  if (first === -1) return { rate, samples: new Int16Array(0) };
  const last = silent.lastIndexOf(false);

  const keep: [number, number][] = [];
  const edgeFrames = Math.round(edge / 0.01);
  const maxFrames = Math.round(maxPause / 0.01);
  let from = Math.max(0, first - edgeFrames);
  for (let f = first; f <= last; ) {
    if (!silent[f]) {
      f += 1;
      continue;
    }
    let run = f;
    while (run <= last && silent[run]) run += 1;
    if (run - f > maxFrames) {
      const half = Math.floor(maxFrames / 2);
      keep.push([from, f + half]);
      from = run - (maxFrames - half);
    }
    f = run;
  }
  keep.push([from, Math.min(frames, last + 1 + edgeFrames)]);

  const parts = keep.map(([a, b]) => samples.subarray(a * frame, Math.min(samples.length, b * frame)));
  const out = new Int16Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return { rate, samples: out };
}
