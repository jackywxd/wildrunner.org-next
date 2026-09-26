import { expect, test } from "@playwright/test";

import type { SiteRaceRecord } from "@/lib/content-types";
import { assignLanes } from "@/lib/riders/club-lanes";
import { buildClubTimeline, type ClubRunner } from "@/lib/riders/club-timeline";
import {
  MAX_MEETINGS,
  PAUSE,
  TRAIL,
  buildTrailMap,
  order,
  trailClock,
  yAt,
  yearFraction,
  type TrailMapData,
} from "@/lib/riders/trail-map";

/**
 * U-TRAIL — the homepage's 交會地圖: who is on it, where their trails run, and
 * the rule that makes the animation honest.
 *
 * THE RULE: every runner on the map is at the same date at the same moment,
 * so two trails touching is two people in one place — a meeting. Two trails
 * that touch anywhere else show a meeting that never happened, and nothing on
 * a rendered page would say so. `noFalseMeetings` below samples every pair of
 * trails across the whole map to check it.
 */

const xiao: ClubRunner = { name: "小雲", slug: "xiao" };
const mia: ClubRunner = { name: "Mia", slug: "mia" };
const kai: ClubRunner = { name: "阿凱", slug: "kai" };
const zhou: ClubRunner = { name: "老周", slug: "zhou" };

type Entry = [id: number, runner: ClubRunner, eventId: string, year: number, day: string, distanceId?: string];

function mapFrom(entries: Entry[], thisYear = 2025) {
  const rows = buildClubTimeline({
    posts: [],
    races: entries.map(([id, runner, eventId, year, , distanceId = "100k"]) => ({
      record: { distanceId, eventId, id, result: "finished", year } as SiteRaceRecord,
      runner,
    })),
    editionFacts: new Map(entries.map(([id, , , , day]) => [id, { startDate: day }])),
  });
  return buildTrailMap({ club: assignLanes(rows), rows, thisYear });
}

/**
 * Two trails may only come within half a unit of each other, or change which
 * is above the other, within a bend of a drawn meeting they were both at.
 */
function noFalseMeetings(map: TrailMapData) {
  for (const p of map.members) {
    for (const q of map.members) {
      if (p.slug >= q.slug) continue;
      const shared = map.meetings.filter(
        (m) => m.runners.includes(p.slug) && m.runners.includes(q.slug),
      );
      const atShared = (x: number) => shared.some((m) => Math.abs(m.x - x) <= TRAIL.approach);
      let side = 0;
      for (let x = TRAIL.x0; x <= TRAIL.x1; x += 0.5) {
        const gap = yAt(q.points, x) - yAt(p.points, x);
        if (Math.abs(gap) < 0.5) {
          expect(atShared(x), `${p.slug} and ${q.slug} touch at x=${x} with no meeting there`).toBe(true);
          continue;
        }
        const now = Math.sign(gap);
        if (side !== 0 && now !== side) {
          expect(atShared(x), `${p.slug} and ${q.slug} cross at x=${x} with no meeting there`).toBe(true);
        }
        side = now;
      }
    }
  }
}

test("U-TRAIL-T1: a day's place in its year comes from the string, never a Date", async () => {
  expect(yearFraction("2024-01-01")).toBe(0);
  expect(yearFraction("2024-12-31")).toBeCloseTo(371 / 372);
  // No day known: the middle of the year, rather than a claim about January.
  expect(yearFraction(undefined)).toBe(0.5);
});

test("U-TRAIL-T2: four meetings that need the order to change are all drawn, and nothing else touches", async () => {
  // Kodiak: 阿凱+小雲. Death Race: 小雲+Mia. Whistler: Mia+阿凱+老周.
  // Squamish: 阿凱+小雲 again. No single top-to-bottom order has every one of
  // these adjacent, so the map can only draw them all by reordering at meetings.
  const map = mapFrom([
    [1, kai, "kodiak", 2022, "2022-10-08"],
    [2, xiao, "kodiak", 2022, "2022-10-08", "50k"],
    [3, xiao, "death-race", 2023, "2023-08-03"],
    [4, mia, "death-race", 2023, "2023-08-03"],
    [5, mia, "whistler", 2024, "2024-06-14"],
    [6, kai, "whistler", 2024, "2024-06-14"],
    [7, zhou, "whistler", 2024, "2024-06-14"],
    [8, kai, "squamish", 2025, "2025-08-16"],
    [9, xiao, "squamish", 2025, "2025-08-16"],
    [10, zhou, "fat-dog", 2025, "2025-08-08"],
  ]);
  expect(map).not.toBeNull();
  if (!map) return;

  // fixture-scoped: four meetings in the rows, four on the map, in date order.
  expect(map.meetings.map((m) => m.eventId)).toEqual(["kodiak", "death-race", "whistler", "squamish"]);
  noFalseMeetings(map);

  // Kodiak is one meeting over two distances, so neither runner gets a
  // second dot beside it; 老周's Fat Dog is the only race that is not a meeting.
  expect(map.nodes).toHaveLength(1);
  expect(map.nodes[0].lane).toBe(map.members.find((m) => m.slug === "zhou")?.lane);
});

test("U-TRAIL-T3: a meeting no order can reach is left off, not drawn through somebody", async () => {
  const a: ClubRunner = { name: "A", slug: "a" };
  const b: ClubRunner = { name: "B", slug: "b" };
  const c: ClubRunner = { name: "C", slug: "c" };
  const d: ClubRunner = { name: "D", slug: "d" };

  // A meets B, then C, then D, then B again: by the fourth, A has had to
  // reach three different neighbours and B is on the far side of someone.
  expect(
    order(["a", "b", "c", "d"], [["a", "b"], ["a", "c"], ["a", "d"], ["a", "b"]].map((runners) => ({ runners })))
      .drawn,
  ).toBe(3);

  const map = mapFrom([
    [1, a, "e1", 2022, "2022-05-01"],
    [2, b, "e1", 2022, "2022-05-01"],
    [3, a, "e2", 2023, "2023-05-01"],
    [4, c, "e2", 2023, "2023-05-01"],
    [5, a, "e3", 2024, "2024-05-01"],
    [6, d, "e3", 2024, "2024-05-01"],
    [7, a, "e4", 2025, "2025-05-01"],
    [8, b, "e4", 2025, "2025-05-01"],
  ]);
  expect(map).not.toBeNull();
  if (!map) return;

  expect(map.meetings).toHaveLength(3);
  noFalseMeetings(map);
  // The one left off still happened: both runners get a dot there.
  expect(map.nodes).toHaveLength(2);
});

test("U-TRAIL-T4: the map shows the first lanes, the last few years and the newest meetings", async () => {
  const club = [kai, xiao, mia, zhou];
  const entries: Entry[] = [];
  let id = 1;
  // Eight meetings of 阿凱 and 小雲 in 2024–2025, and one in 2019.
  for (let month = 1; month <= 8; month += 1) {
    const year = month <= 4 ? 2024 : 2025;
    const day = `${year}-0${month}-10`;
    entries.push([id++, kai, `event-${month}`, year, day], [id++, xiao, `event-${month}`, year, day]);
  }
  entries.push([id++, kai, "old", 2019, "2019-05-01"], [id++, xiao, "old", 2019, "2019-05-01"]);
  // A fifth member, with the fewest meetings, gets no trail.
  const fifth: ClubRunner = { name: "Eve", slug: "eve" };
  // Each alone — one shared event would itself be a meeting.
  for (const runner of [fifth, ...club.slice(2)]) {
    entries.push([id++, runner, `solo-${runner.slug}`, 2025, "2025-03-01"]);
  }

  const map = mapFrom(entries);
  expect(map).not.toBeNull();
  if (!map) return;

  // 阿凱 and 小雲 tie on everything but the name; the other three have no
  // meetings and one race each, so their names order them too.
  expect(map.members.map((m) => m.slug)).toEqual(["xiao", "kai", "eve", "mia"]);
  expect(map.members.map((m) => m.lane)).toEqual([0, 1, 2, 3]);
  expect(map.years.map((y) => y.year)).toEqual([2022, 2023, 2024, 2025]);
  // The newest six; 2019 is outside the map and so are the two oldest of 2024.
  expect(map.meetings).toHaveLength(MAX_MEETINGS);
  expect(map.meetings[0].eventId).toBe("event-3");
  noFalseMeetings(map);
});

test("U-TRAIL-T5: one clock for every runner, stopping at each meeting", async () => {
  const meetings = [{ x: 200 }, { x: 500 }];
  const { arrive, end, xAt } = trailClock(meetings);

  expect(xAt(0)).toBe(TRAIL.x0);
  // Standing still for the whole pause, then moving on from the same place.
  expect(xAt(arrive[0])).toBeCloseTo(200);
  expect(xAt(arrive[0] + PAUSE / 2)).toBeCloseTo(200);
  expect(xAt(arrive[0] + PAUSE + 0.01)).toBeGreaterThan(200);
  expect(xAt(arrive[1] + PAUSE / 2)).toBeCloseTo(500);
  expect(xAt(end)).toBeCloseTo(TRAIL.x1);

  // Never backwards.
  let last = -Infinity;
  for (let t = 0; t <= end; t += 0.05) {
    const x = xAt(t);
    expect(x).toBeGreaterThanOrEqual(last);
    last = x;
  }
});
