/**
 * Where each line of a narration starts, as a small JSON beside the MP3.
 *
 * With `key` = `article-audio/<id>-<hash>.mp3`, a narration is three objects:
 * `key` (the audio), `key.txt` (the script) and `key.json` (this table), e.g.
 * `article-audio/33-5989c777.mp3` / `.mp3.txt` / `.mp3.json`. One table per
 * narration. It holds numbers only: line i of `articleScript(...)` begins
 * `starts[i]` seconds into the audio. No text, so it describes something
 * already public and the endpoint that serves it never needs the database.
 *
 * THE BROWSER CANNOT READ IT FROM R2 DIRECTLY. `images.wildrunner.org` sends no
 * `access-control-allow-origin` (see `articleAudioDownload.ts`), so the table
 * is served through a same-origin endpoint, and this file is what decides what
 * that endpoint may return.
 *
 * EVERY CHECK HERE EXISTS BECAUSE A WRONG TABLE IS WORSE THAN NONE. A missing
 * table means the page does not follow along; a table for the wrong audio
 * highlights the wrong paragraph with full confidence. So a table is accepted
 * only if it is internally consistent (`parseTiming`) AND describes exactly
 * the MP3 that is in the bucket now (`findTiming`: same key, same byte size).
 * The size check is what makes `?force=true` safe: it regenerates audio under
 * the SAME key, so the old table's `audio` still matches and only `bytes`
 * notices.
 */

export type Timing = {
  version: 1;
  /** The R2 key of the MP3 this describes. */
  audio: string;
  /** That MP3's size; a different size means it was regenerated. */
  bytes: number;
  /** Seconds, measured on the finished file. */
  duration: number;
  /** `articleScript(...).split("\n").length`. */
  lines: number;
  /** "block": a paragraph's start is exact, the sentences inside are spread. */
  precision: "block";
  /** "pieces": known from how the file was assembled; "aligned": forced alignment. */
  source: "pieces" | "aligned";
  /** One per line, two decimals, non-decreasing, inside [0, duration]. */
  starts: number[];
};

/**
 * A timing table if `json` is one, otherwise null.
 *
 * Null rather than a throw: the caller's answer to a bad table is the same as
 * to a missing one — no follow-along — and an exception per malformed object
 * would be a 500 for something a reader never needs to know about.
 */
export function parseTiming(json: unknown): Timing | null {
  if (typeof json !== "object" || json === null) return null;
  const t = json as Record<string, unknown>;

  if (t.version !== 1) return null;
  if (typeof t.audio !== "string" || !t.audio) return null;
  if (!Number.isInteger(t.bytes) || (t.bytes as number) < 0) return null;
  if (typeof t.duration !== "number" || !Number.isFinite(t.duration) || t.duration <= 0) return null;
  if (!Number.isInteger(t.lines) || (t.lines as number) < 1) return null;
  if (t.precision !== "block") return null;
  if (t.source !== "pieces" && t.source !== "aligned") return null;
  if (!Array.isArray(t.starts) || t.starts.length !== t.lines) return null;

  let previous = 0;
  for (const start of t.starts) {
    if (typeof start !== "number" || !Number.isFinite(start)) return null;
    if (start < previous || start > t.duration) return null;
    previous = start;
  }

  return t as unknown as Timing;
}

/** What `findTiming` needs from a bucket, so tests can pass a fake. */
export type TimingBucket = {
  head(key: string): Promise<{ size: number } | null>;
  get(key: string): Promise<{ text(): Promise<string> } | null>;
};

/**
 * The key shape `articleAudioKey` produces, for THIS post. Anything else is
 * refused before the bucket is touched: `key` arrives in a query string, and
 * this is what stops the endpoint reading any other object in the bucket.
 */
function isKeyOf(postId: number | string, key: string): boolean {
  return /^\d+$/.test(String(postId)) && new RegExp(`^article-audio/${postId}-[0-9a-f]{8}\\.mp3$`).test(key);
}

/**
 * The table for `key`, if there is one that describes the MP3 now in the bucket.
 *
 * Null for: a key that is not this post's, either object missing, unparseable
 * JSON, a table whose `audio` names a different file, or whose `bytes` differ
 * from the MP3's size.
 */
export async function findTiming(
  bucket: TimingBucket,
  postId: number | string,
  key: string,
): Promise<Timing | null> {
  if (!isKeyOf(postId, key)) return null;

  const audio = await bucket.head(key);
  if (!audio) return null;
  const object = await bucket.get(`${key}.json`);
  if (!object) return null;

  let timing: Timing | null;
  try {
    timing = parseTiming(JSON.parse(await object.text()));
  } catch {
    return null;
  }
  if (!timing || timing.audio !== key || timing.bytes !== audio.size) return null;
  return timing;
}

/**
 * Status, headers and body for `GET /article-audio/:id/timing?key=…`, apart
 * from the request so they can be asserted without a Worker.
 *
 * NO Cache-Control HERE, deliberately. A handler's own header never reaches
 * the client on this stack: `articleAudioDownload.ts` sets
 * `public, max-age=31536000, immutable`, and production answers
 * `cache-control: private, no-store, max-age=0, must-revalidate` (measured with
 * `curl -D - https://wildrunner.org/api/article-audio/22/download`) — the
 * `source: "/api/:path*"` rule in `next.config.ts` decides, for every status.
 * So the table is not cached: ~25 KB fetched once per press of play, and a
 * regenerated one (`force`) is picked up at once.
 */
export async function timingResponseParts(
  bucket: TimingBucket,
  postId: number | string,
  key: string | null,
): Promise<{ status: 200 | 404; headers: Record<string, string>; body: string }> {
  const timing = key ? await findTiming(bucket, postId, key) : null;
  if (!timing) {
    return {
      status: 404,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "no timing for this narration" }),
    };
  }
  return {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(timing),
  };
}

/**
 * The line being read at `t` seconds: the LAST line whose start is <= t.
 *
 * Last, not first, among equal starts: a line the voice had nothing to say
 * for (an emoji on its own) gets the same start as the line after it, and the
 * one that is audible is the later. Before the first start, line 0 — the
 * reader is at the top. An empty table has no line, -1.
 */
export function lineAt(starts: readonly number[], t: number): number {
  let low = 0;
  let high = starts.length - 1;
  let found = starts.length ? 0 : -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (starts[mid] <= t) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}
