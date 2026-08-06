/**
 * Where a badge's labels come from.
 *
 * THIS FILE IS THE SEAM. `RaceBadge` used to call `findRaceEvent` itself,
 * which tied every badge on the site to the catalogue being a synchronous
 * in-memory array. The catalogue is moving into the database, and a
 * component cannot await a query — so the badge takes what it needs as
 * props, and resolving an id into those props happens here.
 *
 * THIS IS THE SEAM'S OTHER HALF. Every resolver below now takes the
 * catalogue as an explicit `RaceCatalogueMap` parameter instead of reading a
 * module-level array — that is the whole change the file's header used to
 * promise ("when the catalogue becomes rows, only this file changes"). A
 * server page loads it once with `getRaceCatalogueEvents()`
 * (`catalogue-db.ts`) and either resolves badges directly or passes the
 * plain event array down to a client component, which builds its own map
 * with `catalogueMap()`. The functions stay synchronous either way — only
 * where the Map comes from changed.
 *
 * THE FALLBACK IS THE CONTRACT, not politeness. A race record is written
 * once and read forever while the catalogue is edited between deploys, so
 * an id that no longer resolves still has to render — the id becomes the
 * label and `series` becomes null. A member's profile must not break
 * because a race was renamed (A-T4).
 */

import { RACE_SERIES } from "./catalogue";
import type { RaceSeries } from "./catalogue";
import type { CatalogueEvent, RaceCatalogueMap } from "./catalogue-shape";

export type BadgeEvent = {
  id: string;
  name: string;
  /** `null` means the id resolves to nothing — see the fallback note above. */
  series: RaceSeries | null;
};

export type BadgeDistance = {
  id: string;
  label: string;
};

function findEvent(
  catalogue: RaceCatalogueMap,
  eventId: string,
): CatalogueEvent | undefined {
  return catalogue.get(eventId);
}

function findDistance(
  event: CatalogueEvent,
  distanceId: string,
): { id: string; label: string } | undefined {
  return event.distances.find((distance) => distance.id === distanceId);
}

export function resolveBadgeEvent(
  catalogue: RaceCatalogueMap,
  eventId: string,
): BadgeEvent {
  const event = findEvent(catalogue, eventId);
  if (!event) return { id: eventId, name: eventId, series: null };
  return { id: event.id, name: event.name, series: event.series };
}

export function resolveBadgeDistance(
  catalogue: RaceCatalogueMap,
  eventId: string,
  distanceId: string,
): BadgeDistance {
  const event = findEvent(catalogue, eventId);
  const distance = event ? findDistance(event, distanceId) : undefined;
  // Upper-cased rather than left raw: distance ids are lowercase by
  // convention ("100m", "ccc"), and an unstyled lowercase id next to
  // properly-cased labels reads as a rendering bug rather than as missing
  // data.
  return { id: distanceId, label: distance?.label ?? distanceId.toUpperCase() };
}

export function resolveBadge(
  catalogue: RaceCatalogueMap,
  eventId: string,
  distanceId: string,
): { distance: BadgeDistance; event: BadgeEvent } {
  return {
    distance: resolveBadgeDistance(catalogue, eventId, distanceId),
    event: resolveBadgeEvent(catalogue, eventId),
  };
}

/**
 * Split a member's records into the series groups a profile page shows.
 *
 * Extracted from `RiderBadgeWall` so it can be checked without a browser. The
 * grouping is the only real logic on that page — which record lands in which
 * section, and what happens to a record whose event has left the catalogue —
 * and verifying it used to mean booting a server, creating an account, posting
 * two records and navigating twice, to read three data attributes back out of
 * rendered HTML.
 *
 * Iterates `RACE_SERIES` rather than the records, so a new series appears here
 * without a second edit; empty groups are dropped. `unknown` is returned
 * rather than discarded because those records still belong to the member — the
 * page renders a neutral placeholder for them.
 */
export function groupRecordsBySeries<T extends { eventId: string }>(
  catalogue: RaceCatalogueMap,
  records: T[],
): { groups: { series: RaceSeries; records: T[] }[]; unknown: T[] } {
  const groups = RACE_SERIES.map((series) => ({
    records: records.filter(
      (record) => findEvent(catalogue, record.eventId)?.series === series,
    ),
    series,
  })).filter((group) => group.records.length > 0);

  return {
    groups,
    unknown: records.filter((record) => !findEvent(catalogue, record.eventId)),
  };
}
