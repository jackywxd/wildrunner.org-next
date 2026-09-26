/**
 * 成員對照 (/riders/compare?with=a,b,c): two or three members' timelines side
 * by side, zipped together wherever they ran the same race.
 *
 * THE SAME ROWS AS THE CLUB RAIL, NARROWED. A compare page is the braided rail
 * drawn for a few people instead of the whole club — so it filters the club's
 * `ClubTimelineRow`s rather than building its own, and a race looks the same
 * here as it does there. What narrowing means is decided once, below.
 *
 * THE ADDRESS IS THE STATE, and it is meant to be found: `with` lists the
 * members in the order they were picked, which is the order their lanes are
 * drawn in, and the canonical form sorts them so that "a,b" and "b,a" are one
 * page to a search engine rather than two.
 *
 * PURE, like the rest of `src/lib/riders`.
 */

import { LANE_COLORS, rowMeetings, type ClubLanes, type LaneMember } from "@/lib/riders/club-lanes";
import type { ClubTimelineRow } from "@/lib/riders/club-timeline";

/** Two is a comparison; four lanes of teeth are no longer readable as a zip. */
export const COMPARE_LIMIT = 3;

/**
 * The members a `with` parameter names, in its order: known slugs only, each
 * once, at most `COMPARE_LIMIT`. Anything else in it is dropped, not an error —
 * an old link to a member who has since left still opens on the others.
 */
export function parseCompare(param: unknown, known: Set<string>): string[] {
  if (typeof param !== "string") return [];
  const slugs: string[] = [];
  for (const slug of param.split(",").map((part) => part.trim())) {
    if (known.has(slug) && !slugs.includes(slug)) slugs.push(slug);
    if (slugs.length === COMPARE_LIMIT) break;
  }
  return slugs;
}

/** The page for these members, lanes in this order. */
export function compareHref(slugs: string[]): string {
  return slugs.length ? `/riders/compare?with=${slugs.join(",")}` : "/riders/compare";
}

/** The one address search engines should know a set of members by. */
export function compareCanonical(slugs: string[]): string {
  return slugs.length >= 2 ? compareHref([...slugs].sort()) : "/riders/compare";
}

/**
 * The club's rows, as these members lived them.
 *
 * - A race keeps only these members among its runners, and is dropped if none
 *   of them ran it. Somebody else at the same race is not part of this
 *   comparison, and leaving them in would make the rail draw a meeting
 *   between one selected member and a stranger.
 * - A race report stays on its race only if one of these members wrote it.
 * - An article is kept if one of these members wrote it.
 * - A month of pictures is nobody's in particular, and is dropped.
 */
export function compareRows(rows: ClubTimelineRow[], slugs: string[]): ClubTimelineRow[] {
  const chosen = new Set(slugs);
  const mine = (slug: string | undefined) => slug !== undefined && chosen.has(slug);
  const out: ClubTimelineRow[] = [];

  for (const row of rows) {
    if (row.month) continue;
    const posts = row.posts.filter((post) => mine(post.author?.slug));
    if (row.race) {
      const runners = row.race.runners.filter((runner) => mine(runner.slug));
      if (runners.length === 0) continue;
      out.push({ ...row, posts, race: { ...row.race, runners } });
    } else if (posts.length) {
      out.push({ ...row, posts });
    }
  }
  return out;
}

export type PairCount = { count: number; slugs: string[] };

/**
 * How many races each pair ran together, and — for three — all of them.
 *
 * Counted per meeting, as the rail draws them: one edition over two distances
 * is one weekend together, not two.
 */
export function pairCounts(rows: ClubTimelineRow[], slugs: string[]): PairCount[] {
  const groups: string[][] = [];
  for (let i = 0; i < slugs.length; i += 1) {
    for (let j = i + 1; j < slugs.length; j += 1) groups.push([slugs[i], slugs[j]]);
  }
  if (slugs.length > 2) groups.push([...slugs]);

  const counts = groups.map((group) => ({ count: 0, slugs: group }));
  for (const meeting of rowMeetings(rows).values()) {
    if (!meeting.first) continue;
    for (const entry of counts) {
      if (entry.slugs.every((slug) => meeting.runners.includes(slug))) entry.count += 1;
    }
  }
  return counts;
}

/**
 * Every pair of members who have met at least once, each sorted — the compare
 * pages worth listing in the sitemap. A pair who never met has a page, but
 * nothing on it is about the two of them.
 */
export function meetingPairs(rows: ClubTimelineRow[]): string[][] {
  const pairs = new Map<string, string[]>();
  for (const meeting of rowMeetings(rows).values()) {
    if (!meeting.first) continue;
    const runners = [...meeting.runners].sort();
    for (let i = 0; i < runners.length; i += 1) {
      for (let j = i + 1; j < runners.length; j += 1) {
        pairs.set(`${runners[i]},${runners[j]}`, [runners[i], runners[j]]);
      }
    }
  }
  return [...pairs.values()].sort((a, b) => a.join(",").localeCompare(b.join(",")));
}

/**
 * A colour per compared member: their own lane's colour on the club rail when
 * they have one, so a member looks the same on every page; otherwise the first
 * colour nobody else here is using. Never grey — every lane here is somebody.
 */
export function compareColors(club: ClubLanes, members: LaneMember[]): string[] {
  const own = members.map((member) => {
    const lane = club.lanes.findIndex((lane) => lane.slug === member.slug);
    return lane >= 0 ? LANE_COLORS[lane] : undefined;
  });
  const free = LANE_COLORS.filter((color) => !own.includes(color));
  return own.map((color) => color ?? free.shift() ?? LANE_COLORS[0]);
}
