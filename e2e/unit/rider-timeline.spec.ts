import { expect, test } from "@playwright/test";

import type { SitePost, SiteRaceRecord } from "@/lib/content-types";
import {
  buildRiderTimeline,
  formatMonthDay,
  summariseTimeline,
} from "@/lib/riders/timeline";

/**
 * U-TIMELINE — the ordering and the merge behind 時間機器
 * (/riders/<slug>/timeline).
 *
 * The page draws one rail through a member's races and articles. Everything
 * that can be wrong about it is decided by `buildRiderTimeline`, which is a
 * function of three arrays — so it is checked here rather than by scrolling a
 * browser past a profile and reading `data-*` back out of the DOM.
 *
 * WHAT EACH TEST PROTECTS AGAINST, since the rule is that a test names its
 * failure: a history in the wrong order, a race silently dropped because its
 * edition has no date, and one day of a member's life shown as two — a race
 * and its own write-up appearing as separate rows, which is the shape a
 * reader would read as "she ran it twice".
 *
 * NO CATALOGUE, NO DATABASE, NO PAGE. These are plain objects; the queries
 * that produce them live in `content.ts` and are not the subject here.
 */

function post(
  id: number,
  date: string,
  extra: Partial<SitePost> = {},
): SitePost {
  return {
    id,
    title: `Post ${id}`,
    slug: `post-${id}`,
    slugAsParams: `post-${id}`,
    description: "",
    date,
    published: true,
    featured: false,
    ...extra,
  };
}

function race(id: number, year: number, eventId = `event-${id}`): SiteRaceRecord {
  return { distanceId: "100k", eventId, id, year };
}

test("U-TIMELINE-T1: newest year first, and newest day first inside a year", async () => {
  const years = buildRiderTimeline({
    posts: [post(1, "2024-03-02T00:00:00.000Z"), post(2, "2026-05-09T00:00:00.000Z")],
    races: [race(10, 2026)],
    editionFacts: new Map([[10, { startDate: "2026-09-01" }]]),
  });

  expect(years.map((year) => year.year)).toEqual([2026, 2024]);
  // September before May, both in 2026.
  expect(years[0].entries.map((entry) => entry.key)).toEqual(["race-10", "post-2"]);
});

test("U-TIMELINE-T2: a race whose edition has no date keeps its year and sorts last in it", async () => {
  // The realistic case, not a contrived one: `populateRaceRecordRefs` only
  // started filling `edition` partway through this collection's life, and an
  // edition can be deleted afterwards. Either way the record still says which
  // year it was — dropping it, or guessing it happened in January, would both
  // be wrong.
  const years = buildRiderTimeline({
    posts: [post(1, "2025-02-01T00:00:00.000Z")],
    races: [race(10, 2025), race(11, 2025)],
    editionFacts: new Map([[11, { startDate: "2025-07-04", location: "Squamish" }]]),
  });

  expect(years).toHaveLength(1);
  expect(years[0].entries.map((entry) => entry.key)).toEqual([
    "race-11",
    "post-1",
    "race-10",
  ]);
  expect(years[0].entries[0].location).toBe("Squamish");
  expect(years[0].entries[2].day).toBeUndefined();
});

test("U-TIMELINE-T3: a race report is one row with its race, filed under the race's year", async () => {
  const record = race(10, 2025);
  const report = post(1, "2026-01-12T00:00:00.000Z", { race: record });

  const years = buildRiderTimeline({
    posts: [report, post(2, "2026-04-01T00:00:00.000Z")],
    races: [record],
    editionFacts: new Map([[10, { startDate: "2025-12-28" }]]),
  });

  // 2026 holds only the unrelated article; the report went with its race.
  expect(years.map((year) => year.year)).toEqual([2026, 2025]);
  expect(years[0].entries.map((entry) => entry.key)).toEqual(["post-2"]);

  const merged = years[1].entries;
  expect(merged.map((entry) => entry.key)).toEqual(["race-10"]);
  expect(merged[0].post?.id).toBe(1);
  // The race's day, not the article's publication date.
  expect(merged[0].day).toBe("2025-12-28");
});

test("U-TIMELINE-T4: the summary counts a report as both a race and an article", async () => {
  const record = race(10, 2025);
  const years = buildRiderTimeline({
    posts: [post(1, "2025-12-30T00:00:00.000Z", { race: record })],
    races: [record],
  });

  // fixture-scoped: two source rows describing one day, so the row count is
  // what makes this test able to fail. Without it the assertion passes
  // whether or not the merge happened — an unmerged pair also totals one race
  // and one article, just spread over two rows. Verified by disabling the
  // merge and watching this go red.
  expect(years[0].entries).toHaveLength(1);
  // A member who wrote up every race they ran would read as having written
  // nothing if the merged row counted only once.
  expect(summariseTimeline(years)).toEqual({
    postCount: 1,
    raceCount: 1,
    firstYear: 2025,
    lastYear: 2025,
  });
});

test("U-TIMELINE-T5: the span runs from the earliest year to the latest", async () => {
  const years = buildRiderTimeline({
    posts: [post(1, "2019-05-01T00:00:00.000Z")],
    races: [race(10, 2026)],
  });

  const { firstYear, lastYear } = summariseTimeline(years);
  expect([firstYear, lastYear]).toEqual([2019, 2026]);
});

test("U-TIMELINE-T6: a day is formatted from the string, never through Date", async () => {
  // The failure this pins is the one `src/lib/races/calendar.ts` documents:
  // `new Date("2026-08-28")` is UTC midnight, and rendering it anywhere west
  // of Greenwich prints the 27th. The assertion is timezone-independent
  // precisely because no Date is constructed.
  expect(formatMonthDay("2026-08-28")).toBe("8月28日");
  expect(formatMonthDay("2026-01-05")).toBe("1月5日");
});
