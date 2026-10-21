import type { RaceSeries } from "./catalogue";

/**
 * The shape of the runtime catalogue, and nothing that fetches one.
 *
 * DELIBERATELY SEPARATE FROM `catalogue-db.ts`. That file's
 * `getRaceCatalogueEvents()` imports `getPayloadClient`, which imports
 * `@payload-config` — the entire Payload config, every collection, every
 * plugin. Four client components (`RaceRecordManager`, `RaceChoice`,
 * `RaceRecordField`, `StartRaceReport`) need only the types and the two pure
 * helpers below; importing them from `catalogue-db.ts` would have pulled
 * that whole server-only dependency graph toward the client bundle.
 *
 * It was not hypothetical: `e2e/unit/badge-source.spec.ts` imported
 * `catalogueMap` from `catalogue-db.ts` for exactly this reason — a type and
 * a one-line function — and Playwright's loader failed on an unrelated
 * `next/cache` import three hops into that chain, in a file the test never
 * calls. A unit test dragging in a Payload boot chain to build a `Map` is
 * also simply the wrong level per docs/testing-strategy.md — this split
 * fixes both problems the same way.
 */
export type CatalogueDistance = {
  id: string;
  label: string;
  /** Set only when true. See `historical` in RaceCategories.ts. */
  historical?: true;
};

export type CatalogueEvent = {
  id: string;
  name: string;
  nameZh?: string;
  series: RaceSeries;
  /** Not required on the collection — a handful of rows predate the check. */
  country?: string;
  /**
   * City-level position for the footprint map, 0.1° resolution
   * (`race-events.lat/lng`, filled by src/lib/geo/). Both or neither; absent
   * means the event has not been placed — the map leaves it out rather than
   * drawing it at (0, 0) or at its country's centre.
   */
  lat?: number;
  lng?: number;
  /**
   * The city the coordinates were found for (`race-events.geoPlace`), as the
   * geocoder wrote it — it may carry a " (relaxed)" review marker. Public
   * data, shown on the footprint card.
   */
  geoPlace?: string;
  distances: CatalogueDistance[];
};

/** What `badge-source.ts` and `report-options.ts` resolve against. */
export type RaceCatalogueMap = Map<string, CatalogueEvent>;

export function catalogueMap(events: CatalogueEvent[]): RaceCatalogueMap {
  return new Map(events.map((event) => [event.id, event]));
}

/**
 * The distances a picker may offer.
 *
 * Historical entries stay in the catalogue so a badge can name them, and
 * stay out of every "which distance did you run" question — the finish that
 * created one proves it ran once, not that a member can enter it. `keep` is
 * the value already chosen: editing a record that points at a historical
 * entry has to be able to show it, or the select renders blank.
 */
export function offeredDistances(
  event: CatalogueEvent | undefined,
  keep?: string,
): CatalogueDistance[] {
  return (event?.distances ?? []).filter(
    (distance) => !distance.historical || distance.id === keep,
  );
}

export function eventsBySeries(
  events: CatalogueEvent[],
  series: RaceSeries,
): CatalogueEvent[] {
  return events.filter((event) => event.series === series);
}
