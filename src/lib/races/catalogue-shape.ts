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
};

export type CatalogueEvent = {
  id: string;
  name: string;
  nameZh?: string;
  series: RaceSeries;
  /** Not required on the collection — a handful of rows predate the check. */
  country?: string;
  distances: CatalogueDistance[];
};

/** What `badge-source.ts` and `report-options.ts` resolve against. */
export type RaceCatalogueMap = Map<string, CatalogueEvent>;

export function catalogueMap(events: CatalogueEvent[]): RaceCatalogueMap {
  return new Map(events.map((event) => [event.id, event]));
}

export function eventsBySeries(
  events: CatalogueEvent[],
  series: RaceSeries,
): CatalogueEvent[] {
  return events.filter((event) => event.series === series);
}
