/**
 * The decisions behind "the text follows the voice", apart from the DOM.
 *
 * Everything here is arithmetic on numbers the browser hands over, so the
 * rules that can go wrong silently — which paragraph is highlighted, whether
 * to follow at all, whether the page needs to move — are asserted by the unit
 * lane. `src/components/posts/narration/follow.ts` owns the events and the
 * elements; this owns what to do with what they report.
 */

import type { Timing } from "./narration-timing";

/**
 * Whether a table may drive the page. ANY ONE FAILURE MEANS NO FOLLOWING, and
 * the reader loses nothing but a highlight, which is the whole reason the bar
 * is this high: a wrong highlight is stated with the same confidence as a right
 * one.
 *
 * - `lines`: the table describes `titled + sum(blocks)` lines. A different
 *   count means the table was made from a different script and every line
 *   after the first difference points at the wrong paragraph.
 * - `duration`: the table was measured on a file, and `?force=true` can
 *   replace the file under an unchanged key. The tolerance is `resumePoint`'s,
 *   for the same reason: browsers estimate a VBR MP3's length slightly
 *   differently from ffprobe.
 * - `segs`: nothing on the page carries a tag (stale narration, or a tree that
 *   did not match the plan), so there is nothing to highlight.
 */
export function canFollow(input: {
  timing: Pick<Timing, "lines" | "duration">;
  expectedLines: number;
  audioDuration: number;
  segCount: number;
}): boolean {
  const { timing, expectedLines, audioDuration, segCount } = input;
  if (segCount < 1) return false;
  if (timing.lines !== expectedLines) return false;
  if (!Number.isFinite(audioDuration) || audioDuration <= 0) return false;
  return Math.abs(timing.duration - audioDuration) <= Math.max(1, audioDuration * 0.005);
}

/** What a script line maps to on the page. */
export type Target = { kind: "title" } | { kind: "block"; index: number };

/**
 * The thing to highlight for script line `line`.
 *
 * `segs` is the `data-seg` value of every tagged block, in document order
 * (ascending). Line 0 is the title when `titled`; after that, line `n` is body
 * sentence `n - titled`. The block is the LAST one that starts at or before
 * that sentence — a block holds several sentences, and the table only knows
 * which line is being read, not which block that line is in.
 *
 * Null when there is nothing to show: no tagged blocks, or a table whose
 * first sentence precedes the first tagged block (cannot happen with a
 * well-formed plan, but a null is cheaper than a guess).
 */
export function targetForLine(
  segs: readonly number[],
  line: number,
  titled: boolean,
): Target | null {
  if (line < 0 || segs.length === 0) return null;
  const sentence = line - (titled ? 1 : 0);
  if (sentence < 0) return { kind: "title" };

  let low = 0;
  let high = segs.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (segs[mid] <= sentence) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found < 0 ? null : { kind: "block", index: found };
}

/** The strip of the viewport where the block being read is kept. */
export type Band = { top: number; bottom: number };

/**
 * `headerBottom` is the bottom edge of the sticky site header, `playerHeight`
 * the sticky player's height (0 when it is not stuck). The band starts 16px
 * below both and covers the upper 45% of what is left: a reader looks at the
 * upper part of a screen while listening, and a block parked at the very top is
 * under the player on a phone while one at the bottom is about to scroll away.
 */
export function readingBand(
  headerBottom: number,
  playerHeight: number,
  viewportHeight: number,
): Band {
  const top = headerBottom + playerHeight + 16;
  return { top, bottom: top + Math.max(0, viewportHeight - top) * 0.45 };
}

/**
 * How far to scroll (positive = down the page) to bring a block whose top edge
 * is `blockTop` into the band, or null when it is already there.
 *
 * Only the TOP edge is judged. A paragraph longer than the screen is "in the
 * band" while its top is, and re-centring it as it is read would make the text
 * crawl under the reader's eyes.
 */
export function scrollDelta(blockTop: number, band: Band): number | null {
  if (blockTop >= band.top && blockTop <= band.bottom) return null;
  return blockTop - band.top;
}
