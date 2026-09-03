import type { RaceClaim } from "@/components/members/races/RaceClaimFields";
import type { CatalogueEvent } from "@/lib/races/catalogue-shape";
import { isRaceYearClaimable } from "@/lib/races/catalogue";

/**
 * `?race=<eventKey>&year=<year>` read as a race claim, or nothing.
 *
 * A HINT, NOT A REQUIREMENT — the same contract `/members/posts/new` gives its
 * own `?race=&year=`: a pair that matches nothing simply leaves the picker
 * empty rather than erroring at somebody who followed a link.
 *
 * MATCHED AGAINST THE CATALOGUE, not against a list of `race-editions`. That
 * is what makes a link to a race nobody has dated work at all: the edition row
 * need not exist yet, and `/api/members/race-editions/resolve` creates it when
 * the upload happens. The dated-editions list was 14 rows on 2026-09-02 and
 * held nothing older than that year.
 *
 * Shared by the library and the upload page because they are reached by the
 * same links (`RaceEntryRow`'s 上傳相片) and must read them identically. Two
 * copies of this would drift the first time one of them learned a new
 * parameter.
 */
export function preselectedRaceFrom(
  params: Record<string, string | string[] | undefined>,
  catalogueEvents: CatalogueEvent[],
  now: Date,
): RaceClaim | null {
  const race = Array.isArray(params.race) ? params.race[0] : params.race;
  const year = Array.isArray(params.year) ? params.year[0] : params.year;
  const event = catalogueEvents.find((candidate) => candidate.id === race);
  const wantedYear = Number(year);
  if (!event || !isRaceYearClaimable(wantedYear, now)) return null;
  return { distanceId: "", eventId: event.id, series: event.series, year: wantedYear };
}
