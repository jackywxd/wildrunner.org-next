import { expect, test } from "@playwright/test";

import type { SitePost, SiteRaceRecord } from "@/lib/content-types";
import type { CatalogueEvent } from "@/lib/races/catalogue-shape";
import type { TimelineMedia } from "@/lib/riders/timeline-albums";
import {
  buildClubTimeline,
  catalogueForRows,
  clubTimelinePage,
  countClubRows,
  type ClubRunner,
} from "@/lib/riders/club-timeline";

/**
 * U-CLUB — the grouping, ordering and paging behind 野馬營穿越時光
 * (/riders/timeline).
 *
 * THE FAILURES THESE PROTECT AGAINST, each one costly and none of them
 * visible from a rendered page:
 *
 * - Five members at one race drawn as five near-identical cards, burying
 *   everything around them — the whole reason this page groups at all.
 * - A 100M and a 50K folded into one row, so the single badge that row draws
 *   asserts a distance half the people in it did not run.
 * - A page of an infinitely scrolling list starting again from the top when
 *   the row its cursor pointed at has been unpublished — the reader scrolls
 *   and the same twenty rows appear underneath themselves.
 *
 * PLAIN OBJECTS, no catalogue and no database: these are functions of arrays.
 * `content.ts` does the fetching and is not the subject here.
 */

const ann: ClubRunner = { name: "Ann", slug: "ann" };
const bo: ClubRunner = { name: "Bo", slug: "bo" };

function race(id: number, year: number, eventId: string, distanceId = "100k"): SiteRaceRecord {
  return { distanceId, eventId, id, year };
}

function post(id: number, date: string, extra: Partial<SitePost> = {}): SitePost {
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

test("U-CLUB-T1: one race is one row however many members ran it", async () => {
  const rows = buildClubTimeline({
    posts: [],
    races: [
      { record: race(1, 2024, "whistler"), runner: bo },
      { record: race(2, 2024, "whistler"), runner: ann },
    ],
    editionFacts: new Map([
      [1, { startDate: "2024-09-28", location: "Whistler" }],
      [2, { startDate: "2024-09-28", location: "Whistler" }],
    ]),
  });

  expect(rows).toHaveLength(1);
  // fixture-scoped: two records, one row, both runners on it — sorted by name
  // so two renders of the same data never disagree.
  expect(rows[0].race?.runners.map((r) => r.slug)).toEqual(["ann", "bo"]);
  expect(rows[0].day).toBe("2024-09-28");
  expect(rows[0].location).toBe("Whistler");
});

test("U-CLUB-T2: two distances at the same race stay two rows", async () => {
  // The badge is (event, distance, year). Folding these together would draw
  // one badge claiming a distance one of the two runners never entered.
  const rows = buildClubTimeline({
    posts: [],
    races: [
      { record: race(1, 2024, "whistler", "100m"), runner: ann },
      { record: race(2, 2024, "whistler", "50k"), runner: bo },
    ],
  });

  // fixture-scoped: two records that differ only in distance, so two rows —
  // the count is the assertion, not a size check.
  expect(rows).toHaveLength(2);
  expect(rows.map((row) => row.race?.distanceId).sort()).toEqual(["100m", "50k"]);
  for (const row of rows) expect(row.race?.runners).toHaveLength(1);
});

test("U-CLUB-T3: newest year first, newest day first, undated last in its year", async () => {
  const rows = buildClubTimeline({
    posts: [{ author: ann, post: post(9, "2022-06-01T00:00:00.000Z") }],
    races: [
      { record: race(1, 2024, "a"), runner: ann },
      { record: race(2, 2024, "b"), runner: ann },
    ],
    editionFacts: new Map([[2, { startDate: "2024-05-05" }]]),
  });

  expect(rows.map((row) => row.key)).toEqual([
    "race-b|100k|2024",
    "race-a|100k|2024",
    "post-9",
  ]);
});

test("U-CLUB-T4: a race report joins its own race's row, under the race's day", async () => {
  const record = race(1, 2023, "utmb");
  const report = post(5, "2024-01-20T00:00:00.000Z", { race: record });

  const rows = buildClubTimeline({
    posts: [{ author: ann, post: report }],
    races: [{ record, runner: ann }],
    editionFacts: new Map([[1, { startDate: "2023-08-31" }]]),
  });

  // fixture-scoped: one race and one write-up of it — one row, filed in 2023
  // where the race was, not in 2024 where the article was published.
  expect(rows).toHaveLength(1);
  expect(rows[0].year).toBe(2023);
  expect(rows[0].day).toBe("2023-08-31");
  expect(rows[0].posts.map((p) => p.id)).toEqual([5]);
});

test("U-CLUB-T5: the next page continues, and does not restart when its cursor row is gone", async () => {
  const rows = buildClubTimeline({
    posts: [1, 2, 3, 4, 5].map((n) => ({ post: post(n, `2024-0${n}-01T00:00:00.000Z`) })),
    races: [],
  });
  // Newest first: post-5 … post-1.
  const first = clubTimelinePage(rows, null, 2);
  expect(first.rows.map((r) => r.key)).toEqual(["post-5", "post-4"]);
  expect(first.nextCursor?.key).toBe("post-4");

  const second = clubTimelinePage(rows, first.nextCursor, 2);
  expect(second.rows.map((r) => r.key)).toEqual(["post-3", "post-2"]);

  // The cursor's own row has been unpublished between the two fetches. The
  // page after it must still be the page after it — an index-based cursor
  // would have handed back the top of the list.
  const without = rows.filter((row) => row.key !== "post-4");
  const recovered = clubTimelinePage(without, first.nextCursor, 2);
  expect(recovered.rows.map((r) => r.key)).toEqual(["post-3", "post-2"]);
});

test("U-CLUB-T8: races with no date of their own still fall in race order", async () => {
  // Two races in one year, neither edition dated — which is every race in this
  // database today. Ordered by when each event actually runs, so Hardrock
  // (July) sits above UTMB (late August) reversed: newest first.
  const rows = buildClubTimeline({
    posts: [{ post: post(1, "2023-06-01T00:00:00.000Z") }],
    races: [
      { record: race(1, 2023, "hardrock"), runner: ann },
      { record: race(2, 2023, "utmb"), runner: bo },
    ],
    editionFacts: new Map([
      [1, { typicalDay: "07-14" }],
      [2, { typicalDay: "08-28" }],
    ]),
  });

  expect(rows.map((row) => row.key)).toEqual([
    "race-utmb|100k|2023",
    "race-hardrock|100k|2023",
    "post-1",
  ]);
  // Position only: neither card shows a date.
  expect(rows.map((row) => row.day)).toEqual([undefined, undefined, "2023-06-01"]);
});

function picture(id: number, over: Partial<TimelineMedia> = {}): TimelineMedia {
  return {
    mediaId: id,
    kind: "photo",
    image: { src: `p${id}`, width: 1200, height: 800 },
    day: "2024-09-28",
    daySource: "album",
    ...over,
  };
}

test("U-CLUB-T9: a race's pictures land on one of its rows, not on both", async () => {
  // One edition, two distances — two rows, because the badge is (event,
  // distance, year). A picture is tagged to the *edition* and knows nothing
  // about distance, so both rows have an equal claim; drawing the same strip
  // twice on one day reads as two different sets of photographs.
  const rows = buildClubTimeline({
    posts: [],
    races: [
      { record: race(1, 2024, "whistler", "100m"), runner: ann },
      { record: race(2, 2024, "whistler", "50k"), runner: bo },
    ],
    editionFacts: new Map([
      [1, { editionId: 42, startDate: "2024-09-28" }],
      [2, { editionId: 42, startDate: "2024-09-28" }],
    ]),
    media: [picture(1, { raceEditionId: 42 }), picture(2, { raceEditionId: 42 })],
  });

  const withMedia = rows.filter((row) => row.media);
  // fixture-scoped: two rows for one edition, and exactly one of them carries
  // the pictures.
  expect(withMedia).toHaveLength(1);
  expect(withMedia[0].media?.photoCount).toBe(2);
  // The row that got them is the first as rendered, not an arbitrary one.
  expect(withMedia[0].key).toBe(rows.find((r) => r.race?.editionId === 42)?.key);
  // And no month row was made from them.
  expect(rows.some((row) => row.month)).toBe(false);
});

test("U-CLUB-T10: pictures of no race become a month row in their own year", async () => {
  const rows = buildClubTimeline({
    posts: [{ post: post(1, "2024-11-02T00:00:00.000Z") }],
    races: [],
    media: [
      picture(1, { day: "2024-06-14", album: { slug: "night-run", name: "Panorama ridge night run" } }),
      picture(2, { day: "2024-06-02", album: { slug: "night-run", name: "Panorama ridge night run" } }),
      // A different month, so the two must not merge.
      picture(3, { day: "2023-08-01" }),
    ],
  });

  const months = rows.filter((row) => row.month);
  expect(months.map((row) => row.key)).toEqual(["month-2024-06", "month-2023-08"]);
  // The article is November, the month row is June — newest first within 2024.
  expect(rows.map((row) => row.key)).toEqual([
    "post-1",
    "month-2024-06",
    "month-2023-08",
  ]);
  expect(months[0].month?.photoCount).toBe(2);
  // The names people wrote survive the merge.
  expect(months[0].month?.albums.map((a) => a.slug)).toEqual(["night-run"]);
});

test("U-CLUB-T6: a grouped race counts once per runner", async () => {
  const rows = buildClubTimeline({
    posts: [],
    races: [
      { record: race(1, 2024, "whistler"), runner: ann },
      { record: race(2, 2024, "whistler"), runner: bo },
    ],
  });

  // fixture-scoped: one row, two finishes. A club's total is people who
  // finished, not rows drawn — "1 場完賽" for a race two members ran is the
  // number being wrong, not the number being terse.
  expect(rows).toHaveLength(1);
  expect(countClubRows(rows)).toEqual({ postCount: 0, raceCount: 2 });
});

test("U-CLUB-T7: a page carries only the catalogue entries its own rows draw", async () => {
  const events: CatalogueEvent[] = [
    {
      id: "whistler",
      name: "Whistler by UTMB",
      series: "utmb",
      distances: [
        { id: "100m", label: "100M" },
        { id: "50k", label: "50K" },
        { id: "20k", label: "20K" },
      ],
    },
    { id: "hardrock", name: "Hardrock 100", series: "others", distances: [{ id: "100m", label: "100M" }] },
  ];

  const rows = buildClubTimeline({
    posts: [],
    races: [{ record: race(1, 2024, "whistler", "50k"), runner: ann }],
  });

  const picked = catalogueForRows(rows, events);
  // The whole catalogue is ~100 events and ~400 categories; this page draws
  // one badge. Sending the rest with every scroll is the bandwidth this
  // pagination exists to save.
  expect(picked.map((e) => e.id)).toEqual(["whistler"]);
  expect(picked[0].distances.map((d) => d.id)).toEqual(["50k"]);
});
