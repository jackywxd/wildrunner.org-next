/**
 * Where a badge's labels come from.
 *
 * THIS FILE IS THE SEAM. `RaceBadge` used to call `findRaceEvent` itself,
 * which tied every badge on the site to the catalogue being a synchronous
 * in-memory array. The catalogue is moving into the database, and a
 * component cannot await a query — so the badge now takes what it needs as
 * props, and resolving an id into those props happens here.
 *
 * Today `resolveBadge` reads the same code catalogue it always did, so
 * nothing renders differently. When the catalogue becomes rows, only this
 * file changes: pages load the events once per request and pass descriptors
 * down, and the badge is untouched.
 *
 * THE FALLBACK IS THE CONTRACT, not politeness. A race record is written
 * once and read forever while the catalogue is edited between deploys, so
 * an id that no longer resolves still has to render — the id becomes the
 * label and `series` becomes null. A member's profile must not break
 * because a race was renamed (A-T4).
 */

import type { RaceSeries } from "./catalogue";
import { findRaceDistance, findRaceEvent } from "./catalogue";

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

export function resolveBadgeEvent(eventId: string): BadgeEvent {
  const event = findRaceEvent(eventId);
  if (!event) return { id: eventId, name: eventId, series: null };
  return { id: event.id, name: event.name, series: event.series };
}

export function resolveBadgeDistance(
  eventId: string,
  distanceId: string,
): BadgeDistance {
  const event = findRaceEvent(eventId);
  const distance = event ? findRaceDistance(event, distanceId) : undefined;
  // Upper-cased rather than left raw: distance ids are lowercase by
  // convention ("100m", "ccc"), and an unstyled lowercase id next to
  // properly-cased labels reads as a rendering bug rather than as missing
  // data.
  return { id: distanceId, label: distance?.label ?? distanceId.toUpperCase() };
}

export function resolveBadge(
  eventId: string,
  distanceId: string,
): { distance: BadgeDistance; event: BadgeEvent } {
  return {
    distance: resolveBadgeDistance(eventId, distanceId),
    event: resolveBadgeEvent(eventId),
  };
}
