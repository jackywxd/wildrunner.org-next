/**
 * A member's history as one chronological list: the races they ran and the
 * articles they wrote, merged and grouped by year.
 *
 * PURE, AND DELIBERATELY SO. Everything here is a function of three plain
 * arrays, so the ordering and the merge can be checked without a server, a
 * database or a browser — see `e2e/unit/rider-timeline.spec.ts`. The queries
 * that produce those arrays live in `content.ts`; nothing in this file knows
 * they exist.
 *
 * DATES ARE "YYYY-MM-DD" STRINGS, compared lexicographically, per the
 * convention `src/lib/races/calendar.ts` states at length: a `Date` built
 * from a stored UTC midnight lands on the previous day for anyone west of
 * Greenwich, so two visitors would see the same race under two different
 * days. Payload hands back full ISO timestamps; they are sliced once, here,
 * and never parsed back.
 */

import type { SitePost, SiteRaceRecord } from "@/lib/content-types";
import {
  groupMediaByMonth,
  splitMediaByRace,
  type MediaMonth,
  type RaceMedia,
  type TimelineMedia,
} from "@/lib/riders/timeline-albums";

/** What the edition behind a race record adds to it: a real day, a place. */
export type RaceEditionFacts = {
  /**
   * Which edition this is.
   *
   * Carried so a rail can match a *picture* to a race row: a photo is tagged
   * to an edition and has no race record, while a row is built from records.
   * Without this the two have no id in common.
   */
  editionId?: number;
  /** "YYYY-MM-DD". Absent when the edition row has no start date. */
  startDate?: string;
  location?: string;
  /**
   * "MM-DD" — when this event runs, taken from *another* year's edition.
   *
   * ORDERING ONLY. NEVER DISPLAYED, AND NEVER STORED. Past editions in this
   * database carry no `startDate` at all (the reviewed CSV covers the coming
   * two seasons; nobody has researched 2013), so without this every race a
   * member logged sorts to the bottom of its year in alphabetical order —
   * which is what "the timeline is not in race order" means in practice.
   *
   * A race runs at the same time of year, so placing a 2023 Hardrock where
   * Hardrock always is puts it in the right place among that year's rows.
   * That is an inference, and the reason it is allowed here and nowhere else
   * in this repo is that it decides a *position* and never becomes a fact on
   * screen: the card still says "2023 年". Filling it into `startDate` would
   * be inventing data, which `docs/race-data-sources.md` forbids at length.
   */
  typicalDay?: string;
};

/**
 * One row on the timeline.
 *
 * A race and an article are the same kind of thing here — a dated event in a
 * member's history — so they share one type rather than being a union the
 * renderer has to switch on. Both fields are optional and at least one is
 * always set:
 *
 *   race only          a race they ran and never wrote up
 *   post only          an ordinary article
 *   race AND post      a race report — ONE row, not two
 *
 * The third case is the reason this type is not a union. `posts.raceRecord`
 * points a report at the record it is about, so a member who logs a race and
 * then writes it up has two rows describing one day; showing both would make
 * the timeline read as though they ran it twice.
 */
export type RiderTimelineEntry = {
  /** Stable React key. Prefixed because record ids and post ids collide. */
  key: string;
  /** "YYYY-MM-DD", or absent when only the year is known. What is shown. */
  day?: string;
  /**
   * What the order is decided by: `day` when it is known, otherwise where
   * this event sits in a year (see `RaceEditionFacts.typicalDay`).
   *
   * Separate from `day` on purpose. Merging them would put an inferred date
   * on the card, and the card must keep saying "2023 年" — the position is a
   * best guess, the date would be a claim.
   */
  sortDay?: string;
  location?: string;
  /** The edition this race ran — how a picture tagged to it finds this row. */
  editionId?: number;
  /** The race's pictures. Only on a race entry. */
  media?: RaceMedia;
  /** A month of pictures of no race. An entry with this has nothing else. */
  month?: MediaMonth;
  post?: SitePost;
  race?: SiteRaceRecord;
};

export type RiderTimelineYear = {
  year: number;
  entries: RiderTimelineEntry[];
};

/**
 * The first ten characters of an ISO timestamp, or nothing.
 *
 * `undefined` rather than "" for an absent date, because an empty string
 * sorts *before* every real one and would quietly move a dateless row to the
 * top of its year.
 */
function day(value: string | null | undefined): string | undefined {
  return value ? value.slice(0, 10) : undefined;
}

/** The calendar year in a "YYYY-…" string, without constructing a `Date`. */
function yearOf(isoDay: string): number {
  return Number(isoDay.slice(0, 4));
}

/**
 * Where a race sits in its year, for ordering.
 *
 * The real date when there is one. Otherwise the event's own time of year,
 * projected onto this year — see `RaceEditionFacts.typicalDay` for why that
 * inference is allowed to decide a position and never a label. `undefined`
 * when neither is known, which sorts the row to the bottom of its year.
 */
export function sortDayFor(
  year: number,
  facts: { startDate?: string; typicalDay?: string } | undefined,
): string | undefined {
  if (facts?.startDate) return facts.startDate;
  if (facts?.typicalDay) return `${year}-${facts.typicalDay}`;
  return undefined;
}

/**
 * Newest first, within a year — by `sortDay`, not by `day`.
 *
 * A row with neither still sorts to the bottom of its year rather than the
 * top: an event nobody has ever recorded a date for is "some time in 2024",
 * and putting it in January would be a claim the data does not make. Ties
 * break on `key` so the order is total — two races on one day must not swap
 * places between renders, which is what makes the rendered HTML stable enough
 * to assert on.
 */
function byDayDescending(a: RiderTimelineEntry, b: RiderTimelineEntry): number {
  if (a.sortDay && b.sortDay && a.sortDay !== b.sortDay) {
    return a.sortDay < b.sortDay ? 1 : -1;
  }
  if (a.sortDay && !b.sortDay) return -1;
  if (!a.sortDay && b.sortDay) return 1;
  return a.key.localeCompare(b.key);
}

/**
 * Build the timeline.
 *
 * `editionFacts` is keyed by race-record id, not by edition id: the caller
 * has already resolved which edition each record points at, and a record
 * whose edition is missing (rows written before `populateRaceRecordRefs`
 * existed, or an edition since deleted) simply has no entry here and falls
 * back to its year. That fallback is the contract, the same way an
 * unresolvable event id still renders a badge — a profile must not break
 * because a reference went stale.
 *
 * A REPORT FOLLOWS ITS RACE, NOT ITS PUBLICATION DATE. A merged row is filed
 * under the race's year and the race's day, because that is the day being
 * described; a report published in January about a race run the previous
 * December belongs with the race. The article's own date is still carried on
 * `post` for the card to show.
 */
export function buildRiderTimeline({
  editionFacts = new Map(),
  media = [],
  posts,
  races,
}: {
  editionFacts?: Map<number, RaceEditionFacts>;
  /** This member's own pictures, already dated by `resolveMediaDay`. */
  media?: TimelineMedia[];
  posts: SitePost[];
  races: SiteRaceRecord[];
}): RiderTimelineYear[] {
  // Which report, if any, belongs to which record. A record can only be
  // claimed once: `posts.raceRecord` is one relationship per post, and two
  // posts naming the same record is not something the member-facing flow can
  // produce. If it ever happened, the last one wins and the other keeps its
  // own row — no post is dropped.
  const reportByRecordId = new Map<number, SitePost>();
  for (const post of posts) {
    if (post.race) reportByRecordId.set(post.race.id, post);
  }

  const byYear = new Map<number, RiderTimelineEntry[]>();
  const push = (year: number, entry: RiderTimelineEntry) => {
    const list = byYear.get(year) ?? [];
    list.push(entry);
    byYear.set(year, list);
  };

  for (const race of races) {
    const facts = editionFacts.get(race.id);
    push(race.year, {
      key: `race-${race.id}`,
      day: facts?.startDate,
      sortDay: sortDayFor(race.year, facts),
      location: facts?.location,
      editionId: facts?.editionId,
      post: reportByRecordId.get(race.id),
      race,
    });
  }

  for (const post of posts) {
    // Already rendered as part of its race's row.
    if (post.race && reportByRecordId.get(post.race.id) === post) continue;

    const postDay = day(post.date);
    // A post with no date at all cannot be placed on a timeline. Payload
    // fills `publishedAt` or `createdAt` on every row, so this is defensive
    // rather than expected — but dropping it silently is better than filing
    // the whole article under year `NaN`.
    if (!postDay) continue;

    push(yearOf(postDay), {
      key: `post-${post.id}`,
      day: postDay,
      sortDay: postDay,
      post,
    });
  }

  // The same split the club rail makes, for the same reasons: pictures of a
  // race this member logged go onto that race, everything else becomes a month.
  const drawn = new Set<number>();
  for (const list of byYear.values()) {
    for (const entry of list) {
      if (entry.editionId !== undefined) drawn.add(entry.editionId);
    }
  }
  const { byEdition, loose } = splitMediaByRace(media, drawn);

  for (const month of groupMediaByMonth(loose)) {
    push(month.year, {
      key: `month-${month.month}`,
      day: month.day,
      sortDay: month.day,
      month,
    });
  }

  const years = [...byYear.entries()]
    .map(([year, list]) => ({ year, entries: list.sort(byDayDescending) }))
    .sort((a, b) => b.year - a.year);

  // After the sort, because "the first entry of that edition" means first as
  // rendered — see `attachMediaToRaces` in club-timeline.ts for why only one
  // of an edition's entries gets them.
  const used = new Set<number>();
  for (const { entries } of years) {
    for (const entry of entries) {
      const id = entry.editionId;
      if (id === undefined || used.has(id)) continue;
      const found = byEdition.get(id);
      if (!found) continue;
      entry.media = found;
      used.add(id);
    }
  }
  return years;
}

/** The one-line summary above the timeline: how much there is, and since when. */
export function summariseTimeline(years: RiderTimelineYear[]): {
  postCount: number;
  raceCount: number;
  firstYear?: number;
  lastYear?: number;
} {
  let postCount = 0;
  let raceCount = 0;
  for (const { entries } of years) {
    for (const entry of entries) {
      // A race report counts once as a race and once as an article: it is
      // both, and a member who wrote up every race they ran would otherwise
      // read as having written nothing.
      if (entry.race) raceCount += 1;
      if (entry.post) postCount += 1;
    }
  }
  return {
    postCount,
    raceCount,
    firstYear: years.at(-1)?.year,
    lastYear: years[0]?.year,
  };
}

/**
 * "2026-08-28" → "8月28日".
 *
 * String surgery, not `toLocaleDateString`: the day has already been decided
 * (see this file's header) and handing it to `Date` would re-open the
 * timezone question the slice exists to close. `formatDate` in `lib/utils.ts`
 * does construct a `Date`, which is why it is not reused here.
 */
export function formatMonthDay(isoDay: string): string {
  const [, month, day] = isoDay.split("-");
  return `${Number(month)}月${Number(day)}日`;
}
