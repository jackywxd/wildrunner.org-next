/**
 * Turning a finished schedule row into something a member can write a race
 * report about.
 *
 * THE GAP THIS CLOSES. A `race-schedule` row says an event ran on given
 * dates. A badge says a member finished an event, at a distance, in a year.
 * The row supplies the event and the year; it cannot supply the distance,
 * because one row covers a race offering 20K through 100M and only the
 * runner knows which one they ran. So every entry point into a race report
 * has to ask exactly one question — which distance — and this module is
 * what tells the UI which question to ask and what the valid answers are.
 *
 * Same date conventions as the rest of `lib/races`: `now` is a parameter,
 * dates are "YYYY-MM-DD" strings, and no `Date` is built from a stored
 * value. See the header of calendar.ts.
 */

import type { SiteRaceScheduleEntry } from "@/lib/content-types";
import { findRaceEvent, type RaceDistance } from "./catalogue";
import { isFinished } from "./race-state";

export type RaceReportOption = {
  /** The `race-schedule` row this came from. */
  scheduleId: number;
  /** Catalogue id — what the badge and the race record store. */
  eventId: string;
  /** What the member sees. Chinese name preferred, English kept as a subtitle. */
  label: string;
  sublabel?: string;
  /** Derived from `startDate`, never from `endDate`: a race that runs into
   *  1 January belongs to the year it started, which is what its results
   *  are published under. */
  year: number;
  /** The choice the member still has to make. Never empty. */
  distances: RaceDistance[];
};

/**
 * Can a report be written about this race yet, and can it carry a badge?
 *
 * Both conditions, deliberately together. A race still to come fails the
 * first; a race with no catalogue entry fails the second and could only
 * produce a record with no event to point at. `race-schedule` now requires
 * `eventId` (see that collection's header), so the second is a guard
 * against rows written before that rule, not an expected state.
 */
export function canReport(
  entry: SiteRaceScheduleEntry,
  now: Date,
): boolean {
  return isFinished(entry, now) && Boolean(entry.eventId && findRaceEvent(entry.eventId));
}

export function toReportOption(
  entry: SiteRaceScheduleEntry,
): RaceReportOption | null {
  const event = entry.eventId ? findRaceEvent(entry.eventId) : undefined;
  if (!event || event.distances.length === 0) return null;

  const zh = entry.nameZh?.trim();
  return {
    distances: event.distances,
    eventId: event.id,
    label: zh || entry.name,
    sublabel: zh ? entry.name : undefined,
    scheduleId: entry.id,
    year: Number(entry.startDate.slice(0, 4)),
  };
}

/** Every finished, catalogue-linked race, newest first. */
export function reportOptions(
  entries: SiteRaceScheduleEntry[],
  now: Date,
): RaceReportOption[] {
  return entries
    .filter((entry) => canReport(entry, now))
    .map(toReportOption)
    .filter((option): option is RaceReportOption => option !== null);
}
