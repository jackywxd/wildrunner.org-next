import { expect, test } from "@playwright/test";

import {
  groupRecordsBySeries,
  resolveBadgeDistance,
  resolveBadgeEvent,
} from "@/lib/races/badge-source";
import { catalogueMap } from "@/lib/races/catalogue-shape";
import type { CatalogueEvent } from "@/lib/races/catalogue-shape";

/**
 * U-BADGE — the seam between a stored race record and a rendered badge.
 *
 * The four tests `docs/testing-plan.md` §2 lists against `badge-source.ts`.
 *
 * What makes them worth having is the failure mode. A badge is rendered from
 * an `eventId` and a `distanceId` that a member's record carries, and the
 * catalogue those ids resolve against is now `race-events`/`race-categories`
 * — rows a person edits, that can change between one render and the next. So
 * an id that resolves today may not tomorrow, and the badge is drawn
 * server-side into an image: a throw here is not a missing badge, it is a
 * 500 on a rider's whole page.
 *
 * That is the property being pinned. Not "the label is pretty" — "an unknown
 * id degrades and never throws".
 *
 * A HAND-BUILT CATALOGUE, NOT THE DATABASE. `resolveBadgeEvent` and friends
 * are pure functions of `(catalogue, id)` — they do not know or care whether
 * the Map came from a query or a fixture. Querying `race-events` here would
 * make this a contract test with a server and a database behind it, for a
 * property that has nothing to do with either: it is about what the function
 * does with a Map, which two lines can construct. Going up a level needs a
 * reason; there is none here.
 */
const CATALOGUE: CatalogueEvent[] = [
  {
    id: "utmb-mont-blanc",
    name: "UTMB Mont-Blanc",
    series: "utmb",
    distances: [{ id: "utmb", label: "UTMB" }],
  },
  {
    id: "other-hardrock",
    name: "Hardrock 100",
    series: "others",
    distances: [
      { id: "100m", label: "100M" },
      { id: "100k", label: "100K" },
    ],
  },
  { id: "utmb-lavaredo", name: "Lavaredo Ultra Trail", series: "utmb", distances: [] },
  { id: "wtm-hk100", name: "HK100", series: "wtm", distances: [] },
];
const catalogue = catalogueMap(CATALOGUE);

test.describe("U-BADGE badge source", () => {
  test("U-BADGE-1: a known event resolves to its own name and series", () => {
    const event = resolveBadgeEvent(catalogue, "utmb-mont-blanc");
    expect(event.id).toBe("utmb-mont-blanc");
    expect(event.name).toBeTruthy();
    expect(event.name).not.toBe("utmb-mont-blanc");
    // A real series, which is what decides the badge's colour family.
    expect(event.series).not.toBeNull();
  });

  test("U-BADGE-2: an unknown event degrades instead of throwing", () => {
    // The case that matters: this runs inside server-side image generation for
    // a rider page, so throwing would take out the page, not the badge.
    const event = resolveBadgeEvent(catalogue, "an-event-that-left-the-catalogue");
    expect(event.id).toBe("an-event-that-left-the-catalogue");
    expect(event.name).toBe("an-event-that-left-the-catalogue");
    // `null` is the documented signal for "resolved to nothing" and is what
    // the placeholder styling keys on — not a made-up series.
    expect(event.series).toBeNull();
  });

  test("U-BADGE-3: a known distance resolves to its label", () => {
    const distance = resolveBadgeDistance(catalogue, "other-hardrock", "100m");
    expect(distance.id).toBe("100m");
    expect(distance.label).toBeTruthy();
  });

  test("U-BADGE-4: an unresolvable distance is upper-cased, not left raw", () => {
    // Distance ids are lowercase by convention; a raw one sitting next to
    // properly-cased labels reads as a rendering bug rather than as missing
    // data. Both halves — unknown event, and known event with an unknown
    // distance — take the same path.
    expect(resolveBadgeDistance(catalogue, "nope", "100k").label).toBe("100K");
    expect(resolveBadgeDistance(catalogue, "other-hardrock", "50k").label).toBe(
      "50K",
    );
  });
});

/**
 * U-GROUP — which badge lands in which section of a rider's profile.
 *
 * This is the only real logic on that page, and verifying it used to cost a
 * dev server, a Payload instance, an emulated D1, an account created over
 * HTTP, two race records and two browser navigations — to read three data
 * attributes back out of rendered HTML. It is a pure function of an array.
 */
test.describe("U-GROUP records grouped by series", () => {
  const rec = (eventId: string) => ({ eventId });

  test("U-GROUP-1: each record lands in its own series and no other", () => {
    const { groups } = groupRecordsBySeries(catalogue, [
      rec("utmb-lavaredo"),
      rec("wtm-hk100"),
    ]);
    const bySeries = Object.fromEntries(
      groups.map((g) => [g.series, g.records.map((r) => r.eventId)]),
    );
    expect(bySeries.utmb).toEqual(["utmb-lavaredo"]);
    expect(bySeries.wtm).toEqual(["wtm-hk100"]);
  });

  test("U-GROUP-2: a series with no records produces no empty section", () => {
    // An empty heading with nothing under it reads as a broken page.
    const { groups } = groupRecordsBySeries(catalogue, [rec("utmb-lavaredo")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].series).toBe("utmb");
  });

  test("U-GROUP-3: a record whose event left the catalogue is kept, not dropped", () => {
    // It still belongs to the member. Silently discarding it would make a
    // badge vanish from someone's profile because the catalogue changed.
    const { groups, unknown } = groupRecordsBySeries(catalogue, [
      rec("utmb-lavaredo"),
      rec("an-event-that-left-the-catalogue"),
    ]);
    expect(unknown.map((r) => r.eventId)).toEqual([
      "an-event-that-left-the-catalogue",
    ]);
    expect(groups.flatMap((g) => g.records.map((r) => r.eventId))).toEqual([
      "utmb-lavaredo",
    ]);
  });

  test("U-GROUP-4: no records at all is empty, not a crash", () => {
    const { groups, unknown } = groupRecordsBySeries(catalogue, []);
    expect(groups).toEqual([]);
    expect(unknown).toEqual([]);
  });
});
