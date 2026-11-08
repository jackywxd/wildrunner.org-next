import { comparable } from "./narration-check";

/**
 * How `scripts/narration-timing.ts` turns a forced aligner that can only look
 * at 300 seconds into a start time for every line of a 20-minute narration.
 *
 * Pure, and kept apart from the aligner process and from ffmpeg, for the reason
 * `narration-timing.ts` is: a wrong answer here is invisible. The MP3 plays,
 * the page highlights a paragraph, and nothing says it is the wrong one. The
 * aligner is injected, so the rules below are asserted against a fake whose
 * true times are known (U-NARRATE-19) instead of trusted.
 *
 * THE PROBLEM. `align-narration.py` refuses audio over 300 s, and these files
 * run 460-1400 s. So the audio is cut into overlapping windows and each is
 * aligned against the lines that belong in it. Which lines belong is not known
 * — that is what we are finding out — so it is estimated from a speaking rate.
 * Every rule below is about that estimate being wrong at the edges.
 *
 * WHAT GOES WRONG AT A WINDOW'S EDGES, and what the three constants answer:
 *
 *  - A window starts at the START of the last accepted line and is fed that
 *    line again, then the new ones. Starting at that line's END was rejected
 *    on measurement: in a 613.5 s file with exact starts, a long kept line
 *    (line 16, starting before the guard) had its END placed 15 s early, at
 *    238.56 s, so the next clip began in the middle of its speech; an end
 *    placed late would instead cut off the onset of the next line. A START in
 *    the kept region is reliable (within 0.24 s there).
 *  - It ends in the middle of a line, and the aligner is handed a transcript
 *    that is only approximately as long as the audio. Given LESS text than the
 *    audio holds, a forced aligner stretches the text over speech that is not
 *    it, and every start in the window drifts late. Given MORE, it crams the
 *    surplus into the last moments. The second error is the one that can be
 *    thrown away, so we always feed more (`OVERFEED`) and discard the tail
 *    (`GUARD`).
 *  - Only the lines that start well before the window's end are kept. The next
 *    window re-reads from the last kept line's start and aligns everything
 *    after it again.
 *
 * THE ONLY AUTOMATIC EVIDENCE THAT WINDOWS AFTER THE FIRST ARE RIGHT is the
 * overlap: lines the previous window placed before its own tail are placed
 * again by the next one, from a different start with different surrounding
 * text. Two independent alignments that agree to within a second or two are very
 * unlikely to share an error. If they disagree the post is refused, and the
 * largest disagreement is reported even on success, so that "passed" can be
 * told apart from "passed because nothing overlapped".
 */

/** Seconds relative to the clip handed to the aligner; null = nothing alignable (punctuation only). */
export type Span = { start: number; end: number } | null;

/**
 * Align `sentences` against the part of the audio from `clipStart` to
 * `clipEnd` (absolute seconds). Returns one span per sentence, RELATIVE to the
 * clip, so forgetting to add `clipStart` back is a bug the tests can see.
 */
export type AlignClip = (clipStart: number, clipEnd: number, sentences: string[]) => Promise<Span[]>;

/**
 * Under the aligner's own 300 s limit, with margin. Its time classes run out at
 * 400 s, and a clip a little over its nominal length (ffmpeg rounds to the
 * sample, an MP3's duration is an estimate) must still be accepted.
 */
export const WINDOW_SECONDS = 280;

/**
 * The tail of a window, in seconds, whose lines are not kept. Surplus text is
 * crammed into the last moments of a clip, and placements start to degrade
 * well before that: measured with the real aligner on a 613.5 s file with exact
 * starts (45 pieces, 0.5 s gaps), the first window's line 17 was -0.52 s out
 * at 26.5 s before the clip's end and line 18 -0.34 s at 18.5 s, while every
 * line more than 60 s from the end was within 0.24 s. So the degradation
 * reaches about 27 s and 60 s is about twice that, cheap enough that every
 * window still advances ~220 s.
 */
export const GUARD_SECONDS = 60;

/**
 * Feed the aligner this much more text than the window's audio should hold.
 * Too little text is silently wrong everywhere (stretched over the whole
 * clip); too much is wrong only in the tail, which `GUARD_SECONDS` discards.
 */
export const OVERFEED = 1.25;

/**
 * Only lines the previous window placed at least this long before its end are
 * compared with the next window's placement of them, so the compared band is
 * [t1 - GUARD, t1 - 40]. At 20 s the band reached into the degraded zone: in
 * the 613.5 s measurement (see `GUARD_SECONDS`) window 1 put line 17 at 253.52 s,
 * 26.5 s before its end, where truth is 254.04 s (-0.52 s), and window 2 put it
 * at 254.08 s (+0.04 s). Comparing those refused a correct table. Past 40 s
 * the worst measured error is 0.24 s.
 */
export const OVERLAP_MARGIN_SECONDS = 40;

/**
 * How far two alignments of the same line may disagree before neither is
 * believed. The check exists to catch windowing that has gone wrong, and that
 * is measured in whole sentences: crammed or degraded lines were 9-80 s out,
 * and a stretch accumulates. It is not there to police sub-second jitter.
 * Ordinary disagreement, worst measured: 0.48 s on post 2's line 34 (window 1
 * counted the pause before it into the line: 221.12 s against 221.60 s, with
 * silence from 221.06 to 221.62 s at -30 dB), and 0.24 s in the kept region of
 * the exact-truth file. A MiniMax line runs 3-8 s, and at `precision: "block"`
 * a highlight 1 s early is invisible, so 1.5 s sits well above jitter and well
 * below a misplaced sentence.
 *
 * A measured TRUE refusal, post 17: a statistics table is read aloud one cell
 * per line, and its numeric cells are digits in the `.txt` but spoken words in
 * the audio. Two windows placed 「推估心率」 (line 210) 7.6 s apart and the header
 * cells 「SE」「t」「p」 (lines 202-204) up to 1.6 s apart. Refusing is the
 * intended outcome there: such an article gets no table and does not follow.
 */
export const OVERLAP_TOLERANCE_SECONDS = 1.5;

/** A start may go backwards by this much (aligner jitter) and be clamped; more is refused. */
export const MAX_BACKWARDS_SECONDS = 0.1;

export type WindowReport = {
  /** Absolute clip bounds. */
  from: number;
  to: number;
  /** First and last line FED to the aligner. */
  fedFrom: number;
  fedTo: number;
  /** First line accepted and the last (inclusive); acceptedTo < acceptedFrom would be nothing, which is refused. */
  acceptedFrom: number;
  acceptedTo: number;
  /**
   * Lines this window and the NEXT both placed (the compared band), and the
   * largest disagreement among them. Zero lines means nothing was compared at
   * this boundary, which is not the same as agreement; the last window has none.
   */
  overlapChecked: number;
  overlapMax: number;
};

export type AlignResult = {
  starts: number[];
  windows: WindowReport[];
  /** Largest disagreement between two windows' placement of the same line; 0 if no line was placed twice. */
  maxOverlapDisagreement: number;
  /** How many lines were placed twice and compared. */
  overlapChecked: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Syllables, as `piecesToStarts` weighs them: 「3 个」 and 「三个」 take the same time aloud. */
const weight = (line: string) => Math.max(comparable(line).length, 1);

/**
 * One start per line, by windowed forced alignment. Throws on any refusal, with
 * the reason; the caller reports it and goes on to the next post.
 */
export async function alignLines({
  lines,
  duration,
  align,
}: {
  lines: readonly string[];
  duration: number;
  align: AlignClip;
}): Promise<AlignResult> {
  const n = lines.length;
  if (n === 0) throw new Error("there are no lines to align");
  if (!(duration > 0)) throw new Error(`duration must be positive, got ${duration}`);

  const weights = lines.map(weight);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  // Syllables per second over the whole file. One rate for all windows: it is
  // only used to decide how much text to feed, and `OVERFEED` absorbs a
  // window that happens to be faster or slower than the average.
  const rate = totalWeight / duration;

  /** Absolute start of every line that was accepted; null where the aligner had nothing to place. */
  const accepted: (number | null | undefined)[] = new Array(n).fill(undefined);
  const windows: WindowReport[] = [];
  /** Absolute starts a window gave to lines it did not keep, for the next window to confirm. */
  let pending = new Map<number, number>();
  let maxOverlapDisagreement = 0;
  let overlapChecked = 0;

  let t0 = 0;
  /** First line to ACCEPT from this window. */
  let k = 0;
  /** First line FED: `k - 1` when the window opens on the last kept line again, else 0. */
  let f = 0;
  while (k < n) {
    const last = duration - t0 <= WINDOW_SECONDS;
    const t1 = last ? duration : t0 + WINDOW_SECONDS;

    let m = n - 1;
    if (!last) {
      // The shortest run of lines the rate says fills the window with OVERFEED to spare.
      let seconds = 0;
      for (let i = f; i < n; i += 1) {
        seconds += weights[i] / rate;
        if (seconds >= (t1 - t0) * OVERFEED) {
          m = i;
          break;
        }
      }
    }

    const spans = await align(t0, t1, lines.slice(f, m + 1) as string[]);
    if (spans.length !== m - f + 1) {
      throw new Error(`the aligner returned ${spans.length} spans for ${m - f + 1} lines in window ${windows.length + 1}`);
    }
    const abs = spans.map((span) => (span ? { start: t0 + span.start, end: t0 + span.end } : null));

    // A line placed by the previous window as well: do the two agree?
    for (const [line, before] of pending) {
      const now = abs[line - f];
      if (!now) continue;
      const gap = Math.abs(now.start - before);
      const boundary = windows[windows.length - 1];
      boundary.overlapChecked += 1;
      boundary.overlapMax = Math.max(boundary.overlapMax, gap);
      overlapChecked += 1;
      maxOverlapDisagreement = Math.max(maxOverlapDisagreement, gap);
      if (gap > OVERLAP_TOLERANCE_SECONDS) {
        throw new Error(
          `line ${line + 1} was placed at ${before.toFixed(2)} s by one window and ${now.start.toFixed(2)} s by the next ` +
            `(${gap.toFixed(2)} s apart, over ${OVERLAP_TOLERANCE_SECONDS} s) — one of the windows is wrong and nothing says which`,
        );
      }
    }
    pending = new Map();

    // Which NEW lines of this window are kept (the refed one is already
    // placed): the longest prefix that starts before the guard. A null span (punctuation only) takes no time and does
    // not end the prefix.
    let j = k - 1;
    if (last) {
      j = n - 1;
    } else {
      for (let i = k; i <= m; i += 1) {
        const span = abs[i - f];
        if (span && span.start >= t1 - GUARD_SECONDS) break;
        j = i;
      }
      // Trailing nulls are not trusted to be "before" anything: the next
      // window re-reads them, and they inherit its next start either way.
      while (j >= k && abs[j - f] === null) j -= 1;
    }

    if (j < k) {
      throw new Error(
        `window ${windows.length + 1} (${t0.toFixed(1)}-${t1.toFixed(1)} s) accepted no line: the first line fed starts ` +
          `after ${(t1 - GUARD_SECONDS).toFixed(1)} s, so the text and the audio are not the same thing`,
      );
    }
    for (let i = k; i <= j; i += 1) accepted[i] = abs[i - f]?.start ?? null;

    windows.push({ from: t0, to: t1, fedFrom: f, fedTo: m, acceptedFrom: k, acceptedTo: j, overlapChecked: 0, overlapMax: 0 });

    if (last) break;

    for (let i = j + 1; i <= m; i += 1) {
      const span = abs[i - f];
      if (span && span.start <= t1 - OVERLAP_MARGIN_SECONDS) pending.set(i, span.start);
    }

    // The next window opens on the START of the last kept line, which is in the
    // reliable part of this one, and feeds that line again before the new ones
    // (see the header for why not its end). The refed line is not accepted
    // again and is not compared: its start in the next window is that window's
    // clip start by construction, which is this window's own number, so
    // comparing it is not independent evidence.
    const next = (abs[j - f] as { start: number }).start;
    if (!(next > t0)) {
      throw new Error(`window ${windows.length} made no progress in time: line ${j + 1} starts at ${next.toFixed(2)} s, not after ${t0.toFixed(2)} s`);
    }
    t0 = next;
    k = j + 1;
    f = j;
  }

  return { starts: assemble(accepted, duration), windows, maxOverlapDisagreement, overlapChecked };
}

/**
 * Starts for every line from what the aligner placed.
 *
 * A line it could not place (null) takes the NEXT line's start, so it lasts no
 * time — as `piecesToStarts` does for an unspoken line — and trailing ones take
 * the duration. A start slightly before the previous one is aligner jitter and
 * is clamped up; a larger step back means two windows have been stitched
 * wrongly, and clamping it would hide that.
 */
export function assemble(placed: readonly (number | null | undefined)[], duration: number): number[] {
  const filled: number[] = new Array(placed.length);
  let next = duration;
  for (let i = placed.length - 1; i >= 0; i -= 1) {
    const value = placed[i];
    if (value === undefined) throw new Error(`line ${i + 1} was never placed`);
    next = value ?? next;
    filled[i] = next;
  }

  const out: number[] = [];
  let previous = 0;
  filled.forEach((raw, i) => {
    const clamped = Math.min(Math.max(raw, 0), duration);
    if (previous - clamped > MAX_BACKWARDS_SECONDS) {
      throw new Error(
        `line ${i + 1} starts at ${clamped.toFixed(2)} s, ${(previous - clamped).toFixed(2)} s before line ${i} ` +
          `(${previous.toFixed(2)} s) — time ran backwards where two windows meet`,
      );
    }
    previous = Math.max(previous, clamped);
    out.push(round2(previous));
  });
  return out;
}
