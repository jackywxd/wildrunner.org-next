/**
 * Where a reader stopped listening, and whether it is still worth going back to.
 *
 * PER BROWSER, IN localStorage, AND NOWHERE ELSE. A position that followed the
 * member across devices would need a column and a migration, and this
 * repository's notes are long on what a D1 migration costs when it goes wrong.
 * It also cannot exist for a visitor who is not signed in, who is most of the
 * audience. The cost of the choice is plain: start on a phone, continue on a
 * laptop, and the laptop starts from the top.
 *
 * KEYED BY THE AUDIO'S R2 KEY, not by the article. The key carries the post id
 * and a hash of the script, so a position can only ever be applied to the file
 * it was recorded against — an edited article plays a new file and begins
 * again, instead of landing at minute 12 of a recording that no longer says
 * what it said. `d` (the duration it was recorded against) is the second line
 * of defence for the one case the key cannot see: `?force=true` regenerates
 * the audio under the SAME key.
 *
 * Pure, and `now` is a parameter, so the whole policy is exercised by the unit
 * lane with no browser, no storage and no clock. The component owns the
 * events; this owns what to do with the numbers.
 */

/** The single localStorage item. One item, so there is one thing to clear. */
export const POSITIONS_STORAGE_KEY = "narration-positions";

/** A remembered spot: `t` seconds in, of `d`, written at epoch-ms `at`. */
export type PositionEntry = { t: number; d: number; at: number };
export type PositionMap = Record<string, PositionEntry>;

/**
 * Before this, there is nothing worth coming back to. A reader who pressed
 * play, heard the opening and left has lost five seconds, and a notice offering
 * to resume at 0:03 is noise.
 */
const MIN_SECONDS = 5;

/**
 * Within this of the end, the article is finished for practical purposes.
 * Offering to resume 9 seconds from the end puts the reader on a closing
 * sentence with no context; starting over is what they want.
 */
const END_SECONDS = 15;

/**
 * How many articles are remembered. Each entry is ~100 bytes, so this is not
 * about the quota — it is that a position from eight months ago is not a
 * "where I left off", it is clutter, and the oldest are the ones to drop.
 */
const MAX_ENTRIES = 50;

function isEntry(value: unknown): value is PositionEntry {
  if (typeof value !== "object" || value === null) return false;
  const { t, d, at } = value as Record<string, unknown>;
  return (
    typeof t === "number" &&
    Number.isFinite(t) &&
    t >= 0 &&
    typeof d === "number" &&
    Number.isFinite(d) &&
    d > 0 &&
    typeof at === "number" &&
    Number.isFinite(at)
  );
}

/**
 * The stored map, from the raw string `getItem` returned.
 *
 * NEVER THROWS. This runs in an effect on every article page that has
 * narration, over a value any other script, extension or older version of this
 * site may have written. A reader who cannot resume must still be able to
 * listen. Entries that are not shaped like an entry are dropped one by one,
 * so a single bad record does not cost the rest.
 */
export function readPositions(raw: string | null | undefined): PositionMap {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {};
  }
  const out: PositionMap = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (isEntry(value)) out[key] = value;
  }
  return out;
}

/**
 * The map after the player reports `t` seconds of `d` for `key`.
 *
 * Near either end the entry is REMOVED rather than left stale: a record from
 * minute 12 must not outlive the reader finishing the article at minute 20.
 *
 * A duration that is not a number yet (`NaN` before metadata loads, `Infinity`
 * for a stream) leaves the map untouched. The tail rule cannot be applied
 * without it, and deleting a good record because the player had not caught up
 * would be the worse mistake of the two.
 */
export function recordPosition(
  map: PositionMap,
  key: string,
  t: number,
  d: number,
  now: number,
): PositionMap {
  if (!Number.isFinite(t) || !Number.isFinite(d) || d <= 0) return map;

  const next = { ...map };
  if (t < MIN_SECONDS || t > d - END_SECONDS) {
    delete next[key];
    return next;
  }
  next[key] = { t, d, at: now };

  const keys = Object.keys(next);
  if (keys.length <= MAX_ENTRIES) return next;
  // Newest kept. `at` alone decides, so the one just written always survives.
  const newest = keys.sort((a, b) => next[b].at - next[a].at).slice(0, MAX_ENTRIES);
  return Object.fromEntries(newest.map((k) => [k, next[k]]));
}

/**
 * Where to resume, or `null` when the record should not be trusted.
 *
 * `duration` is what the player reports for the file it just loaded. A
 * mismatch means this is not the recording the position was taken from —
 * `?force=true` replaces the audio under an unchanged key — and a second of
 * slack (or 0.5%, for a long file) absorbs the difference between how
 * browsers estimate the length of a variable-bitrate MP3.
 */
export function resumePoint(
  entry: PositionEntry | undefined,
  duration: number,
): number | null {
  if (!entry || !Number.isFinite(duration) || duration <= 0) return null;
  if (Math.abs(entry.d - duration) > Math.max(1, duration * 0.005)) return null;
  if (entry.t < MIN_SECONDS || entry.t > duration - END_SECONDS) return null;
  return entry.t;
}

/** `m:ss`, or `h:mm:ss` from an hour up. Whole seconds, rounded down. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
