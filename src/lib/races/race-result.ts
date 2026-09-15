import type { SiteRaceRecord } from "@/lib/content-types";

/**
 * Which of a member's races count as finishes, and which badge an event wears.
 *
 * WHY THIS IS NOT INSIDE `RiderBadges.tsx`. `latestPerEvent` lived there, as a
 * module-private function in a file of async Server Components, which made the
 * rule it encodes unreachable from the unit lane — the level that can afford to
 * assert it. The rule is pure (records in, records out) and is now applied from
 * three places rather than one, so it belongs where all three can import it and
 * a test can reach it without a browser.
 *
 * THE RULE THAT MATTERS: A FINISH BEATS A DNF, ALWAYS. Before `result` existed
 * every record was a finish, so "the most recent year" was the whole of
 * `latestPerEvent` and it was correct. It stopped being correct the moment a
 * record could be a DNF: somebody who finished UTMB in 2023 and dropped in 2025
 * would have had the 2025 DNF chosen — the later year — and their finish would
 * have vanished from the shelf behind it. The badge would have been not merely
 * incomplete but actively wrong about what they have done.
 */

/**
 * `result` is `"finished" | "dnf"` by the time a record reaches here —
 * `mapRaceRecord` has already resolved the NULL that every pre-migration row
 * carries. This exists so the three call sites read as one sentence rather
 * than repeating a string comparison that would be easy to write backwards.
 */
export function isFinish(record: Pick<SiteRaceRecord, "result">): boolean {
  return record.result === "finished";
}

/**
 * Only the races a member actually finished.
 *
 * Six Star counting is what this is for, and there it is not a nicety: a Six
 * Star Finisher is an external credential that requires six *finishes*, so a
 * count including a DNF would have the site award something World Marathon
 * Majors would not.
 */
export function finishesOnly(
  records: readonly SiteRaceRecord[],
): SiteRaceRecord[] {
  return records.filter(isFinish);
}

/**
 * One record per event: the finish if there is one, otherwise the DNF.
 *
 * A directory row has room for a handful of badges, and somebody who has run
 * the same race eight times would otherwise fill the row with eight
 * near-identical squares and crowd out every other race they have done. The
 * profile page shows the full history.
 *
 * Within a kind, the most recent year wins — so a member who finished in 2019
 * and again in 2024 wears 2024, and one who has only ever dropped wears their
 * most recent attempt. Across kinds the finish wins outright, whatever the
 * years: see the header.
 */
export function latestPerEvent(
  records: readonly SiteRaceRecord[],
): SiteRaceRecord[] {
  const best = new Map<string, SiteRaceRecord>();
  for (const record of records) {
    const current = best.get(record.eventId);
    if (!current || beats(record, current)) best.set(record.eventId, record);
  }
  return [...best.values()].sort(
    (a, b) => b.year - a.year || a.eventId.localeCompare(b.eventId),
  );
}

/** Whether `candidate` should replace `current` as this event's badge. */
function beats(candidate: SiteRaceRecord, current: SiteRaceRecord): boolean {
  const candidateFinished = isFinish(candidate);
  if (candidateFinished !== isFinish(current)) return candidateFinished;
  return candidate.year > current.year;
}
