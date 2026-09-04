/**
 * Albums on 時間機 — the one rule, shared by both rails.
 *
 * A member's timeline and the club's timeline are separate builders on
 * purpose (one groups across members, the other does not), but what an album
 * *is* on a rail must not differ between them: the same date, the same month
 * bucket, the same reason it does or does not sit on a race. So that lives
 * here and both import it.
 *
 * PURE. Everything below is a function of `SiteGallery` values, so the
 * bucketing is checked without a server — see `e2e/unit/timeline-albums.spec.ts`.
 *
 * DATES ARE "YYYY-MM-DD" STRINGS, compared lexicographically, per
 * `src/lib/races/calendar.ts`. Nothing here constructs a `Date`.
 */

import type { SiteGallery, SiteImage } from "@/lib/content-types";
import { albumRaceEditionId } from "@/lib/media/gallery-index";
import { photosOf, videosOf } from "@/lib/media/gallery-items";

/** An album as a rail shows it. Narrower than `SiteGallery` — this crosses to the browser. */
export type TimelineAlbum = {
  slug: string;
  name: string;
  /** "YYYY-MM-DD". Always set: `albumDay` falls back to the row's own createdAt. */
  day: string;
  photoCount: number;
  videoCount: number;
  /** Which race this album is of, when a curator or its items say so. */
  raceEditionId?: number;
  /** A few pictures for the strip. Photos only — see `THUMBNAIL_CAP`. */
  thumbnails: SiteImage[];
};

/**
 * How many pictures a row shows before it is just a wall.
 *
 * Six, and the number is set by the printed page rather than the screen: a
 * row already carries a title, a count and album names, and a strip deeper
 * than one line turns a month into half a sheet of paper. On screen the strip
 * wraps and six is comfortably one line at every width the rail is drawn at.
 */
export const THUMBNAIL_CAP = 6;

/**
 * When the album happened — NOT when its files were uploaded.
 *
 * `eventDate` first, and this is the whole reason albums rather than photos
 * are the unit here. Measured on the seeded corpus the day this shipped:
 * every one of 420 media rows had a `createdAt` inside a single month (the
 * import), while all 20 albums carried a real `eventDate` spread across two
 * years. Bucketing photos by their own timestamps would have produced one row
 * reading "2026年9月 · 420 張" and nothing else.
 *
 * `created` is the fallback rather than "no date", because an album with no
 * `eventDate` still has to appear somewhere, and the day somebody made the
 * album is the closest true statement available. No album in the corpus needs
 * it today; the branch exists because the field is optional.
 */
export function albumDay(gallery: Pick<SiteGallery, "created" | "eventDate">): string {
  return (gallery.eventDate ?? gallery.created).slice(0, 10);
}

/** "2025-04-25" → "2025-04". */
export function monthKeyOf(day: string): string {
  return day.slice(0, 7);
}

export function toTimelineAlbum(gallery: SiteGallery): TimelineAlbum {
  const photos = photosOf(gallery.items);
  return {
    slug: gallery.slug,
    name: gallery.name,
    day: albumDay(gallery),
    photoCount: photos.length,
    videoCount: videosOf(gallery.items).length,
    raceEditionId: albumRaceEditionId(gallery),
    // The cover first when there is one, because a curator chose it; then the
    // album's own order, which is also a curator's. Deduped by `src` so a
    // cover that is also the first item does not appear twice.
    thumbnails: dedupeBySrc([
      ...(gallery.cover ? [gallery.cover] : []),
      ...photos.map((photo) => ({
        src: photo.src,
        width: photo.width,
        height: photo.height,
        blurDataURL: photo.blurDataURL,
      })),
    ]).slice(0, THUMBNAIL_CAP),
  };
}

function dedupeBySrc(images: SiteImage[]): SiteImage[] {
  const seen = new Set<string>();
  const out: SiteImage[] = [];
  for (const image of images) {
    if (seen.has(image.src)) continue;
    seen.add(image.src);
    out.push(image);
  }
  return out;
}

export type AlbumMonth = {
  /** "YYYY-MM". */
  month: string;
  year: number;
  /** The latest album day in the month — where the bucket sits among that month's rows. */
  day: string;
  albums: TimelineAlbum[];
  photoCount: number;
  videoCount: number;
};

/**
 * Albums with no race, merged one row per month.
 *
 * ONE ROW PER MONTH, BUT THE NAMES SURVIVE. "以月為單位合併" is the rule; a
 * bucket that only said "2025年4月 · 51 張" would throw away "Panorama ridge
 * night run", which is a thing a person wrote. So the row is per month and the
 * albums inside it keep their names and their links.
 *
 * The bucket's `day` is the newest album in it, not the first of the month:
 * the rails sort by day within a year, and a bucket claiming the 1st would sit
 * below races that happened before its own albums did.
 *
 * Albums inside a bucket are newest first, matching every other list on the
 * site; `slug` breaks ties so the order is total and two renders agree.
 */
export function bucketAlbumsByMonth(albums: TimelineAlbum[]): AlbumMonth[] {
  const byMonth = new Map<string, TimelineAlbum[]>();
  for (const album of albums) {
    const month = monthKeyOf(album.day);
    const list = byMonth.get(month) ?? [];
    list.push(album);
    byMonth.set(month, list);
  }

  const months: AlbumMonth[] = [];
  for (const [month, list] of byMonth) {
    list.sort((a, b) => (a.day === b.day ? a.slug.localeCompare(b.slug) : a.day < b.day ? 1 : -1));
    months.push({
      month,
      year: Number(month.slice(0, 4)),
      day: list.reduce((latest, album) => (album.day > latest ? album.day : latest), list[0].day),
      albums: list,
      photoCount: list.reduce((n, album) => n + album.photoCount, 0),
      videoCount: list.reduce((n, album) => n + album.videoCount, 0),
    });
  }
  return months;
}

/** "2025-04" → "2025年4月". String surgery, never a `Date` — see the header. */
export function formatMonth(month: string): string {
  const [year, m] = month.split("-");
  return `${year}年${Number(m)}月`;
}

/**
 * Split albums into the ones a race row can claim and the ones that cannot.
 *
 * `editionIds` is the set of editions the rail actually draws a race row for.
 * An album tagged to a race **nobody logged** has no row to sit on, so it
 * falls into its month instead — which is true rather than inventing a race
 * row for it. The alternative, a row with a badge and no runners, would say
 * the club ran a race it has no record of.
 */
export function splitAlbumsByRace(
  albums: TimelineAlbum[],
  editionIds: Set<number>,
): { attached: Map<number, TimelineAlbum[]>; loose: TimelineAlbum[] } {
  const attached = new Map<number, TimelineAlbum[]>();
  const loose: TimelineAlbum[] = [];

  for (const album of albums) {
    const id = album.raceEditionId;
    if (id === undefined || !editionIds.has(id)) {
      loose.push(album);
      continue;
    }
    const list = attached.get(id) ?? [];
    list.push(album);
    attached.set(id, list);
  }

  for (const list of attached.values()) {
    list.sort((a, b) => (a.day === b.day ? a.slug.localeCompare(b.slug) : a.day < b.day ? 1 : -1));
  }
  return { attached, loose };
}
