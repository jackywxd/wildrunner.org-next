/**
 * Which riders the directory shows, read from and written back to the URL.
 *
 * The question this exists to answer is "who has run the six majors" — the
 * badges were already on the cards, but finding the one person wearing a
 * particular one meant reading every card. So `/riders` gains the same kind
 * of filter `/races` has, and for the same reasons the header of
 * `race-filters.ts` gives: every option is a link, the page stays a server
 * component, a filtered directory can be shared, and nothing hydrates.
 *
 * Parsing and matching live here rather than in the page because inside a
 * server component they could not be exercised by a test at all, and this
 * reads an attacker-controlled query string.
 *
 * SEVERAL BADGES, AND NOT OR. Two selected chips ask "who has done both",
 * which is the question worth asking of a wall of achievements — an OR
 * would only ever grow the list, and the directory unfiltered is already
 * that list. The cost is real and is paid deliberately: over a club this
 * size an intersection answers "nobody" easily, so the count on each chip
 * is the count *of the selection including it* rather than of the badge on
 * its own. A zero is then visible before the click rather than after, which
 * is the only thing that makes an AND filter usable.
 */
import type { SiteRaceRecord, SiteRider } from "@/lib/content-types";
import type { RaceCatalogueMap } from "@/lib/races/catalogue-shape";
import {
  SIX_MAJORS_ID,
  SIX_MAJORS_LABEL_ZH,
  sixMajorsCompletion,
} from "@/lib/races/six-majors";

/**
 * The three the club asked to reach in one click.
 *
 * Two of them name a *distance*, not just an event, and that is the whole
 * point of pinning them: `utmb-mont-blanc` also hosts OCC, MCC and ETC, so
 * an event-level chip would put someone who ran the 15km ETC in the same
 * list as someone who ran the 174km UTMB. The generic chips below are
 * event-level, so both exist and the shortcut is the stricter one.
 *
 * `torx-330`'s distance is `330k`, which is what the recorded rows carry —
 * `data/race-categories.csv` has no rows at all for `other-tor-des-geants`,
 * so there is no catalogue entry to read it from and no picker constraining
 * it. `U-RIDERFILTER` asserts these ids against the recorded data's shape
 * rather than the catalogue for that reason: a typo here awards the chip to
 * nobody, silently, which is exactly the failure the CSV cannot catch.
 *
 * The ids are not event keys and must never collide with one, since both
 * share one `?badge=` namespace. Asserted, not assumed.
 */
export type RiderBadgeShortcut = {
  id: string;
  label: string;
  /** Absent for six-majors, which is an achievement rather than a race. */
  eventId?: string;
  distanceId?: string;
};

export const RIDER_BADGE_SHORTCUTS: readonly RiderBadgeShortcut[] = [
  { id: SIX_MAJORS_ID, label: SIX_MAJORS_LABEL_ZH },
  {
    id: "utmb-100m",
    label: "UTMB 100M",
    eventId: "utmb-mont-blanc",
    distanceId: "utmb",
  },
  {
    id: "torx-330",
    label: "TORX 330",
    eventId: "other-tor-des-geants",
    distanceId: "330k",
  },
];

/** A chip: what it says, what it selects, and how many it would show. */
export type RiderBadgeOption = {
  id: string;
  label: string;
  count: number;
  shortcut: boolean;
};

/**
 * The selected badges, deduped and in a canonical order.
 *
 * Sorted so that one selection has exactly one URL: the chips build hrefs
 * by toggling, and without an order the same pair of badges would produce
 * two different links depending on which was clicked first — two cache
 * entries, two "is this chip current" comparisons, and a shared link that
 * does not match the one in the address bar.
 *
 * An id that matches nothing is *kept*, not discarded. Silently dropping it
 * would show the full directory under a chip nobody selected, which reads
 * as "these are the six-major finishers" — the one wrong answer this
 * feature could give. An unknown id gets an empty list and says so.
 */
export function parseRiderBadges(
  params: Record<string, string | string[] | undefined>,
): string[] {
  const raw = params.badge;
  const values = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

/** `/riders`, filtered. No parameter for "everybody", so the URL stays clean. */
export function riderBadgesHref(badges: readonly string[]): string {
  const unique = [...new Set(badges)].sort();
  if (unique.length === 0) return "/riders";
  const params = new URLSearchParams();
  for (const badge of unique) params.append("badge", badge);
  return `/riders?${params.toString()}`;
}

/** The selection a chip's link carries: this badge added, or removed. */
export function toggleRiderBadge(
  selected: readonly string[],
  badge: string,
): string[] {
  return selected.includes(badge)
    ? selected.filter((entry) => entry !== badge)
    : [...selected, badge];
}

/** Whether one rider's history satisfies a badge id. */
export function riderMatchesBadge(
  records: readonly SiteRaceRecord[],
  badge: string,
): boolean {
  if (badge === SIX_MAJORS_ID) {
    return sixMajorsCompletion(records) !== undefined;
  }

  const shortcut = RIDER_BADGE_SHORTCUTS.find((entry) => entry.id === badge);
  if (shortcut?.eventId) {
    return records.some(
      (record) =>
        record.eventId === shortcut.eventId &&
        (shortcut.distanceId === undefined ||
          record.distanceId === shortcut.distanceId),
    );
  }

  // Anything else is an event key, which is what the generic chips carry.
  return records.some((record) => record.eventId === badge);
}

/** Every selected badge, not any — see the header. */
export function riderMatchesAllBadges(
  records: readonly SiteRaceRecord[],
  badges: readonly string[],
): boolean {
  return badges.every((badge) => riderMatchesBadge(records, badge));
}

export function filterRidersByBadges<T extends { races: SiteRaceRecord[] }>(
  riders: readonly T[],
  badges: readonly string[],
): T[] {
  if (badges.length === 0) return [...riders];
  return riders.filter((rider) => riderMatchesAllBadges(rider.races, badges));
}

/**
 * The chips to offer, with the number each would show.
 *
 * Built from what riders have actually run, never from the catalogue: the
 * catalogue holds hundreds of events, and a chip for a race nobody here has
 * done is a control whose only outcome is an empty page — the same
 * reasoning that keeps the marathon majors off `/races`.
 *
 * The three shortcuts are the exception and appear even at zero, because
 * they were asked for by name and their absence would read as a missing
 * feature rather than an empty club shelf.
 *
 * EVERY COUNT IS OF THE SELECTION INCLUDING THAT CHIP, not of the badge
 * alone. With AND, a chip advertising its own total is a lie the moment
 * anything else is selected — 「UTMB 100M 1」 beside an already-chosen
 * 「六大」 leads to an empty page, which is exactly the click the count
 * exists to prevent. For a chip already selected the two are the same
 * number, so it reads as the current result.
 *
 * The list of chips does not shrink as badges are selected. It is built
 * from every rider, so a chip can show 0 — a control that vanished on
 * selection would make the way back out of a dead end disappear with it.
 */
export function riderBadgeOptions(
  riders: readonly SiteRider[],
  catalogue: RaceCatalogueMap,
  selected: readonly string[] = [],
): RiderBadgeOption[] {
  const countWith = (badge: string) => {
    const withBadge = selected.includes(badge) ? selected : [...selected, badge];
    return riders.filter((rider) => riderMatchesAllBadges(rider.races, withBadge))
      .length;
  };

  const shortcuts = RIDER_BADGE_SHORTCUTS.map((entry) => ({
    id: entry.id,
    label: entry.label,
    count: countWith(entry.id),
    shortcut: true,
  }));

  const ridersByEvent = new Map<string, number>();
  for (const rider of riders) {
    // Per rider, not per record: somebody who ran the same race four times
    // is one person in the list the chip would show.
    for (const eventId of new Set(rider.races.map((race) => race.eventId))) {
      ridersByEvent.set(eventId, (ridersByEvent.get(eventId) ?? 0) + 1);
    }
  }

  const events = [...ridersByEvent.keys()]
    .map((eventId) => ({
      id: eventId,
      // A renamed or retired event still has records pointing at it, and the
      // key is the honest fallback — the same choice `resolveBadgeEvent`
      // makes rather than dropping the badge.
      label: labelForEvent(catalogue, eventId),
      count: countWith(eventId),
      shortcut: false,
    }))
    // Ordered by how many riders hold the badge at all, so the list does not
    // reshuffle under the cursor as chips are selected.
    .sort(
      (a, b) =>
        (ridersByEvent.get(b.id) ?? 0) - (ridersByEvent.get(a.id) ?? 0) ||
        a.label.localeCompare(b.label, "zh-Hant"),
    );

  return [...shortcuts, ...events];
}

function labelForEvent(catalogue: RaceCatalogueMap, eventId: string): string {
  const event = catalogue.get(eventId);
  if (!event) return eventId;
  return event.nameZh || event.name;
}
