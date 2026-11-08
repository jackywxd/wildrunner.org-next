import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";

import type { AlignClip, Span } from "./narration-align";

/**
 * The IO around `scripts/align-narration.py`: the long-lived aligner process
 * and the ffmpeg cut that feeds it. Everything with a decision in it is in
 * `narration-align.ts`; this file is only what could not be tested without a
 * model and a GPU, kept small so that it is read rather than trusted.
 *
 * Importable on its own: checking the windowing against a file whose starts
 * are known needs these two and nothing from the narration pipeline.
 *
 * THE MODEL LOADS ONCE PER PROCESS (~seconds, ~1 GB), so one child serves every
 * window of every post in a run, and a request is one line in, one line out.
 * The child exits on its own refusals (audio over its limit, tokens that do not
 * add up) after printing the reason to stderr, which is inherited so the user
 * sees it; what this file adds is that such an exit REJECTS the request in
 * flight. A caller waiting on a line that will never come looks exactly like a
 * model that is thinking.
 */

/** oMLX's own Python: this Mac has no `uv`, and mlx-audio is already inside it. */
export const ALIGNER_PYTHON = "/Applications/oMLX.app/Contents/Resources/Python/cpython-3.11/bin/python3.11";
const ALIGNER_SCRIPT = path.resolve(import.meta.dirname, "..", "align-narration.py");

export class ForcedAligner {
  private child: ChildProcess;
  private pending: { resolve: (line: string) => void; reject: (error: Error) => void } | null = null;
  private failure: Error | null = null;

  constructor() {
    this.child = spawn(ALIGNER_PYTHON, ["-I", ALIGNER_SCRIPT], { stdio: ["pipe", "pipe", "inherit"] });
    const stdout = createInterface({ input: this.child.stdout as NodeJS.ReadableStream });
    stdout.on("line", (line) => {
      const waiting = this.pending;
      this.pending = null;
      if (waiting) waiting.resolve(line);
      // A line nobody asked for is not something to parse into the next
      // request's answer: it would shift every answer after it by one.
      else this.fail(new Error(`the aligner printed a line nobody asked for: ${line.slice(0, 200)}`));
    });
    this.child.on("error", (error) => this.fail(error));
    this.child.on("close", (code, signal) =>
      this.fail(new Error(`the aligner exited (${signal ?? `code ${code}`}) — its reason is on stderr above`)),
    );
    // A closed stdin raises EPIPE on the write, which `request` already hears as
    // a rejection; the event itself must not crash the process.
    this.child.stdin?.on("error", () => {});
  }

  private fail(error: Error) {
    this.failure ??= error;
    const waiting = this.pending;
    this.pending = null;
    waiting?.reject(this.failure);
  }

  /** Spans relative to `audio`, one per sentence. */
  async align(audio: string, sentences: string[], language = "Chinese"): Promise<Span[]> {
    if (this.failure) throw this.failure;
    if (this.pending) throw new Error("the aligner serves one request at a time");

    const line = await new Promise<string>((resolve, reject) => {
      this.pending = { resolve, reject };
      this.child.stdin?.write(JSON.stringify({ audio, sentences, language }) + "\n", (error) => {
        if (error) this.fail(error);
      });
    });
    return parseSpans(line, sentences.length);
  }

  close() {
    this.child.stdin?.end();
    this.child.kill();
  }
}

/**
 * The aligner's answer line, or an error that quotes it. Strict because a
 * lenient parse of a malformed answer is a table of plausible wrong numbers.
 */
export function parseSpans(line: string, expected: number): Span[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new Error(`the aligner's answer is not JSON: ${line.slice(0, 200)}`);
  }
  const spans = (parsed as { spans?: unknown } | null)?.spans;
  if (!Array.isArray(spans) || spans.length !== expected) {
    throw new Error(`the aligner's answer does not hold ${expected} spans: ${line.slice(0, 200)}`);
  }
  return spans.map((span): Span => {
    if (span === null) return null;
    const { start, end } = (span ?? {}) as { start?: unknown; end?: unknown };
    if (typeof start !== "number" || typeof end !== "number" || !Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      throw new Error(`the aligner's answer has a span that is not {start, end}: ${line.slice(0, 200)}`);
    }
    return { start, end };
  });
}

/**
 * `[start, start + length)` of `mp3` as a 16 kHz mono WAV.
 *
 * WAV and not a re-encoded MP3 because an MP3 encoder prepends a delay of a
 * thousand-odd samples: every start in the clip would be late by the same
 * amount, and nothing would look wrong. 16 kHz mono is what the aligner
 * resamples to anyway. `-ss` before `-i` seeks the input.
 */
export function cutClip(mp3: string, start: number, length: number, out: string): void {
  mkdirSync(path.dirname(out), { recursive: true });
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-ss", start.toFixed(3), "-t", length.toFixed(3), "-i", mp3,
    "-ac", "1", "-ar", "16000", out,
  ]);
}

export function probeSeconds(mp3: string): number {
  const seconds = Number(
    execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp3], {
      encoding: "utf8",
    }).trim(),
  );
  if (!(seconds > 0)) throw new Error(`ffprobe could not measure ${mp3}`);
  return seconds;
}

/** An `AlignClip` over one MP3: cuts the clip into `workDir`, aligns it, returns clip-relative spans. */
export function clipAligner(aligner: ForcedAligner, mp3: string, workDir: string): AlignClip {
  return async (clipStart, clipEnd, sentences) => {
    const clip = path.join(workDir, `clip-${clipStart.toFixed(1)}.wav`);
    cutClip(mp3, clipStart, clipEnd - clipStart, clip);
    return aligner.align(clip, sentences);
  };
}
