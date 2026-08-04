/**
 * Where a race sits relative to today: still to come, running now, or over.
 *
 * Distinct from `registration.ts`, which answers a different question about
 * the same row. A race can be finished and still carry an open registration
 * window (nobody cleared it), or be weeks away with registration long
 * closed. Deriving both from the same two dates would conflate "can I enter"
 * with "has it happened", and the page needs to say both.
 *
 * Same conventions as calendar.ts and registration.ts: `now` is a parameter,
 * comparisons happen on "YYYY-MM-DD" strings, and no `Date` is constructed
 * from a stored value. See the header of calendar.ts for why.
 */

import { toDateString, type DateString } from "./calendar";

export type RaceState =
  /** Starts after today. */
  | { kind: "upcoming" }
  /** Started on or before today and has not finished. */
  | { kind: "ongoing" }
  /** Finished before today. */
  | { kind: "finished" };

type RaceDates = {
  startDate: DateString;
  endDate?: DateString | null;
};

/**
 * A single-day race has no endDate, so its start *is* its end.
 *
 * Both boundaries are inclusive, matching registration.ts: a race starting
 * today is running today, and one ending today is still running today. The
 * alternative would retire an event while its runners are still on the
 * course.
 */
export function raceState(entry: RaceDates, now: Date): RaceState {
  const today = toDateString(now);
  const start = entry.startDate;
  const end = entry.endDate || start;

  // A backwards range (endDate before startDate) is treated as a single-day
  // event at `start` rather than as permanently finished, matching how
  // entriesByDate degrades the same bad data.
  const last = end >= start ? end : start;

  if (start > today) return { kind: "upcoming" };
  if (last >= today) return { kind: "ongoing" };
  return { kind: "finished" };
}

/**
 * Was this race over before today?
 *
 * A separate helper because the page filters on it in two places and
 * `raceState(...).kind === "finished"` reads worse at a call site than a
 * predicate does.
 */
export function isFinished(entry: RaceDates, now: Date): boolean {
  return raceState(entry, now).kind === "finished";
}

export function isOngoing(entry: RaceDates, now: Date): boolean {
  return raceState(entry, now).kind === "ongoing";
}
