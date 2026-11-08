import { articleScript } from "@/lib/reader/article-audio";
import { articleSegments } from "@/lib/reader/article-text";

import { comparable, speakable } from "./narration-check";

/**
 * How `scripts/narrate-local.ts` turns what it knows about its own pieces into
 * the per-line start times of `<key>.json` (format: `src/lib/reader/narration-timing.ts`).
 *
 * Pure and kept out of the script for the reason `narration-check.ts` is: a
 * wrong answer here is invisible. The MP3 plays, the page highlights a
 * paragraph, and nothing says it is the wrong one.
 *
 * WHAT IS EXACT AND WHAT IS NOT. The script concatenates pieces with known
 * silences between them, so where each PIECE starts is arithmetic: the lengths
 * of everything before it, plus the gaps, divided by the tempo. Where a
 * sentence starts INSIDE a piece is not known — `tidyPauses` reshaped the
 * waveform and the voice paced the sentences itself — so those are spread by
 * how many syllables each has. That is why the table says `precision: "block"`:
 * trust the paragraph, not the sentence.
 *
 * THE MEASURED DURATION IS BOTH A CHECK AND A CORRECTION. The sum of the pieces
 * should land within a fraction of a second of what ffprobe says the MP3 is;
 * if it does not, something this arithmetic does not model happened (a wrong
 * `--tempo`, a piece swapped, a gap changed) and every start would drift
 * further the later it is — the 7-hour file ends up a minute out. So that is
 * refused outright. Within tolerance, the starts are scaled to the measured
 * length, which absorbs encoder padding without moving anything noticeably.
 */

/** A piece as `narrate-local` knows it after generation. */
export type TimedPiece = {
  /** Length of the tidied audio, before `atempo`. */
  seconds: number;
  /** Silence inserted after it; the last piece has none in the file. */
  gapAfter: number;
  /** Which `articleScript` lines it speaks, in order. */
  lines: number[];
  /** The spoken text of each of those lines, parallel to `lines`. */
  sentences: string[];
};

/** How far the arithmetic may be from ffprobe before it is not trusted. */
export const DURATION_TOLERANCE_SECONDS = 0.5;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * One start per line of the script, `lineCount` of them.
 *
 * A line no piece speaks (a sentence that was only an emoji) takes the start of
 * the next spoken line, so it lasts no time; trailing ones take the end.
 * Throws if the unscaled total is more than `DURATION_TOLERANCE_SECONDS` from
 * `measuredDuration`.
 */
export function piecesToStarts(
  pieces: readonly TimedPiece[],
  tempo: number,
  measuredDuration: number,
  lineCount: number,
): number[] {
  if (!(tempo > 0)) throw new Error(`tempo must be positive, got ${tempo}`);

  const raw: (number | undefined)[] = new Array(lineCount).fill(undefined);
  let offset = 0;
  pieces.forEach((piece, index) => {
    const length = piece.seconds / tempo;
    // Syllables, not characters: 「3 个」 and 「三个」 are the same length aloud.
    // A sentence with none still gets a sliver, so it cannot share a start
    // with its neighbour on a technicality.
    const weights = piece.sentences.map((sentence) => Math.max(comparable(sentence).length, 1));
    const total = weights.reduce((a, b) => a + b, 0);
    let before = 0;
    piece.lines.forEach((line, i) => {
      if (line < 0 || line >= lineCount) throw new Error(`piece ${index + 1} names line ${line} of ${lineCount}`);
      raw[line] = offset + (length * before) / total;
      before += weights[i];
    });
    // The silence after the last piece is not in the file.
    offset += length + (index === pieces.length - 1 ? 0 : piece.gapAfter / tempo);
  });

  if (Math.abs(offset - measuredDuration) > DURATION_TOLERANCE_SECONDS) {
    throw new Error(
      `the pieces add up to ${offset.toFixed(2)} s but the MP3 measures ${measuredDuration.toFixed(2)} s ` +
        `— the tempo or the pieces are not the ones this file was made from, and a table scaled to fit ` +
        `would point later and later into it`,
    );
  }

  // Unspoken lines inherit the next spoken start, scanning from the end.
  let next = offset;
  const filled = raw.map(() => 0);
  for (let line = lineCount - 1; line >= 0; line -= 1) {
    next = raw[line] ?? next;
    filled[line] = next;
  }

  const scale = offset > 0 ? measuredDuration / offset : 1;
  return filled.map((start) => round2(Math.min(Math.max(start * scale, 0), measuredDuration)));
}

/**
 * Run `build` and report a refusal as a reason instead of an exception.
 *
 * After hours of generation, a table that does not add up must not take the
 * finished MP3's publish commands with it: the narration is checked on its own
 * (ASR, `review.txt`). The caller prints the reason and goes on without the table.
 */
export function attempt<T>(build: () => T): { value: T } | { refused: string } {
  try {
    return { value: build() };
  } catch (error) {
    return { refused: (error as Error).message };
  }
}

/** A sentence and the line of `articleScript` it is. */
export type Numbered = { line: number; text: string };

/**
 * One request to the voice. `lines` are the `articleScript` line numbers it
 * speaks and `sentences` what was said for each, parallel — the timing table
 * is made from them, and they have to survive `speakable` dropping a sentence,
 * which is why they are carried rather than recounted afterwards.
 */
export type Chunk = { text: string; gapAfter: number; lines: number[]; sentences: string[] };

/**
 * The article as blocks of sentences: the title alone, then each top-level
 * block of the body. Throws if they are not `articleScript(...)`, line for line.
 *
 * Built from `articleSegments` run over one block at a time, and checked
 * against `articleScript` over the whole article — the text the key is hashed
 * from — so the caller refuses to narrate something the key does not describe.
 *
 * THE CHECK IS LINE FOR LINE, not on the text with whitespace removed. The
 * timing table says "line i starts at t", and line i is a position in
 * `articleScript(...).split("\n")`; a split that merged or moved a line would
 * keep every character and still put every later start on the wrong line.
 */
export function articleBlocks(title: string, content: unknown): string[][] {
  const body = ((content as { root?: { children?: unknown[] } } | null)?.root?.children ?? []).map((block) =>
    articleSegments({ root: { type: "root", children: [block] } }),
  );
  const out = [...(title ? [[title]] : []), ...body].filter((sentences) => sentences.length > 0);

  const script = articleScript(title, content).split("\n");
  const flat = out.flat();
  if (flat.length !== script.length || flat.some((sentence, i) => sentence !== script[i])) {
    throw new Error(
      "splitting by block does not reproduce articleScript line for line — refusing to narrate text the key does not describe",
    );
  }
  return out;
}

/**
 * Sentences back into running text: nothing after a full-width mark, a space
 * after anything else, so English prose reads "Canada. It's" and not
 * "Canada.It's".
 */
export function joinSentences(sentences: string[]): string {
  return sentences.reduce(
    (text, sentence) => (!text || /[\u3000-\u303f\uff00-\uffef」』）]$/.test(text) ? text + sentence : `${text} ${sentence}`),
    "",
  );
}

/**
 * Blocks into requests: each block one piece, a long one split at sentence
 * boundaries into pieces of at most `maxChars`. A piece never spans a block,
 * and each keeps the line numbers of the sentences in it.
 */
export function packBlocks(
  spokenBlocks: readonly (readonly Numbered[])[],
  { maxChars, chunkGap, blockGap }: { maxChars: number; chunkGap: number; blockGap: number },
): Chunk[] {
  const out: Chunk[] = [];
  for (const sentences of spokenBlocks) {
    let current: Numbered[] = [];
    const flush = (gapAfter: number) => {
      if (current.length) {
        out.push({
          text: joinSentences(current.map((sentence) => sentence.text)),
          gapAfter,
          lines: current.map((sentence) => sentence.line),
          sentences: current.map((sentence) => sentence.text),
        });
      }
      current = [];
    };
    for (const sentence of sentences) {
      if (current.length && joinSentences([...current.map((s) => s.text), sentence.text]).length > maxChars) {
        flush(chunkGap);
      }
      current.push(sentence);
    }
    flush(blockGap);
  }
  return out;
}

/**
 * What the voice is given, with each sentence's line.
 *
 * `spoken` has the shape of `articleBlocks`' output (the number rewrite is line
 * for line), so a sentence's line is its position in the flattened list. The
 * number is taken BEFORE `speakable` and the drop of what it empties: a
 * sentence that was only an emoji vanishes there, and counting afterwards
 * would put every later sentence one line early.
 */
export function numberSpoken(spoken: readonly (readonly string[])[]): Numbered[][] {
  let line = 0;
  return spoken.map((sentences) =>
    sentences.map((text) => ({ line: line++, text: speakable(text) })).filter((sentence) => sentence.text),
  );
}
