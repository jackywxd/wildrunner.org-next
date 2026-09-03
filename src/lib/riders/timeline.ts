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

/** What the edition behind a race record adds to it: a real day, a place. */
export type RaceEditionFacts = {
  /** "YYYY-MM-DD". Absent when the edition row has no start date. */
  startDate?: string;
  location?: string;
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
  /** "YYYY-MM-DD", or absent when only the year is known. */
  day?: string;
  location?: string;
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
 * Newest first, within a year.
 *
 * A dateless row sorts to the bottom of its year rather than the top: a race
 * whose edition has no start date is "some time in 2024", and guessing it
 * happened in January would be a claim the data does not make. Ties break on
 * `key` so the order is total — two races on one day must not swap places
 * between renders, which is what makes the rendered HTML stable enough to
 * assert on.
 */
function byDayDescending(a: RiderTimelineEntry, b: RiderTimelineEntry): number {
  if (a.day && b.day && a.day !== b.day) return a.day < b.day ? 1 : -1;
  if (a.day && !b.day) return -1;
  if (!a.day && b.day) return 1;
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
  posts,
  races,
}: {
  editionFacts?: Map<number, RaceEditionFacts>;
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
      location: facts?.location,
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

    push(yearOf(postDay), { key: `post-${post.id}`, day: postDay, post });
  }

  return [...byYear.entries()]
    .map(([year, list]) => ({ year, entries: list.sort(byDayDescending) }))
    .sort((a, b) => b.year - a.year);
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
