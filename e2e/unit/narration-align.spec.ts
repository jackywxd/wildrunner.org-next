import { expect, test } from "@playwright/test";

import {
  GUARD_SECONDS,
  OVERLAP_TOLERANCE_SECONDS,
  WINDOW_SECONDS,
  alignLines,
  assemble,
  type AlignClip,
  type Span,
} from "../../scripts/lib/narration-align";

/**
 * U-NARRATE-19 — windowed forced alignment, against a fake whose true times
 * are known.
 *
 * The real aligner needs a 1 GB model and a minute per window, and the rules
 * under test are not about the model: they are about what to do with its
 * answers at the edges of a window. So the fake behaves the way the real one is
 * was measured to (`GUARD_SECONDS`, 613.5 s file with exact starts): lines whose
 * true time falls well inside the clip are placed correctly; those starting in
 * the last 30 s before its end (when text is left over) are placed early (2 s here: -0.52 s was measured at
 * 26.5 s out, and further in it grows toward the cramming); and text beyond the clip's end is crammed into
 * its last second. Truth: every line is 20 syllables at 0.25 s, followed by half a
 * second of silence.
 */

const LINE_SECONDS = 5;
const GAP = 0.5;
const CRAM_SECONDS = 1;
/** The real aligner was off from ~27 s before a clip's end; the fake from 30 s. */
const DEGRADE_SECONDS = 30;
const DEGRADE_ERROR = 2;

/** Line texts must be unique so the fake can tell which truth line it was handed. */
const POOL = "天地玄黄宇宙洪荒日月盈昃";
const label = (i: number) => POOL[Math.floor(i / 144) % 12] + POOL[Math.floor(i / 12) % 12] + POOL[i % 12];
const lineText = (i: number) => label(i) + "跑".repeat(LINE_SECONDS * 4 - 3);

function world(count: number) {
  const lines = Array.from({ length: count }, (_, i) => lineText(i));
  const truth = lines.map((_, i) => ({ start: i * (LINE_SECONDS + GAP), end: i * (LINE_SECONDS + GAP) + LINE_SECONDS }));
  const duration = truth[count - 1].end;
  const indexOf = new Map(lines.map((text, i) => [text, i]));
  const calls: { clipStart: number; clipEnd: number; fed: number }[] = [];

  const align: AlignClip = async (clipStart, clipEnd, sentences) => {
    calls.push({ clipStart, clipEnd, fed: sentences.length });
    const length = clipEnd - clipStart;
    let crammed = 0;
    // The degradation comes with surplus text (the end of a clip that is not
    // the end of the file); a clip that holds the whole rest of the script
    // has nothing to cram and is placed correctly to its last line.
    const surplus = sentences.some((text) => truth[indexOf.get(text) as number].start >= clipEnd - CRAM_SECONDS);
    return sentences.map((text): Span => {
      const t = truth[indexOf.get(text) as number];
      if (t.start < clipEnd - CRAM_SECONDS) {
        const early = surplus && t.start >= clipEnd - DEGRADE_SECONDS ? DEGRADE_ERROR : 0;
        return { start: Math.max(t.start - early - clipStart, 0), end: Math.min(t.end - clipStart, length) };
      }
      // Beyond the clip: squeezed into its last second, in order.
      const at = length - CRAM_SECONDS + (crammed += 1) * 0.001;
      return { start: at, end: Math.min(at + 0.0005, length) };
    });
  };
  return { lines, truth, duration, align, calls };
}

const near = (actual: number[], expected: number[], tolerance = 0.011) =>
  actual.forEach((value, i) => expect(Math.abs(value - expected[i]), `line ${i + 1}`).toBeLessThanOrEqual(tolerance));

test.describe("U-NARRATE-19 windowed alignment", () => {
  test("U-NARRATE-19a: a file inside one window is aligned in one call, with every line", async () => {
    const w = world(20); // 107.5 s
    const result = await alignLines({ lines: w.lines, duration: w.duration, align: w.align });

    expect(w.calls).toHaveLength(1);
    expect(w.calls[0]).toEqual({ clipStart: 0, clipEnd: w.duration, fed: 20 });
    near(result.starts, w.truth.map((t) => t.start));
    expect(result.overlapChecked).toBe(0);
  });

  test("U-NARRATE-19b: a file of many windows keeps every true start across the boundaries, and the overlap agrees", async () => {
    const w = world(200); // 1095 s: four-plus windows
    const result = await alignLines({ lines: w.lines, duration: w.duration, align: w.align });

    expect(w.calls.length).toBeGreaterThanOrEqual(4);
    near(result.starts, w.truth.map((t) => t.start));
    // The check ran, and ran on something: 0 would also be "no disagreement".
    expect(result.overlapChecked).toBeGreaterThan(0);
    expect(result.maxOverlapDisagreement).toBeLessThanOrEqual(OVERLAP_TOLERANCE_SECONDS);
    // No window was handed more than the aligner can take.
    for (const call of w.calls) expect(call.clipEnd - call.clipStart).toBeLessThanOrEqual(WINDOW_SECONDS);
  });

  test("U-NARRATE-19c: each window opens on the start of the last kept line and feeds it again, and its clip-relative times are moved back by that offset", async () => {
    const w = world(200);
    const result = await alignLines({ lines: w.lines, duration: w.duration, align: w.align });

    result.windows.forEach((window, i) => {
      if (i === 0) return expect(window.from).toBe(0);
      const previous = result.windows[i - 1];
      expect(window.from).toBeCloseTo(w.truth[previous.acceptedTo].start, 2);
      expect(window.fedFrom).toBe(previous.acceptedTo);
      expect(window.acceptedFrom).toBe(previous.acceptedTo + 1);
      // A start that had not been moved by `from` would sit before its own window.
      expect(result.starts[window.acceptedFrom]).toBeGreaterThanOrEqual(window.from);
    });
    // Nothing from the cramming zone was kept.
    for (const window of result.windows.slice(0, -1)) {
      expect(result.starts[window.acceptedTo]).toBeLessThan(window.to - GUARD_SECONDS);
    }
  });

  test("U-NARRATE-19d: two windows that place the same line differently are refused, naming the line", async () => {
    const w = world(200);
    let call = 0;
    // From the second window on, everything comes out 4.5 s late (about one
    // sentence): plausible on its own, wrong against what the first window said.
    const late: AlignClip = async (a, b, s) => {
      call += 1;
      const spans = await w.align(a, b, s);
      return call === 1 ? spans : spans.map((span) => span && { start: span.start + 4.5, end: span.end + 4.5 });
    };

    await expect(alignLines({ lines: w.lines, duration: w.duration, align: late })).rejects.toThrow(
      /line \d+ was placed at [\d.]+ s by one window and [\d.]+ s by the next/,
    );
  });

  test("U-NARRATE-19j: a placement degraded by the approaching end of a window is not compared, so a correct table is not refused", async () => {
    const w = world(200);
    // The premise: the fake really does misplace a line 25 s before the end of a clip.
    const first = w.truth.findIndex((t) => t.start >= WINDOW_SECONDS - 25);
    const probe = await w.align(0, WINDOW_SECONDS, [w.lines[first], w.lines[199]]); // the second is surplus
    expect(w.truth[first].start - (probe[0] as { start: number }).start).toBeGreaterThan(OVERLAP_TOLERANCE_SECONDS);

    const result = await alignLines({ lines: w.lines, duration: w.duration, align: w.align });
    near(result.starts, w.truth.map((t) => t.start));
    // Every boundary compared something, in the band the degradation does not reach.
    for (const window of result.windows.slice(0, -1)) expect(window.overlapChecked).toBeGreaterThan(0);
  });

  test("U-NARRATE-19k: a disagreement of a pause's length on a compared line is tolerated, a whole sentence's is not", async () => {
    // Post 2, line 34: 221.12 s from one window, 221.60 s from the next.
    const w = world(200);
    const shiftSecond = (seconds: number): AlignClip => {
      let call = 0;
      return async (a, b, s) => {
        call += 1;
        const spans = await w.align(a, b, s);
        return call === 1 ? spans : spans.map((span) => span && { start: span.start + seconds, end: span.end + seconds });
      };
    };

    const tolerated = await alignLines({ lines: w.lines, duration: w.duration, align: shiftSecond(0.6) });
    expect(tolerated.maxOverlapDisagreement).toBeCloseTo(0.6, 2);
    await expect(alignLines({ lines: w.lines, duration: w.duration, align: shiftSecond(4.5) })).rejects.toThrow(/4\.50 s apart/);
  });

  test("U-NARRATE-19e: a window that keeps no line is refused", async () => {
    const w = world(200);
    // Every line reported as starting in the tail: the text is not this audio.
    const nonsense: AlignClip = async (a, b, s) =>
      s.map((_, i) => ({ start: b - a - 1 + i * 0.001, end: b - a - 0.5 }));

    await expect(alignLines({ lines: w.lines, duration: w.duration, align: nonsense })).rejects.toThrow(/accepted no line/);
  });

  test("U-NARRATE-19f: a line with nothing to place takes the next start, and trailing ones take the duration", async () => {
    const w = world(20);
    const nulls = new Set([3, 18, 19]);
    const align: AlignClip = async (a, b, s) => {
      const spans = await w.align(a, b, s);
      return spans.map((span, i) => (nulls.has(i) ? null : span));
    };
    const result = await alignLines({ lines: w.lines, duration: w.duration, align });

    expect(result.starts[3]).toBe(result.starts[4]);
    expect(result.starts[18]).toBeCloseTo(w.duration, 2);
    expect(result.starts[19]).toBeCloseTo(w.duration, 2);
    expect(result.starts[2]).toBeCloseTo(w.truth[2].start, 1);
  });

  test("U-NARRATE-19g: a null line inside the kept part of a window does not end it", async () => {
    const w = world(200);
    const hole = 10; // well inside the first window
    const align: AlignClip = async (a, b, s) => {
      const spans = await w.align(a, b, s);
      return spans.map((span, i) => (s[i] === w.lines[hole] ? null : span));
    };
    const result = await alignLines({ lines: w.lines, duration: w.duration, align });

    expect(result.windows[0].acceptedTo).toBeGreaterThan(hole + 5);
    expect(result.starts[hole]).toBe(result.starts[hole + 1]);
    near(result.starts.slice(hole + 1), w.truth.slice(hole + 1).map((t) => t.start));
  });

  test("U-NARRATE-19i: nulls at the end of what a window would keep are left for the next window, not used to find where it ends", async () => {
    const w = world(200);
    const clean = await alignLines({ lines: w.lines, duration: w.duration, align: w.align });
    const edge = clean.windows[0].acceptedTo;
    const blank = new Set([w.lines[edge], w.lines[edge - 1]]);
    const align: AlignClip = async (a, b, s) => {
      const spans = await w.align(a, b, s);
      return spans.map((span, i) => (blank.has(s[i]) ? null : span));
    };
    const result = await alignLines({ lines: w.lines, duration: w.duration, align });

    expect(result.windows[0].acceptedTo).toBe(edge - 2);
    expect(result.starts[edge - 1]).toBe(result.starts[edge + 1]);
    near(result.starts.slice(edge + 1), w.truth.slice(edge + 1).map((t) => t.start));
  });

  test("U-NARRATE-19h: assembly clamps a small step back and refuses a large one", () => {
    expect(assemble([0, 5, 4.95, 9], 10)).toEqual([0, 5, 5, 9]);
    expect(() => assemble([0, 5, 4.5, 9], 10)).toThrow(/ran backwards/);
    // Rounded to two decimals and held inside [0, duration].
    expect(assemble([-0.2, 3.14159, 12], 10)).toEqual([0, 3.14, 10]);
  });
});
