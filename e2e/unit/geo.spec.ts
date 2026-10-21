import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  ISO_ALPHA_ENTRIES,
  alpha2ToAlpha3,
  alpha3ToAlpha2,
} from "@/lib/geo/iso-alpha";
import { buildSearchUrl, readHit } from "@/lib/geo/nominatim";
import { parsePlaceCsv, serializePlaceCsv } from "@/lib/geo/place-csv";
import {
  isHandEditedPoint,
  parseModelPlace,
  resolveEventGeo,
  shouldRefreshFromEdition,
  shouldResolveEvent,
  startPlaceOf,
  type EventGeoInput,
  type GeoDeps,
} from "@/lib/geo/resolve-event-place";

/**
 * U-GEO — placing a race on the footprint map without trusting anything that
 * cannot be checked.
 *
 * Pure functions only (docs/testing-strategy.md §4): the model, the geocoder
 * and the clock are passed in, so every decision below is exercised with no
 * network. The real Nominatim and the real model are measured on staging by
 * `pnpm geocode:events:staging`, which is the only place they can be.
 */

const NOW = new Date("2026-10-20T12:00:00.000Z");

/** Fakes that record whether they were asked, so "never called" is assertable. */
function deps(overrides: Partial<GeoDeps> = {}) {
  const calls = { model: 0, geocode: [] as { query: string; countryAlpha2?: string; relaxed?: boolean }[] };
  const built: GeoDeps = {
    askModel: async () => {
      calls.model += 1;
      return '{"city":"Squamish","region":"British Columbia","country_alpha2":"CA"}';
    },
    geocode: async (query) => {
      calls.geocode.push(query);
      return { lat: 49.7016, lng: -123.1558, displayName: "Squamish", countryAlpha2: "CA" };
    },
    now: () => NOW,
    ...overrides,
  };
  return { built, calls };
}

const event = (overrides: Partial<EventGeoInput> = {}): EventGeoInput => ({
  key: "other-squamish-50",
  name: "Squamish 50",
  country: "CAN",
  ...overrides,
});

test.describe("U-GEO placing a race event on the map", () => {
  test("U-GEO-T1: a point-to-point or multi-venue location is geocoded from its START, with the region kept", () => {
    // Protects against: sending the whole string, or the finish, to the
    // geocoder — "Sierre → Zinal, Valais" resolving to Zinal puts the dot a
    // valley away from where the club's runners stand at the gun.
    expect(startPlaceOf("Sierre → Zinal, Valais")).toBe("Sierre, Valais");
    expect(startPlaceOf("Olympic Valley → Auburn, California")).toBe(
      "Olympic Valley, California",
    );
    expect(startPlaceOf("Charlevoix / Côte-de-Beaupré, Québec")).toBe(
      "Charlevoix, Québec",
    );
    expect(startPlaceOf("Spring Valley to New River, Arizona")).toBe(
      "Spring Valley, Arizona",
    );
    // A part that carries its own region keeps it rather than borrowing.
    expect(startPlaceOf("Whistler, British Columbia → Pemberton, BC")).toBe(
      "Whistler, British Columbia",
    );
    // Single place: unchanged. Parenthetical remarks are not places, and the
    // slash inside one is not a second venue.
    expect(startPlaceOf("Squamish, British Columbia")).toBe("Squamish, British Columbia");
    expect(startPlaceOf("Mallorca (Serra de Tramuntana / Es Port)")).toBe("Mallorca");
    expect(startPlaceOf("Malaucène, Provence (Mont Ventoux)")).toBe("Malaucène, Provence");
    // Many venues, one region nowhere: the first.
    expect(
      startPlaceOf("Crans-Montana / Kandersteg / Adelboden / Lenk / Leukerbad"),
    ).toBe("Crans-Montana");
    // Nothing to geocode is nothing, not an empty query.
    expect(startPlaceOf("")).toBeNull();
    expect(startPlaceOf("   ")).toBeNull();
    expect(startPlaceOf(null)).toBeNull();
    expect(startPlaceOf("(TBC)")).toBeNull();
  });

  test("U-GEO-T2: an edition's location outranks the model, and a manual point is never up for replacement", async () => {
    // Protects against: the model's guess overwriting a place somebody wrote
    // down from the organiser's page, and any automatic process moving a dot
    // a person put there.

    // (a) With an edition location the model is not even asked.
    const withEdition = deps();
    const fromEdition = await resolveEventGeo(
      withEdition.built,
      event({ editionLocation: "Squamish, British Columbia" }),
    );
    expect(withEdition.calls.model).toBe(0);
    expect(fromEdition).toMatchObject({
      geoStatus: "ok",
      geoSource: "edition",
      lat: 49.7,
      lng: -123.2,
    });
    // And the geocoder was held to the event's country.
    expect(withEdition.calls.geocode).toEqual([
      { query: "Squamish, British Columbia", countryAlpha2: "CA" },
    ]);

    // (b) Without one, the model supplies the NAME and the source says so.
    const withoutEdition = deps();
    const fromModel = await resolveEventGeo(withoutEdition.built, event());
    expect(withoutEdition.calls.model).toBe(1);
    expect(fromModel.geoSource).toBe("ai");
    expect(withoutEdition.calls.geocode[0].query).toBe("Squamish, British Columbia");

    // (c) A new location on an edition re-points an `ai` or `edition` event
    // and never a `manual` one; an unchanged or emptied location does nothing.
    const refresh = (eventGeoSource: string | null, location: string, previousLocation: string) =>
      shouldRefreshFromEdition({ eventGeoSource, location, previousLocation });
    expect(refresh(null, "Chamonix", "")).toBe(true);
    expect(refresh("ai", "Chamonix", "")).toBe(true);
    expect(refresh("edition", "Courmayeur", "Chamonix")).toBe(true);
    expect(refresh("manual", "Chamonix", "")).toBe(false);
    expect(refresh("ai", "Chamonix", "Chamonix")).toBe(false);
    expect(refresh("ai", "", "Chamonix")).toBe(false);

    // (d) Saving an event looks it up when new, but never a manual one, one
    // that has a point, or one whose lookup already concluded for the same
    // name and country — that would spend a model call per unrelated save.
    const create = (doc: object) => shouldResolveEvent({ operation: "create", doc });
    const update = (doc: object, previousDoc: object) =>
      shouldResolveEvent({ operation: "update", doc, previousDoc });
    expect(create({ name: "A" })).toBe(true);
    expect(create({ name: "A", geoSource: "manual" })).toBe(false);
    expect(create({ name: "A", lat: 1, lng: 2 })).toBe(false);
    expect(update({ name: "A", geoStatus: "no-place" }, { name: "A" })).toBe(false);
    expect(update({ name: "A", geoStatus: "not-found" }, { name: "A" })).toBe(false);
    expect(update({ name: "A", geoStatus: "failed" }, { name: "A" })).toBe(true);
    expect(update({ name: "A" }, { name: "A" })).toBe(true);
    expect(update({ name: "B", geoStatus: "no-place" }, { name: "A", geoStatus: "no-place" })).toBe(true);
    expect(update({ name: "B", geoSource: "manual", geoStatus: "ok" }, { name: "A" })).toBe(false);

    // (e) Telling a person's coordinates from the form echoing them back, and
    // from a partial update that never mentioned them.
    const original = { lat: 46.9, lng: 7.4 };
    expect(isHandEditedPoint({ operation: "update", data: { lat: 45.1 }, originalDoc: original })).toBe(true);
    expect(isHandEditedPoint({ operation: "update", data: { lat: 46.9, lng: 7.4 }, originalDoc: original })).toBe(false);
    expect(isHandEditedPoint({ operation: "update", data: { name: "Renamed" }, originalDoc: original })).toBe(false);
    expect(isHandEditedPoint({ operation: "update", data: { lat: null, lng: null }, originalDoc: original })).toBe(false);
    expect(isHandEditedPoint({ operation: "create", data: { lat: 1, lng: 2 } })).toBe(true);
    expect(isHandEditedPoint({ operation: "create", data: {} })).toBe(false);
  });

  test("U-GEO-T3: nothing the model says can write a coordinate unless it names a real place in the right country", async () => {
    // Protects against: a dot on the wrong continent from a model that
    // answered in prose, answered `null`, volunteered numbers, or contradicted
    // the catalogue about the country.
    const garbage = [
      "I believe the race starts in Squamish, Canada.",
      "null",
      "NULL",
      "",
      "[]",
      '["Squamish"]',
      "{}",
      '{"city": ""}',
      '{"city": 7}',
      '{"lat": 49.7, "lng": -123.1}',
      "{not json",
    ];
    for (const reply of garbage) {
      expect(parseModelPlace(reply), JSON.stringify(reply)).toBeNull();
      const run = deps({ askModel: async () => reply });
      const outcome = await resolveEventGeo(run.built, event());
      expect(outcome.geoStatus, JSON.stringify(reply)).toBe("no-place");
      expect(outcome.lat).toBeUndefined();
      // Garbage never reaches the geocoder at all.
      expect(run.calls.geocode, JSON.stringify(reply)).toHaveLength(0);
    }

    // Fenced output is formatting, not a different answer.
    expect(parseModelPlace('```json\n{"city":"Squamish","country_alpha2":"ca"}\n```')).toEqual({
      city: "Squamish",
      countryAlpha2: "CA",
    });

    // A model that volunteers coordinates has them ignored, not used.
    const greedy = deps({
      askModel: async () =>
        '{"city":"Squamish","region":"BC","country_alpha2":"CA","lat":10,"lng":10}',
    });
    const greedyOutcome = await resolveEventGeo(greedy.built, event());
    expect(greedyOutcome.lat).toBe(49.7);
    expect(greedy.calls.geocode[0]).toEqual({ query: "Squamish, BC", countryAlpha2: "CA" });

    // The model contradicting the catalogue is a refusal to place, whichever
    // of them is right — the geocoder is never asked.
    const wrongCountry = deps({
      askModel: async () => '{"city":"Valdivia","country_alpha2":"AR"}',
    });
    const mismatch = await resolveEventGeo(wrongCountry.built, event({ country: "CHL" }));
    expect(mismatch.geoStatus).toBe("no-place");
    expect(wrongCountry.calls.geocode).toHaveLength(0);

    // A model error and a geocoder error are `failed` (retry), a geocoder
    // that answered "nothing" is `not-found` (look at the name), and the
    // geocoder resolving to the wrong country is `not-found`, never ok.
    const down = deps({
      askModel: async () => {
        throw new Error("429 rate limited");
      },
    });
    expect((await resolveEventGeo(down.built, event())).geoStatus).toBe("failed");
    const offline = deps({
      geocode: async () => {
        throw new Error("timeout");
      },
    });
    expect((await resolveEventGeo(offline.built, event())).geoStatus).toBe("failed");
    const empty = deps({ geocode: async () => null });
    expect((await resolveEventGeo(empty.built, event())).geoStatus).toBe("not-found");
    const elsewhere = deps({
      geocode: async () => ({ lat: -34.6, lng: -58.4, displayName: "Valdivia", countryAlpha2: "AR" }),
    });
    const wrongHit = await resolveEventGeo(
      elsewhere.built,
      event({ country: "CHL", editionLocation: "Valdivia" }),
    );
    expect(wrongHit.geoStatus).toBe("not-found");
    expect(wrongHit.lat).toBeUndefined();

    // An event with no country is told one — from the result, in alpha-3.
    const noCountry = deps();
    const filled = await resolveEventGeo(noCountry.built, event({ country: null }));
    expect(filled.country).toBe("CAN");
    // …and one that has a country keeps its own, untouched.
    const hasCountry = await resolveEventGeo(deps().built, event({ country: "CAN" }));
    expect(hasCountry.country).toBeUndefined();
  });

  test("U-GEO-T4: alpha-2 and alpha-3 convert both ways, and the table is a bijection", () => {
    // Protects against: the wrong country being filled in (or the wrong one
    // being the geocoder's `countrycodes` guard) from a swapped row.
    const pairs: [string, string][] = [
      ["CA", "CAN"], ["US", "USA"], ["FR", "FRA"], ["GB", "GBR"], ["CH", "CHE"],
      ["IT", "ITA"], ["ES", "ESP"], ["DE", "DEU"], ["JP", "JPN"], ["HK", "HKG"],
      ["TW", "TWN"], ["CN", "CHN"], ["ZA", "ZAF"], ["NZ", "NZL"], ["AU", "AUS"],
      ["CL", "CHL"], ["AR", "ARG"], ["BR", "BRA"], ["EC", "ECU"], ["PT", "PRT"],
      ["AT", "AUT"], ["SI", "SVN"], ["HR", "HRV"], ["SE", "SWE"], ["TR", "TUR"],
      ["MY", "MYS"], ["VN", "VNM"], ["OM", "OMN"], ["MX", "MEX"], ["AD", "AND"],
    ];
    for (const [a2, a3] of pairs) {
      expect(alpha2ToAlpha3(a2), a2).toBe(a3);
      expect(alpha3ToAlpha2(a3), a3).toBe(a2);
    }
    // Case and whitespace are not part of the code; unknown is unknown, not a guess.
    expect(alpha2ToAlpha3(" ca ")).toBe("CAN");
    expect(alpha3ToAlpha2("can")).toBe("CA");
    expect(alpha2ToAlpha3("ZZ")).toBeUndefined();
    expect(alpha3ToAlpha2("XXX")).toBeUndefined();
    expect(alpha2ToAlpha3(undefined)).toBeUndefined();

    // Structure: one row per country in each column, nothing malformed.
    expect(ISO_ALPHA_ENTRIES.length).toBeGreaterThanOrEqual(240);
    expect(new Set(ISO_ALPHA_ENTRIES.map(([a2]) => a2)).size).toBe(ISO_ALPHA_ENTRIES.length);
    expect(new Set(ISO_ALPHA_ENTRIES.map(([, a3]) => a3)).size).toBe(ISO_ALPHA_ENTRIES.length);
    for (const [a2, a3] of ISO_ALPHA_ENTRIES) {
      expect(a2).toMatch(/^[A-Z]{2}$/);
      expect(a3).toMatch(/^[A-Z]{3}$/);
    }
  });

  test("U-GEO-T5: the committed places file reads back, names real events, and keeps its commas", () => {
    // Protects against: the stand-in (CI's only geocoder) silently losing a
    // row to a CSV quoting bug, or carrying a key no event has — a typo there
    // reads as "this event has no place" with nothing to say why.
    const rows = parsePlaceCsv(
      readFileSync(path.resolve("data", "race-event-places.csv"), "utf8"),
    );
    const eventKeys = new Set(
      readFileSync(path.resolve("data", "race-events.csv"), "utf8")
        .split("\n")
        .slice(1)
        .map((line) => line.split(",")[0])
        .filter(Boolean),
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(eventKeys.has(row.eventKey), `${row.eventKey} is not in race-events.csv`).toBe(true);
      expect(Math.abs(row.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(row.lng)).toBeLessThanOrEqual(180);
    }
    expect(new Set(rows.map((row) => row.eventKey)).size).toBe(rows.length);

    const tricky = [
      { eventKey: "b", place: 'Saint-Pierre, "La Réunion"', lat: -21.3, lng: 55.5, source: "edition" as const, geocodedAt: "2026-10-20T00:00:00.000Z" },
      { eventKey: "a", place: "Squamish", lat: 49.7, lng: -123.2, source: "ai" as const, geocodedAt: "" },
    ];
    // Sorted on write, identical on read.
    expect(parsePlaceCsv(serializePlaceCsv(tricky))).toEqual([tricky[1], tricky[0]]);
  });

  test("U-GEO-T6: the geocoder is asked for a settlement, one result, inside the event's country", () => {
    // Protects against: a street or a mountain coming back as "the city", and
    // a namesake in another country winning because the country was dropped.
    const url = new URL(buildSearchUrl({ query: "Valdivia", countryAlpha2: "CL" }));
    expect(url.searchParams.get("featureType")).toBe("settlement");
    expect(url.searchParams.get("limit")).toBe("1");
    expect(url.searchParams.get("countrycodes")).toBe("cl");
    expect(url.searchParams.get("q")).toBe("Valdivia");
    expect(new URL(buildSearchUrl({ query: "Valdivia" })).searchParams.has("countrycodes")).toBe(false);

    // The relaxed request differs in exactly one parameter: no featureType.
    // Same text, same single result, same country — so it can only be a
    // looser question, never a wider one.
    const relaxed = new URL(
      buildSearchUrl({ query: "Valdivia", countryAlpha2: "CL", relaxed: true }),
    );
    expect(relaxed.searchParams.has("featureType")).toBe(false);
    expect(relaxed.searchParams.get("limit")).toBe("1");
    expect(relaxed.searchParams.get("countrycodes")).toBe("cl");
    expect(relaxed.searchParams.get("q")).toBe("Valdivia");
    const strictParams = new URL(buildSearchUrl({ query: "Valdivia", countryAlpha2: "CL" })).searchParams;
    strictParams.delete("featureType");
    expect(relaxed.searchParams.toString()).toBe(strictParams.toString());

    expect(
      readHit([{ lat: "49.70", lon: "-123.15", name: "Squamish", address: { country_code: "ca" } }]),
    ).toEqual({ lat: 49.7, lng: -123.15, displayName: "Squamish", countryAlpha2: "CA" });
    // Nothing, or numbers that are not coordinates, is "not found".
    expect(readHit([])).toBeNull();
    expect(readHit([{ lat: "north", lon: "-123", name: "X" }])).toBeNull();
    expect(readHit([{ lat: "95", lon: "0", name: "X" }])).toBeNull();
    expect(readHit({ error: "rate limited" })).toBeNull();
  });

  test("U-GEO-T7: a place the settlement query misses is asked once more, loosely, and only where something still pins it", async () => {
    // Protects against: a district or island ("Sai Kung", "Mallorca") left
    // off the map for want of a second question — and, the other way, a
    // loose question that is allowed to run with no country and no human
    // text behind it, where a namesake on another continent would win.
    const strictMiss = (hit: { lat: number; lng: number; displayName: string; countryAlpha2?: string }) =>
      deps({
        geocode: async (req) => {
          calls.push(req);
          return req.relaxed ? hit : null;
        },
      });
    const calls: { query: string; countryAlpha2?: string; relaxed?: boolean }[] = [];
    const sai = { lat: 22.3833, lng: 114.2703, displayName: "Sai Kung", countryAlpha2: "HK" };

    // (a) strict miss -> relaxed hit -> ok, marked, rounded, same text and country.
    const hit = await resolveEventGeo(
      strictMiss(sai).built,
      event({ key: "wtm-hk100", country: "HKG", editionLocation: "Sai Kung, New Territories" }),
    );
    expect(hit).toMatchObject({
      geoStatus: "ok",
      geoSource: "edition",
      geoPlace: "Sai Kung (relaxed)",
      lat: 22.4,
      lng: 114.3,
    });
    expect(calls).toEqual([
      { query: "Sai Kung, New Territories", countryAlpha2: "HK" },
      { query: "Sai Kung, New Territories", countryAlpha2: "HK", relaxed: true },
    ]);

    // (b) a strict hit never spends the second query and carries no marker.
    const strict = deps();
    const strictHit = await resolveEventGeo(
      strict.built,
      event({ editionLocation: "Squamish, British Columbia" }),
    );
    expect(strict.calls.geocode).toHaveLength(1);
    expect(strictHit.geoPlace).toBe("Squamish");

    // (c) both miss -> not-found, after exactly two questions.
    const bothMiss = deps({ geocode: async () => null });
    const miss = await resolveEventGeo(bothMiss.built, event({ editionLocation: "Nowhere" }));
    expect(miss.geoStatus).toBe("not-found");
    expect(miss.lat).toBeUndefined();

    // (d) the relaxed answer is held to the same country as the strict one.
    const wrongCountry = deps({
      geocode: async (req) =>
        req.relaxed ? { lat: 1, lng: 2, displayName: "Elsewhere", countryAlpha2: "AR" } : null,
    });
    expect(
      (await resolveEventGeo(wrongCountry.built, event({ country: "CHL", editionLocation: "Valdivia" })))
        .geoStatus,
    ).toBe("not-found");

    // (e) a transport error on the second question is `failed` (retry), not not-found.
    const secondDown = deps({
      geocode: async (req) => {
        if (req.relaxed) throw new Error("timeout");
        return null;
      },
    });
    expect(
      (await resolveEventGeo(secondDown.built, event({ editionLocation: "Nowhere" }))).geoStatus,
    ).toBe("failed");

    // (f) NO COUNTRY. A person's edition text may be relaxed; a model's name
    // with no country beside it may not.
    const seen: { relaxed?: boolean }[] = [];
    const record = (relaxedHit: boolean) =>
      deps({
        askModel: async () => '{"city":"Kimberley","region":"BC"}',
        geocode: async (req) => {
          seen.push({ relaxed: req.relaxed });
          return req.relaxed && relaxedHit
            ? { lat: 49.67, lng: -116.0, displayName: "Kimberley", countryAlpha2: "CA" }
            : null;
        },
      });

    const aiNoCountry = await resolveEventGeo(record(true).built, event({ country: null }));
    expect(aiNoCountry.geoStatus).toBe("not-found");
    expect(seen).toEqual([{ relaxed: undefined }]);

    seen.length = 0;
    const editionNoCountry = await resolveEventGeo(
      record(true).built,
      event({ country: null, editionLocation: "Kimberley, BC" }),
    );
    expect(editionNoCountry).toMatchObject({ geoStatus: "ok", geoPlace: "Kimberley (relaxed)", country: "CAN" });
    expect(seen).toEqual([{ relaxed: undefined }, { relaxed: true }]);

    // …but a model name that DID bring its own country is pinned by it.
    seen.length = 0;
    const aiWithCountry = deps({
      askModel: async () => '{"city":"Kimberley","region":"BC","country_alpha2":"CA"}',
      geocode: async (req) => {
        seen.push({ relaxed: req.relaxed });
        return req.relaxed
          ? { lat: 49.67, lng: -116.0, displayName: "Kimberley", countryAlpha2: "CA" }
          : null;
      },
    });
    const pinned = await resolveEventGeo(aiWithCountry.built, event({ country: null }));
    expect(pinned).toMatchObject({ geoStatus: "ok", geoSource: "ai", geoPlace: "Kimberley (relaxed)" });
    expect(seen).toEqual([{ relaxed: undefined }, { relaxed: true }]);
  });
});
