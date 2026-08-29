import { expect, test } from "@playwright/test";

import type { SiteRider } from "@/lib/content-types";
import type { RaceCatalogueMap } from "@/lib/races/catalogue-shape";
import { SIX_MAJORS, SIX_MAJORS_ID } from "@/lib/races/six-majors";
import {
  RIDER_BADGE_SHORTCUTS,
  filterRidersByBadges,
  parseRiderBadges,
  riderBadgeOptions,
  riderBadgesHref,
  riderMatchesBadge,
  toggleRiderBadge,
} from "@/lib/riders/badge-filter";

/**
 * U-RIDERFILTER — who the directory shows when a badge is picked.
 *
 * The filter answers one question — "who has run this" — and the way it can
 * fail is by answering it wrongly while looking fine: a shortcut whose ids
 * do not match how the records are actually written awards the chip to
 * nobody, and an empty result page is indistinguishable from an honest
 * "nobody here has done it". Nothing on screen separates the two.
 *
 * So the fixtures below are the *recorded* rows from production, verbatim,
 * rather than something plausible. `other-tor-des-geants` carries the
 * distance `330k` even though `data/race-categories.csv` has no rows at all
 * for that event, which means no catalogue entry and no picker constrains
 * it — the only place that pairing is written down is the data itself.
 */

const record = (eventId: string, distanceId: string, year: number) => ({
  id: Math.floor(Math.random() * 1e6),
  eventId,
  distanceId,
  year,
});

const rider = (slug: string, races: ReturnType<typeof record>[]): SiteRider => ({
  slug,
  name: slug,
  postCount: 0,
  races,
});

/** Exactly what production held when this was written. */
const ANNA = rider("anna", [
  record("wtm-hk100", "100k", 2018),
  record("utmb-mont-blanc", "utmb", 2023),
  record("wtm-mt-fuji", "fuji100", 2024),
  record("utmb-whistler", "100k", 2024),
  record("other-tor-des-geants", "330k", 2025),
  record("other-canadian-death-race", "118k", 2026),
]);
const BEN = rider("ben", [record("utmb-mrww", "mrt", 2026)]);
/** Nobody in production has these. The badge has to be reachable anyway. */
const CHLOE = rider(
  "chloe",
  SIX_MAJORS.map((key, index) => record(key, "marathon", 2020 + index)),
);
/** Ran the 15km ETC at Mont-Blanc — the same event, not the same race. */
const DAN = rider("dan", [record("utmb-mont-blanc", "etc", 2024)]);

const catalogue = new Map([
  [
    "utmb-mont-blanc",
    { id: "utmb-mont-blanc", name: "UTMB Mont-Blanc", nameZh: "UTMB 白朗峰", distances: [] },
  ],
  ["wtm-hk100", { id: "wtm-hk100", name: "HK100", distances: [] }],
]) as unknown as RaceCatalogueMap;

test.describe("U-RIDERFILTER filtering the directory by badge", () => {
  test("U-RIDERFILTER-1: the shortcuts match the rows as they are actually written", () => {
    // The assertion the shortcuts exist for. Each id is a pair nothing else
    // validates: the catalogue cannot, because it has no categories for
    // TOR at all.
    expect(riderMatchesBadge(ANNA.races, "utmb-100m")).toBe(true);
    expect(riderMatchesBadge(ANNA.races, "torx-330")).toBe(true);
    expect(riderMatchesBadge(BEN.races, "utmb-100m")).toBe(false);
    expect(riderMatchesBadge(BEN.races, "torx-330")).toBe(false);
  });

  test("U-RIDERFILTER-2: a shortcut is the distance, not just the event", () => {
    // Dan ran the 15km ETC at Mont-Blanc. An event-level chip would put him
    // in a list of 174km finishers, which is the whole reason these two
    // shortcuts name a distance.
    expect(riderMatchesBadge(DAN.races, "utmb-100m")).toBe(false);
    // …while the generic event chip does include him, and should.
    expect(riderMatchesBadge(DAN.races, "utmb-mont-blanc")).toBe(true);
  });

  test("U-RIDERFILTER-3: six majors needs all six", () => {
    expect(riderMatchesBadge(CHLOE.races, SIX_MAJORS_ID)).toBe(true);
    expect(riderMatchesBadge(ANNA.races, SIX_MAJORS_ID)).toBe(false);
    // Five of six is not five sixths of a badge.
    const five = CHLOE.races.slice(0, 5);
    expect(riderMatchesBadge(five, SIX_MAJORS_ID)).toBe(false);
  });

  test("U-RIDERFILTER-4: shortcut ids can never collide with an event key", () => {
    // Both live in one `?badge=` namespace, so a shortcut id that happened
    // to equal an event key would make one of them unreachable — and the
    // one that lost would be the stricter shortcut, silently widening the
    // result instead of failing.
    const everyEventId = [ANNA, BEN, CHLOE, DAN].flatMap((entry) =>
      entry.races.map((race) => race.eventId),
    );
    for (const shortcut of RIDER_BADGE_SHORTCUTS) {
      expect(everyEventId, `shortcut ${shortcut.id} collides`).not.toContain(
        shortcut.id,
      );
    }
  });

  test("U-RIDERFILTER-5: the chips offer only what somebody has run", () => {
    const options = riderBadgeOptions([ANNA, BEN, DAN], catalogue);

    // The three shortcuts always, even at zero — nobody has the six majors
    // here, and the chip still has to exist and say so.
    const shortcuts = options.filter((option) => option.shortcut);
    expect(shortcuts.map((option) => option.id)).toEqual([
      SIX_MAJORS_ID,
      "utmb-100m",
      "torx-330",
    ]);
    expect(shortcuts.find((o) => o.id === SIX_MAJORS_ID)?.count).toBe(0);
    expect(shortcuts.find((o) => o.id === "utmb-100m")?.count).toBe(1);

    const events = options.filter((option) => !option.shortcut);
    // Two riders ran Mont-Blanc, at different distances, and it is one chip
    // counting two people — not two chips, and not one counting two rows.
    expect(events.find((o) => o.id === "utmb-mont-blanc")?.count).toBe(2);
    // Catalogue names win over keys where there is one; the key is the
    // fallback that keeps a retired event's chip readable.
    expect(events.find((o) => o.id === "utmb-mont-blanc")?.label).toBe(
      "UTMB 白朗峰",
    );
    expect(events.find((o) => o.id === "utmb-mrww")?.label).toBe("utmb-mrww");
    // Nothing nobody has run. The catalogue holds hundreds of events.
    expect(events.some((o) => o.id === "utmb-chianti")).toBe(false);
  });

  test("U-RIDERFILTER-6: an unknown badge shows nobody, and never everybody", () => {
    // The wrong answer this could give: dropping an id it does not
    // recognise and rendering the whole club under a chip nobody chose.
    expect(filterRidersByBadges([ANNA, BEN], ["not-a-badge"])).toEqual([]);
    expect(filterRidersByBadges([ANNA, BEN], [])).toHaveLength(2);
    expect(filterRidersByBadges([ANNA, BEN], ["torx-330"])).toHaveLength(1);
  });

  test("U-RIDERFILTER-7: several badges mean all of them, not any of them", () => {
    // The whole difference between the two readings, on data where they
    // disagree: Anna holds both, Ben holds neither, and an OR would answer
    // "Anna and Ben" to a question that has one right answer.
    expect(
      filterRidersByBadges([ANNA, BEN, DAN], ["utmb-100m", "torx-330"]),
    ).toEqual([ANNA]);

    // And an unreachable combination is empty rather than partially
    // satisfied. Anna has TOR; she has not run the six majors.
    expect(
      filterRidersByBadges([ANNA, BEN, DAN], [SIX_MAJORS_ID, "torx-330"]),
    ).toEqual([]);
  });

  test("U-RIDERFILTER-8: a chip counts the selection it would produce", () => {
    // With AND this is the difference between a usable filter and a trap.
    // On its own `utmb-100m` has one holder, but beside a selected
    // 「六大」 that nobody has, clicking it can only ever give an empty
    // page — so that is the number the chip has to show.
    const alone = riderBadgeOptions([ANNA, BEN, DAN], catalogue, []);
    expect(alone.find((o) => o.id === "utmb-100m")?.count).toBe(1);

    const withSixMajors = riderBadgeOptions([ANNA, BEN, DAN], catalogue, [
      SIX_MAJORS_ID,
    ]);
    expect(withSixMajors.find((o) => o.id === "utmb-100m")?.count).toBe(0);

    // A chip already selected shows the current result rather than what
    // removing it would give — the number beside it describes the page you
    // are on, which is the only reading that is not a surprise.
    expect(withSixMajors.find((o) => o.id === SIX_MAJORS_ID)?.count).toBe(0);

    // The list itself does not shrink as things are selected: the way out
    // of a dead end must not disappear with the dead end.
    expect(withSixMajors).toHaveLength(alone.length);
  });

  test("U-RIDERFILTER-9: the URL round-trips, and one selection has one URL", () => {
    expect(riderBadgesHref([])).toBe("/riders");
    expect(riderBadgesHref([SIX_MAJORS_ID])).toBe("/riders?badge=six-majors");

    // Canonical order, so a pair reached by two different click sequences
    // shares one link — otherwise a shared URL would not match the one in
    // the address bar, and `active` comparisons would differ from it too.
    expect(riderBadgesHref(["utmb-100m", SIX_MAJORS_ID])).toBe(
      riderBadgesHref([SIX_MAJORS_ID, "utmb-100m"]),
    );
    expect(riderBadgesHref(["utmb-100m", SIX_MAJORS_ID])).toBe(
      "/riders?badge=six-majors&badge=utmb-100m",
    );
    // A duplicate in the URL is one selection, not two.
    expect(riderBadgesHref(["torx-330", "torx-330"])).toBe(
      "/riders?badge=torx-330",
    );

    expect(parseRiderBadges({})).toEqual([]);
    expect(parseRiderBadges({ badge: "" })).toEqual([]);
    expect(parseRiderBadges({ badge: "  " })).toEqual([]);
    expect(parseRiderBadges({ badge: "torx-330" })).toEqual(["torx-330"]);
    expect(parseRiderBadges({ badge: ["utmb-100m", "torx-330"] })).toEqual([
      "torx-330",
      "utmb-100m",
    ]);
    expect(parseRiderBadges({ badge: ["torx-330", "torx-330"] })).toEqual([
      "torx-330",
    ]);
  });

  test("U-RIDERFILTER-10: a chip's own link adds it, and removes it once selected", () => {
    expect(toggleRiderBadge([], "torx-330")).toEqual(["torx-330"]);
    expect(toggleRiderBadge(["torx-330"], "utmb-100m")).toEqual([
      "torx-330",
      "utmb-100m",
    ]);
    // The second press is the way back out. Without it a selected chip is
    // a one-way door and the only escape is 全部, which clears everything.
    expect(toggleRiderBadge(["torx-330", "utmb-100m"], "torx-330")).toEqual([
      "utmb-100m",
    ]);
  });
});
