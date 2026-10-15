import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { offeredDistances } from "@/lib/races/catalogue-shape";
import { lineUpSummary } from "@/lib/races/line-up";
import { SEED_CATEGORIES, SEED_EVENTS } from "@/lib/races/seed-data";
import { aliasProposals, withAlias } from "@/lib/ultrasignup/aliases";
import { assemblePeople, assemblePerson, recordUpdate } from "@/lib/ultrasignup/assemble";
import { CACHE_SECONDS, cachedFetch, fetchPeople, USER_AGENT } from "@/lib/ultrasignup/fetch";
import { historyUrl, MAX_NAME_WORDS, nameSplits } from "@/lib/ultrasignup/name";
import { normalizeRaceName } from "@/lib/ultrasignup/normalize";
import {
  historicalKey,
  matchRow,
  parseDistanceKm,
  raceFromRow,
  type MatchEvent,
} from "@/lib/ultrasignup/match";
import { mergePeople, parseHistory } from "@/lib/ultrasignup/parse";
import {
  existingRecord,
  groupOf,
  picksFromRecords,
  rowState,
  rowTone,
  type LoggedRecord,
} from "@/lib/ultrasignup/row-state";

/**
 * U-ULTRA — what a member's UltraSignup name turns into, before any page.
 *
 * The two reference pages are one name with the surname boundary moved:
 * `fname=Xu Dong&lname=Wu` (id 2304249) and `fname=Xu&lname=Dong Wu`
 * (id 2678040). A parser that keeps only "the last word is the surname"
 * drops the second id and the races that exist only there.
 *
 * Inside the first id, TDS and "Sur les Traces des Ducs de Savoie" are one
 * finish written twice (39:24:51, place 852, four days apart). Squamish on
 * 2022-08-21 is three finishes with three times, and collapsing those would
 * throw away races the member actually ran.
 *
 * Each test names one of those failures. `now` is a parameter of the
 * assembler, so nothing here reads the clock.
 */

const NOW = new Date("2026-10-13T12:00:00Z");

const CATALOGUE: MatchEvent[] = [
  {
    aliases: ["Ultra Trail Du Mont Blanc by UTMB"],
    distances: [
      { distanceKm: 145, id: "tds", label: "TDS" },
      { distanceKm: 176, id: "utmb", label: "UTMB" },
    ],
    id: "utmb-mont-blanc",
    name: "UTMB Mont-Blanc",
  },
  {
    aliases: [],
    distances: [{ distanceKm: 330, id: "330k", label: "330K" }],
    id: "other-tor-des-geants",
    name: "Tor des Geants",
  },
  {
    aliases: [],
    distances: [
      { distanceKm: 50, id: "50k", label: "50K" },
      { distanceKm: 52, id: "55k", label: "55K" },
      { distanceKm: 80.5, id: "50m", label: "50 Miler" },
    ],
    id: "other-squamish",
    name: "Squamish 50",
  },
];

function row(
  eventname: string,
  eventdate: string,
  formattime: string,
  place: number,
  status: number,
) {
  return { eventdate, eventname, formattime, place, status };
}

const XU_DONG_WU = [
  {
    Age: 55,
    FirstName: "Xu Dong",
    Id: 2304249,
    LastName: "Wu",
    Results: [
      row("Tor des Geants - 330K", "9/15/2025 12:00:00 AM", "127:58:03", 362, 1),
      row(
        "Ultra Trail Du Mont Blanc by UTMB - TDS",
        "8/29/2025 12:00:00 AM",
        "39:24:51",
        852,
        1,
      ),
      row(
        "Sur les Traces des Ducs de Savoie - 145K",
        "8/25/2025 12:00:00 AM",
        "39:24:51",
        852,
        1,
      ),
      row("Squamish 50 - 50K", "8/21/2022 12:00:00 AM", "9:25:03", 191, 1),
      row("Squamish 50 - 50 Miler", "8/21/2022 12:00:00 AM", "12:54:38", 131, 1),
      row("Squamish 50 - 50/50", "8/21/2022 12:00:00 AM", "22:19:41", 42, 1),
      row("Sinister 7 - 100 Miler", "7/12/2025 12:00:00 AM", "0", 0, 2),
    ],
  },
];

const XU_DONGWU = [
  {
    Age: 0,
    FirstName: "Xu",
    Id: 2678040,
    LastName: "Dong Wu",
    Results: [
      row("Canadian Death Race - 118K", "8/1/2026 12:00:00 AM", "22:38:28", 79, 1),
    ],
  },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

test.describe("U-ULTRA UltraSignup import", () => {
  test("U-ULTRA-1: one name requests both surname splits and keeps both people", async () => {
    const urls: string[] = [];
    const { people } = await fetchPeople("Xu Dong Wu", async (url) => {
      urls.push(String(url));
      const body = String(url).includes("Xu%20Dong/Wu") ? XU_DONG_WU : XU_DONGWU;
      return jsonResponse(body);
    });

    expect(nameSplits("Xu Dong Wu")).toEqual([
      { fname: "Xu Dong", lname: "Wu" },
      { fname: "Xu", lname: "Dong Wu" },
    ]);
    expect(urls).toEqual([
      "https://ultrasignup.com/service/events.svc/historybyname/Xu%20Dong/Wu/",
      "https://ultrasignup.com/service/events.svc/historybyname/Xu/Dong%20Wu/",
    ]);
    expect(historyUrl({ fname: "Xu Dong", lname: "Wu" })).toBe(urls[0]);
    expect(people.map((person) => person.id)).toEqual([2304249, 2678040]);
  });

  test("U-ULTRA-2: one word, or a slash, is not a name we will put in a URL", () => {
    expect(nameSplits("Wu")).toBeNull();
    expect(nameSplits("Xu/Dong Wu")).toBeNull();
    expect(nameSplits("  Xu   Dong   Wu  ")).toEqual([
      { fname: "Xu Dong", lname: "Wu" },
      { fname: "Xu", lname: "Dong Wu" },
    ]);
  });

  test("U-ULTRA-3: age 0 is not an age, and a non-array body is nobody", () => {
    const [second] = parseHistory(XU_DONGWU, { fname: "Xu", lname: "Dong Wu" });
    expect(second.age).toBeNull();
    expect(parseHistory({ people: XU_DONG_WU }, { fname: "Xu Dong", lname: "Wu" })).toEqual(
      [],
    );
  });

  test("U-ULTRA-4: the result date stays the calendar day UltraSignup printed", () => {
    const [person] = parseHistory(XU_DONG_WU, { fname: "Xu Dong", lname: "Wu" });
    expect(person.results[0]).toMatchObject({
      date: "2025-09-15",
      year: 2025,
      distanceText: "330K",
      eventName: "Tor des Geants",
    });
  });

  test("U-ULTRA-5: a DNF keeps no finishing time", () => {
    const [person] = parseHistory(XU_DONG_WU, { fname: "Xu Dong", lname: "Wu" });
    const dnf = person.results.find((result) => result.rawName.startsWith("Sinister"));
    expect(dnf).toMatchObject({ status: "dnf", finishSeconds: null, timeText: null });
  });

  test("U-ULTRA-6: one shared finish is a group; three times on one day are not", () => {
    const [person] = parseHistory(XU_DONG_WU, { fname: "Xu Dong", lname: "Wu" });
    const view = assemblePerson(person, CATALOGUE, NOW);
    const repeated = view.rows.filter((result) => result.place === 852);
    expect(repeated).toHaveLength(2);
    expect(repeated[0].groupId).toBeTruthy();
    expect(repeated[0].groupId).toBe(repeated[1].groupId);

    const squamish = view.rows.filter((result) => result.year === 2022);
    expect(squamish).toHaveLength(3);
    expect(squamish.every((result) => result.groupId === null)).toBe(true);
  });

  test("U-ULTRA-7: the catalogue name does not match a different UltraSignup title; an alias does", () => {
    expect(normalizeRaceName("Ultra-Trail® du Mont Blanc by UTMB")).toBe(
      "ultra trail du mont blanc",
    );
    expect(normalizeRaceName("Western States Endurance Run")).not.toBe(
      normalizeRaceName("Western States 100"),
    );

    const [person] = parseHistory(XU_DONG_WU, { fname: "Xu Dong", lname: "Wu" });
    const withoutAlias = CATALOGUE.map((event) =>
      event.id === "utmb-mont-blanc" ? { ...event, aliases: [] } : event,
    );
    const unmatched = assemblePerson(person, withoutAlias, NOW);
    const tds = unmatched.rows.find((result) => result.distanceText === "TDS");
    expect(tds?.match.kind).toBe("unsupported");

    const matched = assemblePerson(person, CATALOGUE, NOW);
    expect(matched.rows.find((result) => result.distanceText === "TDS")?.match).toMatchObject({
      distanceId: "tds",
      eventId: "utmb-mont-blanc",
      kind: "ready",
    });
  });

  test("U-ULTRA-8: two catalogue events with the same normalized name match neither", () => {
    const [person] = parseHistory(
      [
        {
          Age: 40,
          FirstName: "A",
          Id: 1,
          LastName: "B",
          Results: [row("Twin Race - 50K", "1/1/2024 12:00:00 AM", "6:00:00", 1, 1)],
        },
      ],
      { fname: "A", lname: "B" },
    );
    const twins: MatchEvent[] = [
      {
        aliases: [],
        distances: [{ distanceKm: 50, id: "50k", label: "50K" }],
        id: "one",
        name: "Twin Race",
      },
      {
        aliases: ["Twin Race"],
        distances: [{ distanceKm: 50, id: "50k", label: "50K" }],
        id: "two",
        name: "Twin Race",
      },
    ];
    expect(assemblePerson(person, twins, NOW).rows[0].match.kind).toBe("unsupported");
  });

  test("U-ULTRA-9: a finish the member already logged is marked on that row, from the live list", () => {
    const [person] = parseHistory(XU_DONG_WU, { fname: "Xu Dong", lname: "Wu" });
    const view = assemblePerson(person, CATALOGUE, NOW);
    const tor = view.rows.find((result) => result.eventName === "Tor des Geants")!;
    const logged: LoggedRecord = {
      distanceId: "330k",
      eventId: "other-tor-des-geants",
      finishSeconds: 460683,
      id: 1,
      result: "finished",
      year: 2025,
    };
    expect(existingRecord(tor, {}, [logged])).toMatchObject({ id: 1, result: "finished" });
    // Deleted from the list below: the same row is importable again, with
    // no reload of UltraSignup.
    expect(existingRecord(tor, {}, [])).toBeNull();
    expect(rowState([tor], tor, {}, [], {}).canImport).toBe(true);
  });

  test("U-ULTRA-10: a year outside the claimable range is not importable", () => {
    const [person] = parseHistory(
      [
        {
          Age: 40,
          FirstName: "A",
          Id: 1,
          LastName: "B",
          Results: [row("Tor des Geants - 330K", "6/1/2009 12:00:00 AM", "100:00:00", 1, 1)],
        },
      ],
      { fname: "A", lname: "B" },
    );
    expect(assemblePerson(person, CATALOGUE, NOW).rows[0].match.kind).toBe("unsupported");
  });

  test("U-ULTRA-11: an identical row is kept once", () => {
    const duplicate = row("Tor des Geants - 330K", "9/15/2025 12:00:00 AM", "127:58:03", 362, 1);
    const [person] = parseHistory(
      [
        {
          Age: 40,
          FirstName: "A",
          Id: 1,
          LastName: "B",
          Results: [duplicate, duplicate],
        },
      ],
      { fname: "A", lname: "B" },
    );
    expect(assemblePerson(person, CATALOGUE, NOW).rows).toHaveLength(1);
  });

  test("U-ULTRA-12: two titles that resolve to the same record are one group", () => {
    const [person] = parseHistory(
      [
        {
          Age: 40,
          FirstName: "A",
          Id: 1,
          LastName: "B",
          Results: [
            row("Fat Dog 120 - 120 Miler", "8/9/2024 12:00:00 AM", "45:44:50", 65, 1),
            row("Fat Dog 120 Mile - 120 Miler", "8/9/2024 12:00:00 AM", "40:00:00", 10, 1),
          ],
        },
      ],
      { fname: "A", lname: "B" },
    );
    const events: MatchEvent[] = [
      {
        aliases: ["Fat Dog 120 Mile"],
        distances: [{ distanceKm: 193, id: "120m", label: "120 Miler" }],
        id: "other-fat-dog",
        name: "Fat Dog 120",
      },
    ];
    const matched = assemblePerson(person, events, NOW).rows;
    expect(matched).toHaveLength(2);
    expect(matched[0].groupId).toBeTruthy();
    expect(matched[0].groupId).toBe(matched[1].groupId);
    expect(matched.every((result) => result.match.kind === "ready")).toBe(true);
  });

  test("U-ULTRA-13: miles convert, and 50/50 is not a distance", () => {
    expect(parseDistanceKm("100 Miler")).toBeCloseTo(160.9344, 3);
    expect(parseDistanceKm("50K")).toBe(50);
    expect(parseDistanceKm("50/50")).toBeNull();

    const [person] = parseHistory(XU_DONG_WU, { fname: "Xu Dong", lname: "Wu" });
    const view = assemblePerson(person, CATALOGUE, NOW);
    expect(view.rows.find((result) => result.distanceText === "50 Miler")?.match).toMatchObject({
      distanceId: "50m",
      kind: "ready",
    });
    expect(view.rows.find((result) => result.distanceText === "50/50")?.match.kind).toBe(
      "unsupported",
    );
  });

  test("U-ULTRA-14: two categories inside the distance band are a choice, not the nearest", () => {
    const [person] = parseHistory(
      [
        {
          Age: 40,
          FirstName: "A",
          Id: 1,
          LastName: "B",
          Results: [row("Squamish 50 - 51K", "8/21/2022 12:00:00 AM", "9:00:00", 1, 1)],
        },
      ],
      { fname: "A", lname: "B" },
    );
    const match = assemblePerson(person, CATALOGUE, NOW).rows[0].match;
    expect(match.kind).toBe("choose-distance");
    if (match.kind !== "choose-distance") return;
    expect(match.options.map((option) => option.id).sort()).toEqual(["50k", "55k"]);
  });

  test("U-ULTRA-15: the same person id from a later split does not replace the first", () => {
    const first = parseHistory(XU_DONG_WU, { fname: "Xu Dong", lname: "Wu" });
    const again = parseHistory(
      [{ ...XU_DONG_WU[0], FirstName: "Other", Results: [] }],
      { fname: "Xu", lname: "Dong Wu" },
    );
    const merged = mergePeople([first, again]);
    expect(merged).toHaveLength(1);
    expect(merged[0].firstName).toBe("Xu Dong");
  });

  test("U-ULTRA-17: one person and one catalogue match needs no choice", () => {
    const [person] = parseHistory(
      [
        {
          Age: 55,
          FirstName: "Xu Dong",
          Id: 2304249,
          LastName: "Wu",
          Results: [row("Tor des Geants - 330K", "9/15/2025 12:00:00 AM", "127:58:03", 362, 1)],
        },
      ],
      { fname: "Xu Dong", lname: "Wu" },
    );
    const view = assemblePerson(person, CATALOGUE, NOW);
    expect(view.rows).toHaveLength(1);
    expect(view.rows[0].groupId).toBeNull();
    expect(view.rows[0].match).toMatchObject({
      distanceId: "330k",
      eventId: "other-tor-des-geants",
      kind: "ready",
    });
    expect(view.rows[0].finishSeconds).toBe(127 * 3600 + 58 * 60 + 3);
  });

  test("U-ULTRA-16: one split failing still returns the people from the split that answered", async () => {
    const answered = (url: string | URL | Request) => String(url).includes("Xu%20Dong/Wu");

    const errored = await fetchPeople("Xu Dong Wu", async (url) =>
      answered(url) ? jsonResponse(XU_DONG_WU) : jsonResponse("no", 500),
    );
    expect(errored.people.map((person) => person.id)).toEqual([2304249]);
    expect(errored.failures).toEqual([
      { reason: "status", split: { fname: "Xu", lname: "Dong Wu" } },
    ]);

    // A timeout rejects the fetch rather than returning a status. That was
    // the path that took the answered split down with it.
    const timedOut = await fetchPeople("Xu Dong Wu", async (url) => {
      if (answered(url)) return jsonResponse(XU_DONG_WU);
      throw new DOMException("The operation timed out.", "TimeoutError");
    });
    expect(timedOut.people.map((person) => person.id)).toEqual([2304249]);
    expect(timedOut.failures.map((failure) => failure.reason)).toEqual(["unreachable"]);

    await expect(
      fetchPeople("Xu Dong Wu", async () => jsonResponse("no", 500)),
    ).rejects.toThrow();
  });

  test("U-ULTRA-18: an accent on one side only is the same race", () => {
    expect(normalizeRaceName("Tor des Géants")).toBe(normalizeRaceName("Tor des Geants"));
    expect(normalizeRaceName("Québec Mega Trail")).toBe("quebec mega trail");

    const [person] = parseHistory(
      [
        {
          Age: 40,
          FirstName: "A",
          Id: 1,
          LastName: "B",
          Results: [row("Quebec Mega Trail - 110K", "7/6/2024 12:00:00 AM", "0", 0, 2)],
        },
      ],
      { fname: "A", lname: "B" },
    );
    const events: MatchEvent[] = [
      {
        aliases: [],
        distances: [{ distanceKm: 110, id: "110k", label: "110K" }],
        id: "other-quebec-mega-trail",
        name: "Québec Mega Trail",
      },
    ];
    expect(assemblePerson(person, events, NOW).rows[0].match).toMatchObject({
      distanceId: "110k",
      eventId: "other-quebec-mega-trail",
      kind: "ready",
    });
  });

  test("U-ULTRA-19: a category with no kilometres is placed by its label", () => {
    expect(parseDistanceKm("50M")).toBeCloseTo(80.4672, 3);

    const [person] = parseHistory(
      [
        {
          Age: 40,
          FirstName: "A",
          Id: 1,
          LastName: "B",
          Results: [row("Squamish 50 - 50 Miler", "8/18/2024 12:00:00 AM", "12:00:00", 50, 1)],
        },
      ],
      { fname: "A", lname: "B" },
    );
    const events: MatchEvent[] = [
      {
        aliases: [],
        distances: [
          { distanceKm: null, id: "50m", label: "50M" },
          { distanceKm: null, id: "50k", label: "50K" },
          { distanceKm: null, id: "50-50", label: "50/50" },
        ],
        id: "other-squamish-50",
        name: "Squamish 50",
      },
    ];
    expect(assemblePerson(person, events, NOW).rows[0].match).toMatchObject({
      distanceId: "50m",
      kind: "ready",
    });
  });

  test("U-ULTRA-20: an unknown name is nobody; an unrecognised answer is a failure", async () => {
    const nobody = await fetchPeople("Xu Dong Wu", async () => jsonResponse([]));
    expect(nobody).toEqual({ failures: [], people: [] });

    // The day UltraSignup changes shape, every member must not be told they
    // have no results. An object, or rows with no person in them, is that day.
    await expect(
      fetchPeople("Xu Dong Wu", async () => jsonResponse({ d: XU_DONG_WU })),
    ).rejects.toThrow(/format/);
    await expect(
      fetchPeople("Xu Dong Wu", async () => jsonResponse([{ runner: 1 }])),
    ).rejects.toThrow(/format/);

    const partial = await fetchPeople("Xu Dong Wu", async (url) =>
      String(url).includes("Xu%20Dong/Wu") ? jsonResponse(XU_DONG_WU) : jsonResponse("<html>"),
    );
    expect(partial.people).toHaveLength(1);
    expect(partial.failures.map((failure) => failure.reason)).toEqual(["format"]);
  });

  test("U-ULTRA-21: a repeated finish that also shares a record stays one group", () => {
    const [person] = parseHistory(
      [
        {
          Age: 40,
          FirstName: "A",
          Id: 1,
          LastName: "B",
          Results: [
            row("Fat Dog 120 - 120 Miler", "8/9/2024 12:00:00 AM", "45:44:50", 65, 1),
            row("Fat Dog Somewhere - 190K", "8/11/2024 12:00:00 AM", "45:44:50", 65, 1),
            row("Fat Dog 120 Mile - 120 Miler", "8/9/2024 12:00:00 AM", "40:00:00", 10, 1),
          ],
        },
      ],
      { fname: "A", lname: "B" },
    );
    const events: MatchEvent[] = [
      {
        aliases: ["Fat Dog 120 Mile"],
        distances: [{ distanceKm: 193, id: "120m", label: "120 Miler" }],
        id: "other-fat-dog",
        name: "Fat Dog 120",
      },
    ];
    const groups = new Set(assemblePerson(person, events, NOW).rows.map((r) => r.groupId));
    expect(groups.size).toBe(1);
    expect(groups.has(null)).toBe(false);
  });

  test("U-ULTRA-22: the real page against the real catalogue imports what the catalogue has", () => {
    // Two `historybyname` answers as UltraSignup sent them for the reference
    // name, with the person's name, id and age replaced. The catalogue is
    // the seeded one, unaliased — so this is what a member sees on day one.
    const history = JSON.parse(
      readFileSync("e2e/fixtures/ultrasignup-history.json", "utf8"),
    ) as unknown[];
    const people = mergePeople([
      parseHistory(history, { fname: "Test", lname: "Runner" }),
    ]);
    const catalogue: MatchEvent[] = SEED_EVENTS.map((event) => ({
      aliases: [],
      distances: SEED_CATEGORIES.filter((category) => category.eventKey === event.key).map(
        (category) => ({
          distanceKm: category.distanceKm,
          id: category.key,
          label: category.label,
        }),
      ),
      id: event.key,
      name: event.name,
    }));
    const ready = assemblePeople(people, catalogue, NOW)
      .flatMap((person) => person.rows)
      .filter((result) => result.match.kind === "ready")
      .map((result) =>
        result.match.kind === "ready"
          ? `${result.date} ${result.match.eventId}/${result.match.distanceId}`
          : "",
      );

    expect(ready).toEqual(
      expect.arrayContaining([
        "2025-09-15 other-tor-des-geants/330k",
        "2024-08-18 other-squamish-50/50m",
        "2022-08-21 other-squamish-50/50m",
        "2017-08-19 other-squamish-50/50m",
        "2024-08-09 other-fat-dog/120m",
        "2022-08-21 other-squamish-50/50k",
        "2022-08-21 other-squamish-50/50-50",
        "2026-08-01 other-canadian-death-race/118k",
      ]),
    );
    // The name now matches "Québec Mega Trail", but the catalogue lists the
    // current QMT135/QMT80 line-up and no 110K. Matching the event is not a
    // licence to pick the nearest distance — it is a new one, which the
    // member may import with UltraSignup's label.
    expect(ready.filter((entry) => entry.includes("quebec"))).toEqual([]);
    const fresh = assemblePeople(people, catalogue, NOW)
      .flatMap((person) => person.rows)
      .flatMap((result) =>
        result.match.kind === "new-distance"
          ? [`${result.date} ${result.match.eventId} ${result.match.distanceLabel}`]
          : [],
      );
    expect(fresh).toContain("2024-07-06 wtm-quebec-mega-trail 110K");
    // Mt. FUJI's "Mt.FUJI 100" has no known length, so "100 Miler" may be it.
    expect(fresh.filter((entry) => entry.includes("mt-fuji"))).toEqual([]);
  });

  test("U-ULTRA-23: a distance the event does not list is new only when provably new", () => {
    const qmt: MatchEvent = {
      aliases: [],
      distances: [
        { distanceKm: 135, id: "qmt135", label: "QMT135" },
        { distanceKm: 80, id: "qmt80", label: "QMT80" },
      ],
      id: "wtm-quebec-mega-trail",
      name: "Québec Mega Trail",
    };
    expect(matchRow([qmt], "Quebec Mega Trail", "110K")).toEqual({
      distanceLabel: "110K",
      eventId: "wtm-quebec-mega-trail",
      eventName: "Québec Mega Trail",
      kind: "new-distance",
    });

    const unknownLength: MatchEvent = {
      ...qmt,
      distances: [...qmt.distances, { distanceKm: null, id: "fuji100", label: "Mt.FUJI 100" }],
    };
    expect(matchRow([unknownLength], "Quebec Mega Trail", "110K")).toEqual({
      kind: "unsupported",
      reason: "unverifiable",
    });
    expect(matchRow([qmt], "Quebec Mega Trail", "Relay")).toEqual({
      kind: "unsupported",
      reason: "distance",
    });
    expect(matchRow([qmt], "Some Other Race", "110K")).toEqual({
      kind: "unsupported",
      reason: "event",
    });
    // In range of an entry is that entry, never a new one beside it.
    expect(matchRow([qmt], "Quebec Mega Trail", "82K")).toMatchObject({
      distanceId: "qmt80",
      kind: "ready",
    });
  });

  test("U-ULTRA-24: a record that disagrees with UltraSignup is updated to say what it says", () => {
    const finished = { finishSeconds: 36_000, status: "finished" as const };
    const dnf = { finishSeconds: null, status: "dnf" as const };

    expect(recordUpdate(finished, { finishSeconds: null, result: "finished" })).toEqual({
      finishSeconds: 36_000,
      result: "finished",
    });
    expect(recordUpdate(finished, { finishSeconds: 36_000, result: "finished" })).toBeNull();
    expect(recordUpdate(finished, { finishSeconds: 40_000, result: "finished" })).toEqual({
      finishSeconds: 36_000,
      result: "finished",
    });
    expect(recordUpdate(finished, { finishSeconds: null, result: "dnf" })).toEqual({
      finishSeconds: 36_000,
      result: "finished",
    });
    expect(recordUpdate(dnf, { finishSeconds: 36_000, result: "finished" })).toEqual({
      finishSeconds: null,
      result: "dnf",
    });
    expect(recordUpdate(dnf, { finishSeconds: null, result: "dnf" })).toBeNull();
    // A finish UltraSignup printed without a readable time does not erase one.
    expect(
      recordUpdate({ finishSeconds: null, status: "finished" }, { finishSeconds: 36_000, result: "finished" }),
    ).toBeNull();
    expect(recordUpdate({ finishSeconds: null, status: "other" }, { finishSeconds: 1, result: "dnf" })).toBeNull();
  });

  test("U-ULTRA-25: a historical entry gets a stable key, and stays off line-ups and pickers", () => {
    expect(historicalKey("110K")).toBe("110k");
    expect(historicalKey("100 Miler")).toBe("100-miler");

    expect(
      lineUpSummary([
        { historical: false, label: "QMT135" },
        { historical: true, label: "110K" },
        { historical: null, label: "QMT80" },
      ]),
    ).toBe("QMT135 / QMT80");
    expect(lineUpSummary([{ historical: true, label: "110K" }])).toBeUndefined();

    const event = {
      distances: [
        { id: "qmt135", label: "QMT135" },
        { historical: true as const, id: "110k", label: "110K" },
      ],
      id: "wtm-quebec-mega-trail",
      name: "Québec Mega Trail",
      series: "wtm" as const,
    };
    expect(offeredDistances(event).map((distance) => distance.id)).toEqual(["qmt135"]);
    expect(offeredDistances(event, "110k").map((distance) => distance.id)).toEqual([
      "qmt135",
      "110k",
    ]);
  });

  test("U-ULTRA-26: a trademark sign is dropped, not spelled out as TM", () => {
    // NFKD rewrites ™ as the letters "TM"; stripping after it never matched.
    expect(normalizeRaceName("Western States™")).toBe("western states");
    expect(normalizeRaceName("Western States™ 100")).toBe(
      normalizeRaceName("Western States 100"),
    );
    const wser: MatchEvent = {
      aliases: [],
      distances: [{ distanceKm: 161, id: "100m", label: "100M" }],
      id: "wser",
      name: "Western States 100",
    };
    expect(matchRow([wser], "Western States™ 100", "100 Miler")).toMatchObject({
      distanceId: "100m",
      kind: "ready",
    });
  });

  test("U-ULTRA-27: a label inside longer text is that label only when the rest is its distance", () => {
    const city: MatchEvent = {
      aliases: [],
      distances: [{ distanceKm: 42.195, id: "marathon", label: "Marathon" }],
      id: "city",
      name: "City Trail Festival",
    };
    // "Half" is not a distance: the token `marathon` alone is not the Marathon.
    expect(matchRow([city], "City Trail Festival", "Half Marathon")).toEqual({
      kind: "unsupported",
      reason: "distance",
    });

    const utmb = CATALOGUE[0];
    // The rest is a distance in range of TDS: that is TDS.
    expect(matchRow([utmb], "UTMB Mont-Blanc", "TDS 145K")).toMatchObject({
      distanceId: "tds",
      kind: "ready",
    });
    // The rest contradicts TDS's length: not TDS, and a label that argues
    // with itself is not evidence of a new distance either. Refused, rather
    // than a public historical entry named "TDS 50K".
    expect(matchRow([utmb], "UTMB Mont-Blanc", "TDS 50K")).toEqual({
      kind: "unsupported",
      reason: "distance",
    });

    // An exact label still beats a label-plus-distance on another entry.
    const both: MatchEvent = {
      aliases: [],
      distances: [
        { distanceKm: 21.1, id: "half", label: "Half Marathon" },
        { distanceKm: 42.195, id: "marathon", label: "Marathon" },
      ],
      id: "city",
      name: "City Trail Festival",
    };
    expect(matchRow([both], "City Trail Festival", "Half Marathon")).toMatchObject({
      distanceId: "half",
      kind: "ready",
    });
  });

  test("U-ULTRA-28: two repeated finishes with the same time and place are two groups", () => {
    const [person] = parseHistory(
      [
        {
          Age: 40,
          FirstName: "Test",
          Id: 1,
          LastName: "Runner",
          Results: [
            row("Race A - 50K", "3/1/2024 12:00:00 AM", "5:00:00", 10, 1),
            row("Race A Again - 50K", "3/5/2024 12:00:00 AM", "5:00:00", 10, 1),
            row("Race B - 50K", "9/1/2024 12:00:00 AM", "5:00:00", 10, 1),
            row("Race B Again - 50K", "9/4/2024 12:00:00 AM", "5:00:00", 10, 1),
          ],
        },
      ],
      { fname: "Test", lname: "Runner" },
    );
    const view = assemblePerson(person, [], NOW);
    const id = (title: string) => view.rows.find((r) => r.rawName === title)?.groupId;
    expect(id("Race A - 50K")).toBeTruthy();
    expect(id("Race A - 50K")).toBe(id("Race A Again - 50K"));
    expect(id("Race B - 50K")).toBe(id("Race B Again - 50K"));
    // Six months apart: same time, place and year, and still two finishes.
    expect(id("Race A - 50K")).not.toBe(id("Race B - 50K"));
  });

  test("U-ULTRA-29: a name is at most five words, so one load is at most four requests", () => {
    expect(nameSplits("A B C D E")).toHaveLength(MAX_NAME_WORDS - 1);
    expect(nameSplits("A B C D E F")).toBeNull();
    expect(nameSplits(`${"A".repeat(60)} ${"B".repeat(30)}`)).toBeNull();
  });

  test("U-ULTRA-30: an answer is reused for a while; a failed one is not", async () => {
    const store = new Map<string, Response>();
    const cache = {
      match: async (key: RequestInfo | URL) =>
        store.get(key instanceof Request ? key.url : String(key))?.clone(),
      put: async (key: RequestInfo | URL, value: Response) => {
        store.set(key instanceof Request ? key.url : String(key), value);
      },
    } as unknown as Pick<Cache, "match" | "put">;
    const seen: { ua: string | null; url: string }[] = [];
    let status = 503;
    const network: typeof fetch = async (input, init) => {
      seen.push({ ua: new Headers(init?.headers).get("user-agent"), url: String(input) });
      return new Response("[]", { headers: { "set-cookie": "x=1" }, status });
    };
    const cached = cachedFetch(cache, network);

    // A 503 reaches the member as a failure and is asked again next time.
    await expect(fetchPeople("A B", cached)).rejects.toThrow("status");
    status = 200;
    await fetchPeople("A B", cached);
    await fetchPeople("A B", cached);
    expect(seen).toHaveLength(2);
    expect(seen.every((sent) => sent.ua === USER_AGENT)).toBe(true);

    const stored = store.get(historyUrl({ fname: "A", lname: "B" }))!;
    expect(stored.headers.get("cache-control")).toBe(`max-age=${CACHE_SECONDS}`);
    expect(stored.headers.get("set-cookie")).toBeNull();

    // A cache that throws costs the optimisation, not the answer.
    const broken = {
      match: async () => {
        throw new Error("cache down");
      },
      put: async () => {
        throw new Error("cache down");
      },
    } as unknown as Pick<Cache, "match" | "put">;
    await expect(fetchPeople("A B", cachedFetch(broken, network))).resolves.toMatchObject({
      people: [],
    });
  });

  test("U-ULTRA-31: two titles for one logged record stay one group, and lock again after a delete and re-import", () => {
    const [person] = parseHistory(
      [
        {
          Age: 40,
          FirstName: "A",
          Id: 1,
          LastName: "B",
          Results: [
            row("Fat Dog 120 - 120 Miler", "8/9/2024 12:00:00 AM", "45:44:50", 65, 1),
            row("Fat Dog 120 Mile - 120 Miler", "8/9/2024 12:00:00 AM", "40:00:00", 10, 1),
          ],
        },
      ],
      { fname: "A", lname: "B" },
    );
    const events: MatchEvent[] = [
      {
        aliases: ["Fat Dog 120 Mile"],
        distances: [{ distanceKm: 193, id: "120m", label: "120 Miler" }],
        id: "other-fat-dog",
        name: "Fat Dog 120",
      },
    ];
    const rows = assemblePerson(person, events, NOW).rows;
    const [first, second] = rows;
    // Grouped regardless of what the member has logged: the server no
    // longer knows, and the group is what makes the page ask once.
    expect(first.groupId).toBeTruthy();
    expect(first.groupId).toBe(second.groupId);
    const group = groupOf(rows, first);

    // Nothing logged: two importable rows, so the member picks one.
    expect(rowState(group, first, {}, [], {})).toMatchObject({
      canImport: false,
      radio: { checked: false },
    });
    expect(rowState(group, first, {}, [], { [first.groupId!]: first.key })).toMatchObject({
      canImport: true,
      radio: { checked: true },
    });

    // Logged: every row of the group is that record, and none imports.
    const logged: LoggedRecord = {
      distanceId: "120m",
      eventId: "other-fat-dog",
      finishSeconds: 164690,
      id: 7,
      result: "finished",
      year: 2024,
    };
    for (const candidate of group) {
      expect(rowState(group, candidate, {}, [logged], {}).canImport).toBe(false);
    }
  });

  test("U-ULTRA-32: one finish listed under two races locks the other once either is logged", () => {
    const [person] = parseHistory(
      [
        {
          Age: 40,
          FirstName: "A",
          Id: 1,
          LastName: "B",
          Results: [
            row("Race A - 50K", "3/1/2024 12:00:00 AM", "5:00:00", 10, 1),
            row("Race B - 50K", "3/5/2024 12:00:00 AM", "5:00:00", 10, 1),
          ],
        },
      ],
      { fname: "A", lname: "B" },
    );
    const events: MatchEvent[] = ["A", "B"].map((letter) => ({
      aliases: [],
      distances: [{ distanceKm: 50, id: "50k", label: "50K" }],
      id: `race-${letter.toLowerCase()}`,
      name: `Race ${letter}`,
    }));
    const rows = assemblePerson(person, events, NOW).rows;
    const a = rows.find((r) => r.rawName === "Race A - 50K")!;
    const b = rows.find((r) => r.rawName === "Race B - 50K")!;
    const group = groupOf(rows, a);
    expect(group).toHaveLength(2);

    const loggedA: LoggedRecord = {
      distanceId: "50k",
      eventId: "race-a",
      finishSeconds: 18000,
      id: 3,
      result: "finished",
      year: 2024,
    };
    // B is a different (event, distance) — the server would accept it, and
    // the member would have the one finish twice.
    expect(rowState(group, b, {}, [loggedA], {})).toMatchObject({
      canImport: false,
      note: "同一場已匯入，這筆不再匯入",
    });
  });

  test("U-ULTRA-33: a row the catalogue cannot place is red until the member places it, then imports like any other", () => {
    const [person] = parseHistory(
      [
        {
          Age: 40,
          FirstName: "A",
          Id: 1,
          LastName: "B",
          Results: [row("Ultra Trail Du Mont Blanc by UTMB - TDS", "8/29/2025 12:00:00 AM", "39:24:51", 852, 1)],
        },
      ],
      { fname: "A", lname: "B" },
    );
    // No alias: the title names no catalogue event.
    const events = CATALOGUE.map((event) => ({ ...event, aliases: [] }));
    const [tds] = assemblePerson(person, events, NOW).rows;
    expect(tds.match).toEqual({ kind: "unsupported", reason: "event" });

    const unplaced = rowState([tds], tds, {}, [], {});
    expect(unplaced.canImport).toBe(false);
    expect(rowTone(tds, unplaced, undefined)).toBe("missing");

    // Half a pick is not a place.
    const half = { [tds.key]: { eventId: "utmb-mont-blanc" } };
    expect(rowState([tds], tds, half, [], {}).canImport).toBe(false);

    const placed = { [tds.key]: { distanceId: "tds", eventId: "utmb-mont-blanc" } };
    const state = rowState([tds], tds, placed, [], {});
    expect(state.canImport).toBe(true);
    expect(rowTone(tds, state, placed[tds.key])).toBeNull();

    // Logged under the member's own pick: green, and nothing to import.
    const logged: LoggedRecord = {
      distanceId: "tds",
      eventId: "utmb-mont-blanc",
      finishSeconds: 141891,
      id: 9,
      result: "finished",
      year: 2025,
    };
    const done = rowState([tds], tds, placed, [logged], {});
    expect(done.canImport).toBe(false);
    expect(rowTone(tds, done, placed[tds.key])).toBe("logged");

    // A pick on a row the matcher did place is ignored, not obeyed.
    const [tor] = assemblePerson(
      parseHistory(XU_DONG_WU, { fname: "Xu Dong", lname: "Wu" })[0],
      CATALOGUE,
      NOW,
    ).rows.filter((r) => r.eventName === "Tor des Geants");
    expect(existingRecord(tor, { [tor.key]: placed[tds.key] }, [logged])).toBeNull();
  });

  test("U-ULTRA-34: a record that disagrees with UltraSignup is yellow; one that agrees is green", () => {
    const [person] = parseHistory(XU_DONG_WU, { fname: "Xu Dong", lname: "Wu" });
    const tor = assemblePerson(person, CATALOGUE, NOW).rows.find(
      (r) => r.eventName === "Tor des Geants",
    )!;
    const record = (finishSeconds: number | null): LoggedRecord => ({
      distanceId: "330k",
      eventId: "other-tor-des-geants",
      finishSeconds,
      id: 1,
      result: "finished",
      year: 2025,
    });
    const same = rowState([tor], tor, {}, [record(tor.finishSeconds)], {});
    expect(rowTone(tor, same, undefined)).toBe("logged");
    const other = rowState([tor], tor, {}, [record(1)], {});
    expect(rowTone(tor, other, undefined)).toBe("differs");
    // Not logged and placeable: no colour.
    expect(rowTone(tor, rowState([tor], tor, {}, [], {}), undefined)).toBeNull();
  });

  test("U-ULTRA-35: an unplaced row in a repeated finish asks for no choice until it is placed", () => {
    const [person] = parseHistory(
      [
        {
          Age: 40,
          FirstName: "A",
          Id: 1,
          LastName: "B",
          Results: [
            row("Race A - 50K", "3/1/2024 12:00:00 AM", "5:00:00", 10, 1),
            row("Unknown Race - 50K", "3/5/2024 12:00:00 AM", "5:00:00", 10, 1),
          ],
        },
      ],
      { fname: "A", lname: "B" },
    );
    const events: MatchEvent[] = [
      {
        aliases: [],
        distances: [{ distanceKm: 50, id: "50k", label: "50K" }],
        id: "race-a",
        name: "Race A",
      },
    ];
    const rows = assemblePerson(person, events, NOW).rows;
    const known = rows.find((r) => r.rawName === "Race A - 50K")!;
    const unknown = rows.find((r) => r.rawName === "Unknown Race - 50K")!;
    const group = groupOf(rows, known);
    expect(group).toHaveLength(2);

    // One importable row: it imports straight away, no radio.
    expect(rowState(group, known, {}, [], {})).toMatchObject({ canImport: true, radio: null });

    // Once the member places the other, there are two, and they pick one.
    const picks = { [unknown.key]: { distanceId: "50k", eventId: "race-a" } };
    expect(rowState(group, known, picks, [], {})).toMatchObject({
      canImport: false,
      radio: { checked: false },
    });

    // The known one imported: the unknown one is locked, and with nothing
    // left to do about it, it is not drawn red.
    const logged: LoggedRecord = {
      distanceId: "50k",
      eventId: "race-a",
      finishSeconds: 18000,
      id: 4,
      result: "finished",
      year: 2024,
    };
    const locked = rowState(group, unknown, {}, [logged], {});
    expect(locked.note).toBe("同一場已匯入，這筆不再匯入");
    expect(rowTone(unknown, locked, undefined)).toBeNull();
  });

  test("U-ULTRA-36: a row placed by hand on an earlier visit comes back placed, from the record it made", () => {
    const [person] = parseHistory(
      [
        {
          Age: 40,
          FirstName: "A",
          Id: 1,
          LastName: "B",
          Results: [
            row("Ultra Trail Du Mont Blanc by UTMB - TDS", "8/29/2025 12:00:00 AM", "39:24:51", 852, 1),
            row("Tor des Geants - 330K", "9/15/2025 12:00:00 AM", "127:58:03", 362, 1),
          ],
        },
      ],
      { fname: "A", lname: "B" },
    );
    const events = CATALOGUE.map((event) => ({ ...event, aliases: [] }));
    const rows = assemblePerson(person, events, NOW).rows;
    const tds = rows.find((r) => r.rawName.startsWith("Ultra Trail"))!;
    const tor = rows.find((r) => r.rawName.startsWith("Tor"))!;
    const imported: LoggedRecord = {
      distanceId: "tds",
      eventId: "utmb-mont-blanc",
      finishSeconds: 141891,
      id: 9,
      result: "finished",
      ultrasignupDate: "2025-08-29",
      ultrasignupTitle: "Ultra Trail Du Mont Blanc by UTMB - TDS",
      year: 2025,
    };

    const picks = picksFromRecords(rows, [imported]);
    expect(picks).toEqual({ [tds.key]: { distanceId: "tds", eventId: "utmb-mont-blanc" } });
    const state = rowState([tds], tds, picks, [imported], {});
    expect(rowTone(tds, state, picks[tds.key])).toBe("logged");

    // The same title on another day is another race; a record typed in by
    // hand carries no title at all. Neither places anything.
    expect(picksFromRecords(rows, [{ ...imported, ultrasignupDate: "2024-08-29" }])).toEqual({});
    expect(
      picksFromRecords(rows, [{ ...imported, ultrasignupDate: null, ultrasignupTitle: null }]),
    ).toEqual({});

    // A row the matcher places is the matcher's answer, whatever a record says.
    const stale: LoggedRecord = {
      ...imported,
      ultrasignupDate: "2025-09-15",
      ultrasignupTitle: "Tor des Geants - 330K",
    };
    expect(picksFromRecords([tor], [stale])).toEqual({});
  });

  // A hand placement is a member saying "this UltraSignup race is that
  // catalogue race". The failure: a name the matcher already answers is
  // proposed again (an admin adds a duplicate, or adds it to a second event
  // and breaks both), or two members' disagreement is settled by count.
  test("U-ULTRA-37: hand placements and approved requests become alias proposals, and only unknown names", () => {
    const events = CATALOGUE.map((event) => ({ ...event, aliases: [] }));
    const proposals = aliasProposals(events, [
      { eventKey: "utmb-mont-blanc", kind: "record", ultrasignupTitle: "Ultra Trail Du Mont Blanc by UTMB - TDS" },
      { eventKey: "utmb-mont-blanc", kind: "record", ultrasignupTitle: "ULTRA TRAIL DU MONT BLANC - UTMB" },
      { eventKey: "utmb-mont-blanc", eventName: "Ultra Trail du Mont Blanc", kind: "request" },
      // Already the catalogue's own name: matches today, nothing to add.
      { eventKey: "other-tor-des-geants", kind: "record", ultrasignupTitle: "Tor des Géants - 330K" },
      // An event the catalogue no longer has: nothing to attach it to.
      { eventKey: "gone", kind: "record", ultrasignupTitle: "Gone Race - 50K" },
    ]);
    expect(proposals).toEqual([
      {
        // "by UTMB" is dropped by the normaliser, so all three are one name;
        // the spelling shown is the one the most evidence used, first on a tie.
        alias: "Ultra Trail Du Mont Blanc by UTMB",
        conflict: false,
        eventKey: "utmb-mont-blanc",
        eventName: "UTMB Mont-Blanc",
        name: "ultra trail du mont blanc",
        records: 2,
        requests: 1,
      },
    ]);

    // Once it is an alias, the same evidence proposes nothing.
    const aliased = events.map((event) =>
      event.id === "utmb-mont-blanc" ? { ...event, aliases: ["Ultra Trail du Mont Blanc"] } : event,
    );
    expect(
      aliasProposals(aliased, [
        { eventKey: "utmb-mont-blanc", kind: "record", ultrasignupTitle: "Ultra Trail Du Mont Blanc by UTMB - TDS" },
      ]),
    ).toEqual([]);
  });

  test("U-ULTRA-38: one name claimed for two events is a conflict on both, not a majority", () => {
    const events = CATALOGUE.map((event) => ({ ...event, aliases: [] }));
    const proposals = aliasProposals(events, [
      { eventKey: "utmb-mont-blanc", kind: "record", ultrasignupTitle: "Mountain Race - 50K" },
      { eventKey: "utmb-mont-blanc", kind: "record", ultrasignupTitle: "Mountain Race - 50K" },
      { eventKey: "other-tor-des-geants", kind: "record", ultrasignupTitle: "Mountain Race - 50K" },
    ]);
    expect(proposals.map((p) => [p.eventKey, p.records, p.conflict])).toEqual([
      ["utmb-mont-blanc", 2, true],
      ["other-tor-des-geants", 1, true],
    ]);
  });

  test("U-ULTRA-39: an alias is appended once; a line that already normalises to it is a no-op", () => {
    expect(withAlias(null, " Western States Endurance Run ")).toBe("Western States Endurance Run");
    expect(withAlias("Hardrock 100\nWestern States", "Western States Endurance Run")).toBe(
      "Hardrock 100\nWestern States\nWestern States Endurance Run",
    );
    expect(withAlias("Western States™\n", "western  states")).toBeNull();
  });

  // The failure: an admin adds a race from one member's row and the next
  // member's identical title still reads "not in the catalogue", so the
  // race was added for nobody.
  test("U-ULTRA-40: a race added from an UltraSignup row matches the next member's same title", () => {
    const events = CATALOGUE.map((event) => ({ ...event, aliases: [] }));
    expect(matchRow(events, "Alpenglow 100", "100K")).toEqual({ kind: "unsupported", reason: "event" });

    const race = raceFromRow(" Alpenglow 100 ", "100K ");
    expect(race).toEqual({
      category: { distanceKm: 100, id: "100k", label: "100K" },
      event: { key: "alpenglow-100", name: "Alpenglow 100" },
    });
    const added = [
      ...events,
      { aliases: [], distances: [race!.category], id: race!.event.key, name: race!.event.name },
    ];
    expect(matchRow(added, "Alpenglow 100", "100K")).toMatchObject({
      distanceId: "100k",
      eventId: "alpenglow-100",
      kind: "ready",
    });
    // Another year's different distance is provably new, not a guess.
    expect(matchRow(added, "Alpenglow 100", "50K")).toMatchObject({ kind: "new-distance" });

    expect(raceFromRow("Alpenglow 100", "")).toBeNull();
    expect(raceFromRow("†", "100K")).toBeNull();
  });
});
