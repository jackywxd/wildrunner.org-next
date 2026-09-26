import { expect, test } from "@playwright/test";

import type { SitePost, SiteRaceRecord } from "@/lib/content-types";
import { LANE_COLORS, rowMeetings } from "@/lib/riders/club-lanes";
import { buildClubTimeline, type ClubRunner } from "@/lib/riders/club-timeline";
import {
  compareCanonical,
  compareColors,
  compareHref,
  compareRows,
  meetingPairs,
  pairCounts,
  pairSide,
  parseCompare,
} from "@/lib/riders/compare";

/**
 * U-COMPARE — which rows a 成員對照 page draws, how it counts races run
 * together, and the addresses it is known by.
 *
 * The failure worth the most here is the quiet one: a stranger left among a
 * race's runners, so the zipper closes between a compared member and somebody
 * who is not on the page — a meeting the page says happened between people
 * it is not showing.
 */

const ann: ClubRunner = { name: "Ann", slug: "ann" };
const bo: ClubRunner = { name: "Bo", slug: "bo" };
const cy: ClubRunner = { name: "Cy", slug: "cy" };

function race(id: number, year: number, eventId: string, distanceId = "100k"): SiteRaceRecord {
  return { distanceId, eventId, id, result: "finished", year };
}

function post(id: number, date: string, raceId?: number): SitePost {
  return {
    id,
    title: `Post ${id}`,
    slug: `post-${id}`,
    slugAsParams: `post-${id}`,
    description: "",
    date,
    published: true,
    featured: false,
    race: raceId ? ({ id: raceId } as SitePost["race"]) : undefined,
  };
}

const rows = buildClubTimeline({
  posts: [
    { author: ann, post: post(1, "2024-07-01") },
    { author: cy, post: post(2, "2024-07-02") },
    { author: cy, post: post(3, "2024-06-20", 3) },
  ],
  races: [
    { record: race(1, 2025, "squamish"), runner: ann },
    { record: race(2, 2025, "squamish"), runner: bo },
    { record: race(3, 2024, "whistler", "100k"), runner: ann },
    { record: race(4, 2024, "whistler", "50k"), runner: cy },
    { record: race(5, 2023, "kodiak"), runner: bo },
    { record: race(6, 2023, "kodiak"), runner: cy },
  ],
  editionFacts: new Map([
    [1, { startDate: "2025-08-16" }],
    [2, { startDate: "2025-08-16" }],
    [3, { startDate: "2024-06-14" }],
    [4, { startDate: "2024-06-14" }],
    [5, { startDate: "2023-10-08" }],
    [6, { startDate: "2023-10-08" }],
  ]),
});

test("U-COMPARE-T1: a race keeps only the compared members, and nobody else's writing", async () => {
  const narrowed = compareRows(rows, ["ann", "bo"]);

  // Squamish (both), Ann's Whistler 100K, Bo's Kodiak, Ann's article. Cy's
  // Whistler 50K and Cy's article are gone; Cy is gone from Kodiak.
  const summary = narrowed.map((row) => [
    row.race?.eventId ?? "article",
    row.race?.runners.map((r) => r.slug) ?? row.posts.map((p) => p.author?.slug),
  ]);
  // fixture-scoped: the six records and three articles above, narrowed.
  expect(summary).toEqual([
    ["squamish", ["ann", "bo"]],
    ["article", ["ann"]],
    ["whistler", ["ann"]],
    ["kodiak", ["bo"]],
  ]);
  // Cy's report stays off Ann's race even though it is about that race.
  expect(narrowed.find((row) => row.race?.eventId === "whistler")?.posts).toEqual([]);
});

test("U-COMPARE-T2: races run together are counted per meeting, pair by pair", async () => {
  const three = ["ann", "bo", "cy"];
  const counts = pairCounts(compareRows(rows, three), three);
  expect(counts).toEqual([
    { count: 1, slugs: ["ann", "bo"] },
    // Whistler over two distances: one weekend, one count.
    { count: 1, slugs: ["ann", "cy"] },
    { count: 1, slugs: ["bo", "cy"] },
    { count: 0, slugs: ["ann", "bo", "cy"] },
  ]);

  // What the rail itself draws for Ann and Cy: Whistler only. Kodiak was Bo
  // and Cy — with Bo narrowed away it is Cy alone, and must not zip.
  const drawn = [...rowMeetings(compareRows(rows, ["ann", "cy"])).values()]
    .filter((meeting) => meeting.first)
    .map((meeting) => meeting.runners);
  expect(drawn).toEqual([["ann", "cy"]]);
});

test("U-COMPARE-T3: the address keeps the picked order; the canonical one sorts it", async () => {
  const known = new Set(["ann", "bo", "cy", "di"]);
  expect(parseCompare("cy,ann", known)).toEqual(["cy", "ann"]);
  // Unknown, repeated and surplus members are dropped, not an error.
  expect(parseCompare("cy,gone,cy,ann,bo,di", known)).toEqual(["cy", "ann", "bo"]);
  expect(parseCompare(["ann"], known)).toEqual([]);

  expect(compareHref(["cy", "ann"])).toBe("/riders/compare?with=cy,ann");
  expect(compareCanonical(["cy", "ann"])).toBe("/riders/compare?with=ann,cy");
  // One member is not a comparison; the page for it is the picker.
  expect(compareCanonical(["cy"])).toBe("/riders/compare");
});

test("U-COMPARE-T4: the sitemap lists each pair who met, once", async () => {
  expect(meetingPairs(rows)).toEqual([
    ["ann", "bo"],
    ["ann", "cy"],
    ["bo", "cy"],
  ]);
});

test("U-COMPARE-T5: a member keeps their club colour here, and nobody shares one", async () => {
  const club = { lanes: [ann, bo], others: true };
  const colors = compareColors(club, [cy, bo, ann]);
  expect(colors[1]).toBe(LANE_COLORS[1]);
  expect(colors[2]).toBe(LANE_COLORS[0]);
  // Cy has no lane on the club rail: the first colour not already in use.
  expect(colors[0]).toBe(LANE_COLORS[2]);
  expect(new Set(colors).size).toBe(3);
});

test("U-COMPARE-T6: with two members, each one's rows keep to their own side", async () => {
  expect(pairSide([0])).toBe("left");
  expect(pairSide([1])).toBe("right");
  expect(pairSide([1, 1])).toBe("right");
  // Together — across the middle, over the zip.
  expect(pairSide([0, 1])).toBe("centre");
  expect(pairSide([])).toBe("centre");
});
