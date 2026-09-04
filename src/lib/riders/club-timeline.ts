/**
 * The club's own time machine: every member's races and articles on one rail.
 *
 * THE DIFFERENCE FROM `timeline.ts` IS GROUPING, NOT SCALE. A member's own
 * page has one row per race because there is one runner. Here five people
 * ran Whistler 2024 and five near-identical cards on one day would bury
 * everything around them — so a race is one row and the runners are a list
 * inside it. That is also the sentence a club timeline exists to say: not
 * "she ran it", but "that year we went".
 *
 * GROUPED BY EVENT **AND DISTANCE**, not by event alone. A row draws one
 * badge, and a badge is (event, distance, year) — folding a 100M and a 50K
 * into one row would make the badge lie about half the people in it. The two
 * rows share a day, so they still sit next to each other.
 *
 * PURE, and the same reasoning as `timeline.ts`: ordering, grouping and
 * paging are checked without a server. Names and badge artwork are *not*
 * resolved here — those need the catalogue, and keeping them out is what lets
 * one page of rows travel to the browser as JSON for the infinite scroll.
 *
 * Dates are "YYYY-MM-DD" strings compared lexicographically. See
 * `src/lib/races/calendar.ts` for why a `Date` is never constructed.
 */

import type { SiteImage, SitePost, SiteRaceRecord } from "@/lib/content-types";
import type { CatalogueEvent } from "@/lib/races/catalogue-shape";
import {
  groupMediaByMonth,
  splitMediaByRace,
  type MediaMonth,
  type RaceMedia,
  type TimelineMedia,
} from "@/lib/riders/timeline-albums";
import { sortDayFor } from "@/lib/riders/timeline";
import type { RaceEditionFacts } from "@/lib/riders/timeline";

/** A member as a row shows them: the public byline, never a `users` row. */
export type ClubRunner = {
  name: string;
  slug: string;
  avatar?: SiteImage;
};

/** An article as a row shows it. Narrower than `SitePost` because it is sent to the browser. */
export type ClubPost = {
  id: number;
  title: string;
  description?: string;
  slug: string;
  /** "YYYY-MM-DD". */
  day?: string;
  image?: SiteImage;
  author?: ClubRunner;
};

export type ClubTimelineRow = {
  key: string;
  year: number;
  /** "YYYY-MM-DD", or absent when only the year is known. What is shown. */
  day?: string;
  /**
   * What the order is decided by: the real date when known, otherwise where
   * this event sits in a year, projected onto this one. See
   * `RaceEditionFacts.typicalDay` in `timeline.ts` — an inference that is
   * allowed to decide a position and never a label, because every past
   * edition in this database has no `startDate` and without it a club rail
   * lists its races alphabetically.
   */
  sortDay?: string;
  location?: string;
  /** Present on a race row. One event, one distance, one year — one badge. */
  race?: {
    eventId: string;
    distanceId: string;
    /**
     * The edition this race ran — how a picture tagged to it finds this row.
     * A photo carries an edition and no distance, which is why the pictures
     * land on only one of an edition's rows; see `attachMediaToRaces`.
     */
    editionId?: number;
    /** Everyone who logged it, by name. Never empty on a race row. */
    runners: ClubRunner[];
  };
  /** The race's pictures. Only ever on a race row, and only on the first of an edition's. */
  media?: RaceMedia;
  /** A month of pictures of no race. A row that has this has nothing else. */
  month?: MediaMonth;
  /**
   * A standalone article row carries exactly one. A race row carries the
   * write-ups its runners published — none, one, or several.
   */
  posts: ClubPost[];
};

/**
 * Where the next page starts.
 *
 * Carries the sort key, not just an offset. An offset shifts by one the
 * moment a member publishes while somebody is scrolling, which silently
 * repeats or skips a row; carrying `year`/`day`/`key` lets the server find
 * its place again with the same comparator the list is sorted by, and fall
 * back to "the first row that sorts after this one" when the row itself is
 * gone. The same shape, and the same reason, as `WallCursor` in
 * `gallery-index.ts`.
 */
export type ClubCursor = {
  year: number;
  /** The comparator's field, so a cursor can be placed by the same rule. */
  sortDay?: string;
  key: string;
};

export type ClubTimelinePage = {
  rows: ClubTimelineRow[];
  /** `null` means there is nothing more. */
  nextCursor: ClubCursor | null;
};

/**
 * How many rows the route and the first server render each hand out.
 *
 * Ten, not sixty like the photo wall: a row here is a card about 140px tall,
 * so ten is already two screenfuls, and the sentinel's 800px prefetch margin
 * has the next page in hand well before the reader reaches it. A larger page
 * would only make the first render heavier for no visible gain.
 */
export const CLUB_PAGE_SIZE = 10;

function day(value: string | null | undefined): string | undefined {
  return value ? value.slice(0, 10) : undefined;
}

/**
 * Newest first, and total — by `sortDay`, not by `day`.
 *
 * A row with neither sorts to the bottom of its year rather than the top: an
 * event nobody has ever recorded a date for is "some time in 2024", and
 * putting it in January would be a claim the data does not make. `key` breaks
 * the remaining ties so the order never changes between two renders, which is
 * what the cursor above depends on.
 */
export function clubRowOrder(
  a: Pick<ClubTimelineRow, "key" | "sortDay" | "year">,
  b: Pick<ClubTimelineRow, "key" | "sortDay" | "year">,
): number {
  if (a.year !== b.year) return b.year - a.year;
  if (a.sortDay && b.sortDay && a.sortDay !== b.sortDay) {
    return a.sortDay < b.sortDay ? 1 : -1;
  }
  if (a.sortDay && !b.sortDay) return -1;
  if (!a.sortDay && b.sortDay) return 1;
  return a.key.localeCompare(b.key);
}

/** One row per (event, distance, year). */
function raceRowKey(record: SiteRaceRecord): string {
  return `race-${record.eventId}|${record.distanceId}|${record.year}`;
}

export function buildClubTimeline({
  editionFacts = new Map(),
  media = [],
  posts,
  races,
}: {
  /** Keyed by race-record id — the caller has already resolved the edition. */
  editionFacts?: Map<number, RaceEditionFacts>;
  /** Every public picture, already dated by `resolveMediaDay`. */
  media?: TimelineMedia[];
  posts: { author?: ClubRunner; post: SitePost }[];
  races: { record: SiteRaceRecord; runner: ClubRunner }[];
}): ClubTimelineRow[] {
  const rows = new Map<string, ClubTimelineRow>();
  /** Which row a given race *record* landed in, so its report can find it. */
  const rowKeyByRecordId = new Map<number, string>();

  for (const { record, runner } of races) {
    const key = raceRowKey(record);
    rowKeyByRecordId.set(record.id, key);

    const facts = editionFacts.get(record.id);
    const existing = rows.get(key);
    if (existing?.race) {
      // Same event, same distance, same year — so the day and place are the
      // same edition's. Filled in from whichever record resolved one, because
      // an older record may have no `edition` while a newer one does.
      if (!existing.day && facts?.startDate) existing.day = facts.startDate;
      if (!existing.sortDay) existing.sortDay = sortDayFor(record.year, facts);
      if (existing.race.editionId === undefined) existing.race.editionId = facts?.editionId;
      if (!existing.location && facts?.location) existing.location = facts.location;
      if (!existing.race.runners.some((r) => r.slug === runner.slug)) {
        existing.race.runners.push(runner);
      }
      continue;
    }

    rows.set(key, {
      key,
      year: record.year,
      day: facts?.startDate,
      sortDay: sortDayFor(record.year, facts),
      location: facts?.location,
      race: {
        eventId: record.eventId,
        distanceId: record.distanceId,
        editionId: facts?.editionId,
        runners: [runner],
      },
      posts: [],
    });
  }

  for (const { author, post } of posts) {
    const postDay = day(post.date);
    const entry: ClubPost = {
      id: post.id,
      title: post.title,
      description: post.description || undefined,
      slug: post.slug,
      day: postDay,
      image: post.image,
      author,
    };

    // A race report joins its race's row, under the race's own year and day —
    // the day being described, not the day it was published. See
    // `timeline.ts` for why that is one row and not two.
    const rowKey = post.race ? rowKeyByRecordId.get(post.race.id) : undefined;
    const row = rowKey ? rows.get(rowKey) : undefined;
    if (row) {
      row.posts.push(entry);
      continue;
    }

    // A post with no date cannot be placed on a timeline at all. Payload
    // fills `publishedAt` or `createdAt` on every row, so this is defensive —
    // but filing a whole article under year `NaN` is worse than dropping it.
    if (!postDay) continue;

    rows.set(`post-${post.id}`, {
      key: `post-${post.id}`,
      year: Number(postDay.slice(0, 4)),
      day: postDay,
      sortDay: postDay,
      posts: [entry],
    });
  }

  const list = [...rows.values()];
  for (const row of list) {
    row.race?.runners.sort((a, b) => a.name.localeCompare(b.name));
    row.posts.sort((a, b) => (a.day && b.day && a.day !== b.day ? (a.day < b.day ? 1 : -1) : a.id - b.id));
  }

  // Pictures of a race the rail actually draws go onto that race; everything
  // else becomes a month of its own. `splitMediaByRace` decides which is
  // which — see its header for why a picture of an unlogged race stays loose.
  const drawn = new Set<number>();
  for (const row of list) {
    if (row.race?.editionId !== undefined) drawn.add(row.race.editionId);
  }
  const { byEdition, loose } = splitMediaByRace(media, drawn);

  for (const month of groupMediaByMonth(loose)) {
    list.push({
      key: `month-${month.month}`,
      year: month.year,
      day: month.day,
      sortDay: month.day,
      month,
      posts: [],
    });
  }

  const ordered = list.sort(clubRowOrder);
  attachMediaToRaces(ordered, byEdition);
  return ordered;
}

/**
 * Hang each edition's pictures on ONE row.
 *
 * An edition with two distances is two rows — the badge is (event, distance,
 * year), so folding them would make it lie. A picture, though, is tagged to
 * the edition and knows nothing about distance, so both rows have an equal
 * claim on it. Drawing the same strip twice on one day reads as two different
 * sets of photographs; drawing it on the first row and linking from the rest
 * would be a second thing to explain. So: the first row of that edition in the
 * rail's own order gets them, and the rest are unchanged.
 *
 * Runs after the sort, because "first" means first as rendered.
 */
function attachMediaToRaces(
  ordered: ClubTimelineRow[],
  byEdition: Map<number, RaceMedia>,
): void {
  const used = new Set<number>();
  for (const row of ordered) {
    const id = row.race?.editionId;
    if (id === undefined || used.has(id)) continue;
    const media = byEdition.get(id);
    if (!media) continue;
    row.media = media;
    used.add(id);
  }
}

/**
 * One page of an already-ordered list.
 *
 * The fallback branch is the point: when the cursor's own row is gone — a
 * member unpublished an article between two scroll fetches — this returns the
 * first row that sorts *after* it rather than starting again from the top,
 * which is what an index-based cursor would silently do.
 */
export function clubTimelinePage(
  rows: ClubTimelineRow[],
  cursor: ClubCursor | null,
  pageSize: number = CLUB_PAGE_SIZE,
): ClubTimelinePage {
  let start = 0;
  if (cursor) {
    const at = rows.findIndex((row) => row.key === cursor.key);
    if (at >= 0) {
      start = at + 1;
    } else {
      const after = rows.findIndex((row) => clubRowOrder(row, cursor) > 0);
      start = after >= 0 ? after : rows.length;
    }
  }

  const page = rows.slice(start, start + pageSize);
  const last = page[page.length - 1];
  const nextCursor: ClubCursor | null =
    last && start + pageSize < rows.length
      ? { year: last.year, sortDay: last.sortDay, key: last.key }
      : null;

  return { rows: page, nextCursor };
}

/** How many races and articles a page of rows is showing. */
export function countClubRows(rows: ClubTimelineRow[]): {
  postCount: number;
  raceCount: number;
} {
  let postCount = 0;
  let raceCount = 0;
  for (const row of rows) {
    // A grouped race counts once per runner, not once per row: five members
    // at one race is five finishes, and a club's own total must say so.
    if (row.race) raceCount += row.race.runners.length;
    postCount += row.posts.length;
  }
  return { postCount, raceCount };
}

/**
 * Just the catalogue entries a page of rows actually refers to.
 *
 * A page of twenty rows touches a handful of events; the catalogue is around
 * a hundred with four hundred categories between them. This travels with each
 * page so the browser can resolve badges and race names with the same pure
 * functions the server uses (`resolveBadge`, `catalogueMap`) instead of
 * either shipping the whole catalogue once or having two different renderers.
 *
 * The distances are narrowed too, for the same reason: a row needs the label
 * of the one distance it draws, not the event's other eleven.
 *
 * An event the catalogue no longer has is simply absent, and `badge-source.ts`
 * falls back to the id — that is its documented contract, and a club rail
 * must not go blank because a race was renamed.
 */
export function catalogueForRows(
  rows: ClubTimelineRow[],
  events: CatalogueEvent[],
): CatalogueEvent[] {
  const wanted = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.race) continue;
    const distances = wanted.get(row.race.eventId) ?? new Set<string>();
    distances.add(row.race.distanceId);
    wanted.set(row.race.eventId, distances);
  }

  const picked: CatalogueEvent[] = [];
  for (const event of events) {
    const distances = wanted.get(event.id);
    if (!distances) continue;
    picked.push({
      ...event,
      distances: event.distances.filter((distance) => distances.has(distance.id)),
    });
  }
  return picked;
}
