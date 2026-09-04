/**
 * Where a picture sits on 穿越時光, and what date it sits at.
 *
 * THE UNIT IS ONE MEDIA ROW, NOT ONE ALBUM. An earlier draft placed whole
 * albums and it was wrong in a way worth recording: a general album that
 * happens to contain three photos tagged to a race would have kept all three
 * in its month, when those three belong to that race. The rule below resolves
 * each picture on its own, so an album is a *source of facts* about its
 * pictures (a date, a name, possibly a race) rather than the thing being
 * placed.
 *
 * PURE. Everything here is a function of plain values, so the rule is checked
 * without a server — see `e2e/unit/timeline-albums.spec.ts`.
 *
 * DATES ARE "YYYY-MM-DD" STRINGS, compared lexicographically, per
 * `src/lib/races/calendar.ts`. Nothing here constructs a `Date`.
 */

import type { SiteImage } from "@/lib/content-types";

/**
 * How many pictures a row shows before it is just a wall.
 *
 * Six, and the number is set by the printed page rather than the screen: a row
 * already carries a title, a count and album names, and a strip deeper than
 * one line turns a month into half a sheet of paper.
 */
export const THUMBNAIL_CAP = 6;

/** Which fact gave a picture its date. Carried so a test can name it. */
export type DaySource = "race" | "album" | "upload";

/**
 * The date a picture is filed under, and where that date came from.
 *
 * THE ORDER IS THE RULE, and every step of it exists because the step below
 * it lies in a case that really happens:
 *
 *   race    the picture is of a race — the race's own day is when it happened,
 *           whoever uploaded it whenever. Beats the album, because a race
 *           photo that ended up in a general album is still of that race.
 *   album   an album is very often made long after the day it is about, which
 *           is exactly why `galleries.eventDate` exists; the album's own
 *           `createdAt` would be the day somebody sat down to organise it.
 *   upload  only for a picture in no album and of no race. Then the upload is
 *           genuinely the only timestamp anybody ever recorded.
 *
 * MEASURED, not reasoned: on the seeded corpus every one of 420 media rows had
 * a `createdAt` inside a single month — the import — while the twenty albums
 * carried real `eventDate`s spread across two years. Filing by `createdAt`
 * first would have produced one row reading "2026年9月 · 420 張".
 */
export function resolveMediaDay(sources: {
  /** The race edition's day, when this picture is of a race. */
  raceDay?: string;
  /** The album's `eventDate` (never its `createdAt`), when it is in one. */
  albumDay?: string;
  /** The media row's own `createdAt`. Always present. */
  uploadedAt: string;
}): { day: string; source: DaySource } {
  if (sources.raceDay) return { day: sources.raceDay.slice(0, 10), source: "race" };
  if (sources.albumDay) return { day: sources.albumDay.slice(0, 10), source: "album" };
  return { day: sources.uploadedAt.slice(0, 10), source: "upload" };
}

/** An album, only as much of it as a rail names. */
export type TimelineAlbumRef = { slug: string; name: string };

/** One picture or clip, dated and assigned. */
export type TimelineMedia = {
  mediaId: number;
  kind: "photo" | "video";
  /** Photos only — a video has no reliable still, so it is counted, not shown. */
  image?: SiteImage;
  day: string;
  daySource: DaySource;
  /** Its own tag, or the one it inherits from its album. */
  raceEditionId?: number;
  album?: TimelineAlbumRef;
};

/** "2025-04-25" → "2025-04". */
export function monthKeyOf(day: string): string {
  return day.slice(0, 7);
}

/** "2025-04" → "2025年4月". String surgery, never a `Date` — see the header. */
export function formatMonth(month: string): string {
  const [year, m] = month.split("-");
  return `${year}年${Number(m)}月`;
}

export type MediaMonth = {
  /** "YYYY-MM". */
  month: string;
  year: number;
  /** The newest picture in the month — where the bucket sits among that month's rows. */
  day: string;
  photoCount: number;
  videoCount: number;
  /** The albums these pictures came from, newest first, deduped. Loose media name none. */
  albums: TimelineAlbumRef[];
  thumbnails: SiteImage[];
};

/**
 * Pictures of no race, merged one row per month.
 *
 * ONE ROW PER MONTH, BUT THE NAMES SURVIVE. "以月為單位合併" is the rule; a
 * bucket that only said "2025年4月 · 51 張" would throw away "Panorama ridge
 * night run", which is a thing a person wrote. So the row is per month and the
 * albums inside it keep their names and their links. A picture in no album
 * contributes no name, which is correct — there is none.
 *
 * The bucket's `day` is its newest picture, not the first of the month: the
 * rails sort by day within a year, and a bucket claiming the 1st would sit
 * below races that happened before its own pictures did.
 */
export function groupMediaByMonth(media: TimelineMedia[]): MediaMonth[] {
  const byMonth = new Map<string, TimelineMedia[]>();
  for (const item of media) {
    const month = monthKeyOf(item.day);
    const list = byMonth.get(month) ?? [];
    list.push(item);
    byMonth.set(month, list);
  }

  const months: MediaMonth[] = [];
  for (const [month, list] of byMonth) {
    // Newest first, `mediaId` breaking ties so the order is total and two
    // renders of the same data agree — which is what the rails' cursor needs.
    list.sort((a, b) => (a.day === b.day ? a.mediaId - b.mediaId : a.day < b.day ? 1 : -1));

    const albums: TimelineAlbumRef[] = [];
    const seenAlbum = new Set<string>();
    const thumbnails: SiteImage[] = [];
    const seenSrc = new Set<string>();
    let photoCount = 0;
    let videoCount = 0;

    for (const item of list) {
      if (item.kind === "photo") photoCount += 1;
      else videoCount += 1;

      if (item.album && !seenAlbum.has(item.album.slug)) {
        seenAlbum.add(item.album.slug);
        albums.push(item.album);
      }
      if (item.image && thumbnails.length < THUMBNAIL_CAP && !seenSrc.has(item.image.src)) {
        seenSrc.add(item.image.src);
        thumbnails.push(item.image);
      }
    }

    months.push({
      month,
      year: Number(month.slice(0, 4)),
      day: list[0].day,
      photoCount,
      videoCount,
      albums,
      thumbnails,
    });
  }
  return months;
}

export type RaceMedia = {
  photoCount: number;
  videoCount: number;
  albums: TimelineAlbumRef[];
  thumbnails: SiteImage[];
};

/**
 * Split pictures into the ones a race row can claim and the ones that cannot.
 *
 * `editionIds` is the set of editions the rail actually draws a race row for.
 * A picture of a race **nobody logged** has no row to sit on, so it falls into
 * its month instead — carrying the race's date, which is still the truest
 * thing known about it. Inventing a race row for it would say the club ran a
 * race it has no record of.
 */
export function splitMediaByRace(
  media: TimelineMedia[],
  editionIds: Set<number>,
): { byEdition: Map<number, RaceMedia>; loose: TimelineMedia[] } {
  const grouped = new Map<number, TimelineMedia[]>();
  const loose: TimelineMedia[] = [];

  for (const item of media) {
    const id = item.raceEditionId;
    if (id === undefined || !editionIds.has(id)) {
      loose.push(item);
      continue;
    }
    const list = grouped.get(id) ?? [];
    list.push(item);
    grouped.set(id, list);
  }

  const byEdition = new Map<number, RaceMedia>();
  for (const [id, list] of grouped) {
    list.sort((a, b) => a.mediaId - b.mediaId);
    const albums: TimelineAlbumRef[] = [];
    const seenAlbum = new Set<string>();
    const thumbnails: SiteImage[] = [];
    const seenSrc = new Set<string>();
    let photoCount = 0;
    let videoCount = 0;

    for (const item of list) {
      if (item.kind === "photo") photoCount += 1;
      else videoCount += 1;
      if (item.album && !seenAlbum.has(item.album.slug)) {
        seenAlbum.add(item.album.slug);
        albums.push(item.album);
      }
      if (item.image && thumbnails.length < THUMBNAIL_CAP && !seenSrc.has(item.image.src)) {
        seenSrc.add(item.image.src);
        thumbnails.push(item.image);
      }
    }
    byEdition.set(id, { photoCount, videoCount, albums, thumbnails });
  }

  return { byEdition, loose };
}
