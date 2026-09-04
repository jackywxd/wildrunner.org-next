import { expect, test } from "@playwright/test";

import {
  THUMBNAIL_CAP,
  formatMonth,
  groupMediaByMonth,
  resolveMediaDay,
  splitMediaByRace,
  type TimelineMedia,
} from "@/lib/riders/timeline-albums";

/**
 * U-ALBUM — where a picture lands on 時間機, and what date it lands at.
 *
 * THE FAILURE THAT MADE THIS A FEATURE, pinned first: dating a picture by its
 * upload. Measured on the seeded corpus before any of it was written — 420
 * media rows whose `createdAt` all fell inside one month (the import), against
 * 20 albums carrying real `eventDate`s across two years. Filing by the upload
 * would have produced a single row saying "2026年9月 · 420 張" and called it a
 * timeline.
 *
 * The rest, each a case that really happens: a race photo that ended up in a
 * general album and must still go to the race; an album made months after the
 * day it is about; a month bucket that loses the names people wrote, or that
 * claims the 1st and therefore sits below races it happened after; and a
 * picture of a race the rail draws no row for, which has nowhere to attach and
 * must not invent one.
 *
 * Plain objects, no database — these are functions of values.
 */

function media(id: number, over: Partial<TimelineMedia> = {}): TimelineMedia {
  return {
    mediaId: id,
    kind: "photo",
    image: { src: `p${id}`, width: 1200, height: 800 },
    day: "2025-04-25",
    daySource: "album",
    ...over,
  };
}

test("U-ALBUM-T1: the race's day beats the album's, and the album's beats the upload", async () => {
  // All three known: the picture is of a race, so it is dated by the race —
  // whoever uploaded it whenever, and whatever album it ended up in.
  expect(
    resolveMediaDay({ raceDay: "2025-08-29", albumDay: "2025-06-14", uploadedAt: "2026-09-02T00:00:00.000Z" }),
  ).toEqual({ day: "2025-08-29", source: "race" });

  // No race: the album. An album is very often made long after the day it is
  // about, which is why `eventDate` exists and why the upload is not used here.
  expect(
    resolveMediaDay({ albumDay: "2025-06-14T00:00:00.000Z", uploadedAt: "2026-09-02T00:00:00.000Z" }),
  ).toEqual({ day: "2025-06-14", source: "album" });

  // In no album and of no race — then the upload really is the only timestamp
  // anybody recorded.
  expect(resolveMediaDay({ uploadedAt: "2026-09-02T00:00:00.000Z" })).toEqual({
    day: "2026-09-02",
    source: "upload",
  });
});

test("U-ALBUM-T2: pictures in one month become one row that still names their albums", async () => {
  const sinister = { slug: "sinister7", name: "Sinister7 2025" };
  const fuji = { slug: "mt-fuji", name: "Mt Fuji 100 | 2025" };

  const months = groupMediaByMonth([
    media(1, { day: "2025-04-25", album: sinister }),
    media(2, { day: "2025-04-11", album: fuji }),
    media(3, { day: "2025-04-11", album: fuji, kind: "video", image: undefined }),
    media(4, { day: "2025-10-17", album: { slug: "utmb", name: "UTMB 2025" } }),
  ]);

  // fixture-scoped: four pictures across two months — the count is the
  // assertion, not a size check.
  expect(months).toHaveLength(2);
  const april = months.find((m) => m.month === "2025-04");
  expect(april?.albums.map((a) => a.slug)).toEqual(["sinister7", "mt-fuji"]);
  // Videos are counted but never drawn — there is no reliable still.
  expect([april?.photoCount, april?.videoCount]).toEqual([2, 1]);
  expect(april?.thumbnails).toHaveLength(2);
  expect(formatMonth("2025-04")).toBe("2025年4月");
});

test("U-ALBUM-T3: the month sits on its newest picture, not on the 1st", async () => {
  // The rails sort by day within a year. A bucket claiming the 1st would sit
  // below every race that happened after it but before its own pictures did.
  const [april] = groupMediaByMonth([
    media(1, { day: "2025-04-02" }),
    media(2, { day: "2025-04-28" }),
  ]);
  expect(april.day).toBe("2025-04-28");
  expect(april.year).toBe(2025);
});

test("U-ALBUM-T4: a picture goes to its race, unless the rail draws no row for it", async () => {
  const general = { slug: "night-run", name: "Panorama ridge night run" };

  const { byEdition, loose } = splitMediaByRace(
    [
      // Tagged to a race the rail draws — leaves its album's month for the race.
      media(1, { raceEditionId: 7, album: general, day: "2025-08-29", daySource: "race" }),
      // Tagged to a race nobody logged: no row to sit on, so it stays loose,
      // still carrying the race's date.
      media(2, { raceEditionId: 99, day: "2025-08-25", daySource: "race" }),
      media(3, { album: general, day: "2025-06-14" }),
    ],
    new Set([7]),
  );

  expect(byEdition.get(7)?.photoCount).toBe(1);
  // The album's name travels with the picture, so a race row can say where
  // its photos came from.
  expect(byEdition.get(7)?.albums.map((a) => a.slug)).toEqual(["night-run"]);
  expect(loose.map((m) => m.mediaId)).toEqual([2, 3]);
});

test("U-ALBUM-T5: a strip is capped and never shows the same picture twice", async () => {
  const items = Array.from({ length: 10 }, (_, i) => media(i + 1));
  // fixture-scoped: two of the ten point at one file, so without the dedupe a
  // strip of six would spend two of its places on the same picture.
  items[3].image = { src: "p1", width: 10, height: 10 };

  const [month] = groupMediaByMonth(items);
  expect(month.thumbnails).toHaveLength(THUMBNAIL_CAP);
  expect(new Set(month.thumbnails.map((t) => t.src)).size).toBe(THUMBNAIL_CAP);
});
