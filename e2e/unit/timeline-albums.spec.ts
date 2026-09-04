import { expect, test } from "@playwright/test";

import type { SiteGallery, SiteMediaItem } from "@/lib/content-types";
import { albumRaceEditionId } from "@/lib/media/gallery-index";
import {
  THUMBNAIL_CAP,
  albumDay,
  bucketAlbumsByMonth,
  formatMonth,
  splitAlbumsByRace,
  toTimelineAlbum,
} from "@/lib/riders/timeline-albums";

/**
 * U-ALBUM — how an album lands on 時間機.
 *
 * THE FAILURE THAT MADE THIS FEATURE A FEATURE, and the first thing pinned
 * here: dating an album by its files. Measured on the seeded corpus before any
 * of this was written — 420 media rows whose `createdAt` all fell inside one
 * month (the import), against 20 albums carrying real `eventDate`s across two
 * years. Bucketing by the files would have produced a single row saying
 * "2026年9月 · 420 張" and called it a timeline.
 *
 * The others: a month bucket that loses the names people wrote; a bucket that
 * claims the 1st of the month and therefore sits below races it happened
 * after; and an album tagged to a race the rail draws no row for, which has
 * nowhere to attach and must not invent a race.
 *
 * Plain objects, no database — these are functions of `SiteGallery` values.
 */

function photo(src: string): SiteMediaItem {
  return {
    kind: "photo",
    mediaId: Number(src.replace(/\D/g, "")) || 1,
    src,
    width: 1200,
    height: 800,
    filename: `${src}.jpg`,
    slug: src,
    featured: false,
    createdAt: "2026-09-01T00:00:00.000Z",
  };
}

function album(
  slug: string,
  extra: Partial<SiteGallery> = {},
  items: SiteMediaItem[] = [photo(`${slug}-1`)],
): SiteGallery {
  return {
    slug,
    name: slug,
    created: "2026-09-02T00:00:00.000Z",
    isFeatured: false,
    featured: [],
    musicPlaylist: [],
    items,
    ...extra,
  };
}

test("U-ALBUM-T1: an album is dated by its event, not by when its files were uploaded", async () => {
  // The measured case: every file imported in 2026-09, the album about an
  // event in 2025-04. Taking the files' date would collapse the whole rail
  // into one month.
  expect(albumDay(album("a", { eventDate: "2025-04-25T00:00:00.000Z" }))).toBe("2025-04-25");
  // No eventDate is not "no date" — the day somebody made the album is the
  // closest true statement left.
  expect(albumDay(album("b"))).toBe("2026-09-02");
});

test("U-ALBUM-T2: albums in one month become one row that still names them", async () => {
  const months = bucketAlbumsByMonth([
    toTimelineAlbum(album("sinister7", { eventDate: "2025-04-25T00:00:00.000Z" })),
    toTimelineAlbum(album("mt-fuji", { eventDate: "2025-04-11T00:00:00.000Z" })),
    toTimelineAlbum(album("utmb", { eventDate: "2025-10-17T00:00:00.000Z" })),
  ]);

  // fixture-scoped: three albums across two months — the count is the
  // assertion, not a size check.
  expect(months).toHaveLength(2);
  const april = months.find((m) => m.month === "2025-04");
  expect(april?.albums.map((a) => a.slug)).toEqual(["sinister7", "mt-fuji"]);
  expect(april?.photoCount).toBe(2);
  expect(formatMonth("2025-04")).toBe("2025年4月");
});

test("U-ALBUM-T3: the month sits on its newest album, not on the 1st", async () => {
  // The rails sort by day within a year. A bucket claiming the 1st would sit
  // below every race that happened after it but before its own albums did.
  const [april] = bucketAlbumsByMonth([
    toTimelineAlbum(album("early", { eventDate: "2025-04-02T00:00:00.000Z" })),
    toTimelineAlbum(album("late", { eventDate: "2025-04-28T00:00:00.000Z" })),
  ]);
  expect(april.day).toBe("2025-04-28");
  expect(april.year).toBe(2025);
});

test("U-ALBUM-T4: an album goes to its race, unless the rail draws no row for it", async () => {
  const tagged = toTimelineAlbum(album("utmb-2025", { eventDate: "2025-08-29T00:00:00.000Z", raceEditionId: 7 }));
  const orphan = toTimelineAlbum(album("fatdog", { eventDate: "2025-08-25T00:00:00.000Z", raceEditionId: 99 }));
  const loose = toTimelineAlbum(album("night-run", { eventDate: "2025-06-14T00:00:00.000Z" }));

  // Edition 7 has a race row; 99 does not — nobody logged that race.
  const { attached, loose: rest } = splitAlbumsByRace([tagged, orphan, loose], new Set([7]));

  expect(attached.get(7)?.map((a) => a.slug)).toEqual(["utmb-2025"]);
  // The orphan falls into its month rather than inventing a race row with a
  // badge and no runners.
  expect(rest.map((a) => a.slug).sort()).toEqual(["fatdog", "night-run"]);
});

test("U-ALBUM-T5: the album's own tag wins, and a mixed album belongs to nobody", async () => {
  const tagOnItems = (ids: number[]) =>
    ids.map((id, i) => ({ ...photo(`p${i}`), raceEditionId: id }) as SiteMediaItem);

  // The curator's one edit beats whatever the files say.
  expect(albumRaceEditionId(album("a", { raceEditionId: 3 }, tagOnItems([9, 9])))).toBe(3);
  // Untagged album whose files agree means the same thing, and should not have
  // to be re-tagged to be understood.
  expect(albumRaceEditionId(album("b", {}, tagOnItems([9, 9])))).toBe(9);
  // Two races in one album is not "of" either — it falls into its month, which
  // is true, rather than onto the first race, which is a claim.
  expect(albumRaceEditionId(album("c", {}, tagOnItems([9, 4])))).toBeUndefined();
  expect(albumRaceEditionId(album("d"))).toBeUndefined();
});

test("U-ALBUM-T6: the strip is capped, cover first, and never the same picture twice", async () => {
  const items = Array.from({ length: 10 }, (_, i) => photo(`p${i}`));
  const built = toTimelineAlbum(
    album("many", { cover: { src: "p3", width: 10, height: 10 } }, items),
  );

  expect(built.thumbnails).toHaveLength(THUMBNAIL_CAP);
  expect(built.thumbnails[0].src).toBe("p3");
  // fixture-scoped: the cover is also item p3, so without the dedupe it would
  // appear twice in a strip of six.
  expect(new Set(built.thumbnails.map((t) => t.src)).size).toBe(THUMBNAIL_CAP);
});
