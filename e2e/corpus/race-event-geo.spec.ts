import type { APIRequestContext } from "@playwright/test";

import { apiTest as test, expect } from "../helpers/api-test";
import { anonContext } from "../helpers/members";

/**
 * XG — the races club members ran have somewhere to be drawn.
 *
 * CORPUS-SCOPED, like `race-model.spec.ts` and for the same reason: every
 * other spec builds its own fixture, so nothing would notice if the corpus
 * itself had no coordinates. The footprint map has nothing to draw from an
 * environment where the events members raced were never placed, and that
 * looks, from a browser, like an empty page rather than a broken seed.
 *
 * Where the coordinates come from in this lane: `pnpm geocode:events` in
 * stand-in mode (scripts/lib/corpus.mjs), reading the committed
 * data/race-event-places.csv. So this fails when that file loses a row an
 * e2e record depends on, or when the seed drops the step — which is the
 * thing worth knowing before a journey that needs the map fails with a
 * message about the map.
 */
type Doc = Record<string, unknown> & { id: number };

async function all(api: APIRequestContext, collection: string): Promise<Doc[]> {
  const response = await api.get(`/api/${collection}?limit=0&pagination=false&depth=0`);
  expect(response.ok(), `${collection} is not readable`).toBeTruthy();
  return ((await response.json()) as { docs: Doc[] }).docs;
}

test.describe("XG race events on the map", () => {
  let events: Doc[];
  let records: Doc[];

  test.beforeAll(async ({ baseURL }) => {
    // Anonymous: coordinates are public reference data, and the map is a
    // public page. An admin-only read would hide an access regression.
    const api = await anonContext(baseURL);
    events = await all(api, "race-events");
    records = await all(api, "race-records");
    await api.dispose();
  });

  test("XG-T1: the events members raced are placed, and some of them are across the Pacific from each other", () => {
    // Protects against: a corpus where the map has no route to draw — fewer
    // than three places, or no flight that has to wrap the date line.
    const placed = new Map(
      events
        .filter((event) => typeof event.lat === "number" && typeof event.lng === "number")
        .map((event) => [event.key as string, event]),
    );
    const raced = [...new Set(records.map((record) => record.eventId as string))];
    const racedAndPlaced = raced.filter((key) => placed.has(key));
    expect(
      racedAndPlaced.length,
      `placed events with a record: ${racedAndPlaced.join(", ")} (of ${raced.join(", ")})`,
    ).toBeGreaterThanOrEqual(3);

    const lngs = racedAndPlaced.map((key) => placed.get(key)!.lng as number);
    const widest = Math.max(
      ...lngs.flatMap((a) => lngs.map((b) => Math.abs(a - b))),
    );
    // |Δlng| above 180 is the pairs whose short way round crosses the date
    // line — Colorado to Japan is 245.
    expect(widest, "no pair of raced events is more than 180° of longitude apart").toBeGreaterThan(180);
  });

  test("XG-T2: every coordinate is a whole point at city resolution", () => {
    // Protects against: a lone latitude (plots on an axis), a value out of
    // range (plots off the map), and false precision (a street-level number
    // the geocoder gave us and we promised not to keep).
    const bad = events
      .filter((event) => event.lat != null || event.lng != null)
      .filter((event) => {
        const { lat, lng } = event as { lat?: unknown; lng?: unknown };
        if (typeof lat !== "number" || typeof lng !== "number") return true;
        if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return true;
        // A person's own correction may be as precise as they like; only what
        // automation wrote is promised to be city-level.
        if (event.geoSource === "manual") return false;
        return Math.round(lat * 10) / 10 !== lat || Math.round(lng * 10) / 10 !== lng;
      })
      .map((event) => `${event.key}: ${event.lat},${event.lng}`);
    expect(bad).toEqual([]);
  });
});
