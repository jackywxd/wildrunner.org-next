import { expect, test } from "@playwright/test";

import type { SiteRaceRecord } from "@/lib/content-types";
import {
  assignLanes,
  braidStrip,
  laneCount,
  laneOf,
  rowMeetings,
} from "@/lib/riders/club-lanes";
import { buildClubTimeline, type ClubRunner } from "@/lib/riders/club-timeline";

/**
 * U-BRAID — which members meet, who gets a lane, and where each lane is drawn
 * in the braided view of 野馬營穿越時光 (/riders/timeline?view=braid).
 *
 * THE FAILURES THESE PROTECT AGAINST, none visible from the fact that a page
 * rendered:
 *
 * - Two members at one edition over different distances drawn as strangers.
 *   The rows are split by distance for the badge's sake; the lanes must not
 *   inherit that split, or the view misses the meetings it exists to show.
 * - A bundle held across an unrelated card, claiming people were together at
 *   a race they did not run.
 * - Lane colours that depend on which page is loaded.
 *
 * PLAIN OBJECTS, built through `buildClubTimeline` so the rows are ordered by
 * the real comparator rather than by the order this file lists them in.
 */

const ann: ClubRunner = { name: "Ann", slug: "ann" };
const bo: ClubRunner = { name: "Bo", slug: "bo" };
const cy: ClubRunner = { name: "Cy", slug: "cy" };
const di: ClubRunner = { name: "Di", slug: "di" };

function race(id: number, year: number, eventId: string, distanceId = "100k"): SiteRaceRecord {
  return { distanceId, eventId, id, result: "finished", year };
}

const facts = (entries: [number, string][]) =>
  new Map(entries.map(([id, startDate]) => [id, { startDate }]));

const geometry = { first: 10, gap: 12, bundle: 5 };

test("U-BRAID-T1: two distances of one edition are one meeting across both rows", async () => {
  const rows = buildClubTimeline({
    posts: [],
    races: [
      { record: race(1, 2022, "kodiak", "100k"), runner: ann },
      { record: race(2, 2022, "kodiak", "50k"), runner: bo },
    ],
    editionFacts: facts([
      [1, "2022-10-08"],
      [2, "2022-10-08"],
    ]),
  });

  // fixture-scoped: the rows stay split by distance — the badge needs that —
  // and it is the meeting, not the row, that spans them.
  expect(rows).toHaveLength(2);
  const meetings = rowMeetings(rows);
  expect(meetings.get(rows[0].key)).toEqual({ runners: ["ann", "bo"], first: true, last: false });
  expect(meetings.get(rows[1].key)).toEqual({ runners: ["ann", "bo"], first: false, last: true });
});

test("U-BRAID-T2: one member alone, or one event in two years, is not a meeting", async () => {
  const rows = buildClubTimeline({
    posts: [],
    races: [
      { record: race(1, 2023, "whistler"), runner: ann },
      { record: race(2, 2024, "whistler"), runner: bo },
      { record: race(3, 2024, "squamish"), runner: cy },
    ],
    editionFacts: facts([
      [1, "2023-06-10"],
      [2, "2024-06-14"],
      [3, "2024-08-16"],
    ]),
  });

  expect(rowMeetings(rows).size).toBe(0);
});

test("U-BRAID-T3: rows of one event that another row sorts between are left apart", async () => {
  // Two distances whose editions resolved different days, with another race
  // between them. A bundle drawn across that race would say Ann and Bo were
  // at it together.
  const rows = buildClubTimeline({
    posts: [],
    races: [
      { record: race(1, 2024, "whistler", "100k"), runner: ann },
      { record: race(2, 2024, "fat-dog"), runner: cy },
      { record: race(3, 2024, "whistler", "50k"), runner: bo },
    ],
    editionFacts: facts([
      [1, "2024-09-28"],
      [2, "2024-08-08"],
      [3, "2024-06-14"],
    ]),
  });

  expect(rows.map((row) => row.race?.eventId)).toEqual(["whistler", "fat-dog", "whistler"]);
  expect(rowMeetings(rows).size).toBe(0);
});

test("U-BRAID-T4: lanes go to whoever meets most, and the grey lane takes the rest", async () => {
  const rows = buildClubTimeline({
    posts: [],
    races: [
      // Cy and Di meet twice, Ann and Bo once; Bo also ran twice alone.
      { record: race(1, 2025, "squamish"), runner: cy },
      { record: race(2, 2025, "squamish"), runner: di },
      { record: race(3, 2024, "whistler"), runner: cy },
      { record: race(4, 2024, "whistler"), runner: di },
      { record: race(5, 2023, "kodiak"), runner: ann },
      { record: race(6, 2023, "kodiak"), runner: bo },
      { record: race(7, 2022, "fat-dog"), runner: bo },
      { record: race(8, 2021, "fat-dog"), runner: bo },
    ],
    editionFacts: facts([
      [1, "2025-08-16"],
      [2, "2025-08-16"],
      [3, "2024-06-14"],
      [4, "2024-06-14"],
      [5, "2023-10-08"],
      [6, "2023-10-08"],
      [7, "2022-08-08"],
      [8, "2021-08-08"],
    ]),
  });

  const club = assignLanes(rows, 3);
  // Meetings first, then activity (Bo's two solo races put him above Ann),
  // then the name.
  expect(club.lanes.map((lane) => lane.slug)).toEqual(["cy", "di", "bo"]);
  expect(club.others).toBe(true);

  // A narrower screen folds the same order, never a different one.
  expect(laneOf(club.lanes, 2, "cy")).toBe(0);
  expect(laneOf(club.lanes, 2, "bo")).toBe(2);
  expect(laneOf(club.lanes, 2, "ann")).toBe(2);
  expect(laneCount(club, 2)).toBe(3);
  expect(laneCount({ lanes: club.lanes, others: false }, 3)).toBe(3);
});

test("U-BRAID-T5: a meeting pulls its lanes together and leaves the others where they are", async () => {
  const strip = braidStrip({
    count: 4,
    geometry,
    kind: "race",
    meeting: { first: true, last: true },
    participants: [0, 2],
  });

  // Lanes at rest: 10, 22, 34, 46. Lanes 0 and 2 meet around 22, 5px apart.
  expect(strip.top).toEqual([10, 22, 34, 46]);
  expect(strip.mid).toEqual([19.5, 22, 24.5, 46]);
  expect(strip.bottom).toEqual([10, 22, 34, 46]);
  expect(strip.capsule).toEqual({ lanes: 2, x: 22 });
  expect(strip.node).toBeUndefined();
});

test("U-BRAID-T6: a meeting over two rows is one bundle, with one interchange", async () => {
  const first = braidStrip({
    count: 3,
    geometry,
    meeting: { first: true, last: false },
    participants: [0, 1],
  });
  const second = braidStrip({
    count: 3,
    geometry,
    meeting: { first: false, last: true },
    participants: [0, 1],
  });

  // The first row leaves merged and the second arrives merged — no bend
  // between them, so the eye reads one bundle. Against `mid`, not only
  // against each other: two rows that both bent back to rest would also agree.
  expect(first.bottom).toEqual(first.mid);
  expect(second.top).toEqual(second.mid);
  expect(first.mid).toEqual([13.5, 18.5, 34]);
  expect(first.top).toEqual([10, 22, 34]);
  expect(second.bottom).toEqual([10, 22, 34]);
  expect(first.capsule).toBeDefined();
  expect(second.capsule).toBeUndefined();
});

test("U-BRAID-T7: one member's row is a node on their lane; a meeting inside the grey lane is still an interchange", async () => {
  const solo = braidStrip({ count: 3, geometry, kind: "post", participants: [1] });
  expect(solo.node).toEqual({ kind: "post", lane: 1, x: 22 });
  expect(solo.mid).toEqual([10, 22, 34]);

  const grey = braidStrip({
    count: 3,
    geometry,
    kind: "race",
    meeting: { first: true, last: true },
    participants: [2, 2],
  });
  expect(grey.node).toBeUndefined();
  expect(grey.capsule).toEqual({ lanes: 1, x: 34 });
  expect(grey.mid).toEqual([10, 22, 34]);
});
