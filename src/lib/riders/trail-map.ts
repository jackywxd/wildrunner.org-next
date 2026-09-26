/**
 * The homepage's 交會地圖: a few members' last few years as trails across a
 * map, drawn left to right, pausing wherever two or more of them ran the same
 * race.
 *
 * TIME IS THE X AXIS, FOR EVERY TRAIL AT ONCE. All the runners on the map move
 * together — at any moment they are all at the same date — so two trails that
 * cross are two runners in the same place at the same time. That is exactly
 * what a meeting looks like, and a crossing that is *not* a meeting would be a
 * lie the animation tells. So the layout's one hard rule is that trails touch
 * only at meetings:
 *
 * - Members sit in horizontal slots, top to bottom, and keep their slot except
 *   at a meeting of their own.
 * - A meeting can only be drawn if its runners sit in adjacent slots when it
 *   happens; they converge on their mean height, and may leave in any order
 *   among themselves — that reordering is the only way slots ever change.
 * - Which starting order, and which exits, is a search: `order` below tries
 *   them and keeps the one that draws the most meetings. A meeting no order
 *   can reach is left off the map (its runners still get a dot there, as for
 *   any race), rather than drawn through somebody else's trail.
 *
 * WHO IS ON IT is the first few of the club's lanes (`assignLanes`), so a
 * member's trail here is the colour of their lane on the braided rail.
 *
 * PURE: no clock (`thisYear` is a parameter), no DOM. The component samples
 * `y(x)` from what this returns and moves the dots; everything that decides
 * where anything goes is here and checked in `e2e/unit/trail-map.spec.ts`.
 */

import { rowMeetings, type ClubLanes } from "@/lib/riders/club-lanes";
import type { ClubTimelineRow } from "@/lib/riders/club-timeline";

/** Drawing units. The SVG's viewBox is `WIDTH` wide and scales to its box. */
export const TRAIL = {
  /** Horizontal distance over which a trail bends into or out of a meeting. */
  approach: 30,
  /** Closest two meetings may sit, so their bends never overlap. */
  minGap: 44,
  /** Vertical distance between two slots. */
  slot: 38,
  top: 28,
  width: 720,
  x0: 44,
  x1: 696,
} as const;

/** The most meetings drawn: the newest ones. Beyond this the map is a tangle. */
export const MAX_MEETINGS = 6;

export type TrailMember = {
  /** Index into the club's lanes — which colour this trail is. */
  lane: number;
  name: string;
  slug: string;
  /** The trail as an SVG path, in drawing units. */
  path: string;
  /** The same trail sampled left to right, for `yAt`. */
  points: [number, number][];
};

export type TrailMeeting = {
  eventId: string;
  /** Where the timeline shows this race, for a link straight to it. */
  rowKey: string;
  /** The members on this map who were there, top to bottom as they arrive. */
  runners: string[];
  x: number;
  y: number;
  year: number;
};

export type TrailMapData = {
  height: number;
  members: TrailMember[];
  meetings: TrailMeeting[];
  /** A member's race that is not a drawn meeting. */
  nodes: { lane: number; x: number; y: number }[];
  /** Where each year starts and ends along the axis. */
  years: { from: number; to: number; year: number }[];
  axis: number;
};

/**
 * How far through its year a day is, from "YYYY-MM-DD" alone.
 *
 * Never a `Date` (see `src/lib/races/calendar.ts`): a stored day parsed as UTC
 * midnight lands on the previous day west of Greenwich. Months are treated as
 * equal — this places a dot on a map, it does not count days.
 */
export function yearFraction(day: string | undefined): number {
  const match = day?.match(/^\d{4}-(\d{2})-(\d{2})/);
  if (!match) return 0.5;
  return ((Number(match[1]) - 1) * 31 + (Number(match[2]) - 1)) / 372;
}

type Candidate = { eventId: string; rowKey: string; runners: string[]; x: number; year: number };

/** Every permutation of a short list — slots and meetings are both at most a handful. */
function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
  );
}

/**
 * The starting order and the order after each meeting that draw the most
 * meetings. `null` in `after` marks a meeting that could not be drawn.
 *
 * Memoised on (meeting, current order): with at most five members and six
 * meetings that is a few hundred states, however many exits each allows.
 */
export function order(
  slugs: string[],
  meetings: { runners: string[] }[],
): { after: (string[] | null)[]; drawn: number; start: string[] } {
  type Best = { after: (string[] | null)[]; drawn: number };
  const memo = new Map<string, Best>();

  const solve = (index: number, current: string[]): Best => {
    if (index === meetings.length) return { after: [], drawn: 0 };
    const key = `${index}:${current.join(",")}`;
    const cached = memo.get(key);
    if (cached) return cached;

    const runners = meetings[index].runners;
    const slots = runners.map((slug) => current.indexOf(slug)).sort((a, b) => a - b);
    const adjacent = slots[slots.length - 1] - slots[0] === slots.length - 1;

    let best: Best;
    if (!adjacent) {
      const rest = solve(index + 1, current);
      best = { after: [null, ...rest.after], drawn: rest.drawn };
    } else {
      best = { after: [], drawn: -1 };
      for (const exit of permutations(runners)) {
        const next = [...current];
        exit.forEach((slug, i) => {
          next[slots[0] + i] = slug;
        });
        const rest = solve(index + 1, next);
        if (rest.drawn + 1 > best.drawn) {
          best = { after: [next, ...rest.after], drawn: rest.drawn + 1 };
        }
      }
    }
    memo.set(key, best);
    return best;
  };

  let result = { after: [] as (string[] | null)[], drawn: -1, start: slugs };
  // The club's own lane order is tried first, so when it works it is kept —
  // a reader who knows the braided rail sees the same people in the same
  // order here.
  for (const start of permutations(slugs)) {
    const best = solve(0, start);
    if (best.drawn > result.drawn) result = { ...best, start };
    if (result.drawn === meetings.length) break;
  }
  return result;
}

/** A trail through `waypoints`, level at each one, as a path and a polyline. */
function trail(waypoints: [number, number][]): { path: string; points: [number, number][] } {
  let path = `M${waypoints[0][0]} ${waypoints[0][1]}`;
  const points: [number, number][] = [waypoints[0]];
  for (let i = 1; i < waypoints.length; i += 1) {
    const [ax, ay] = waypoints[i - 1];
    const [bx, by] = waypoints[i];
    const mx = (ax + bx) / 2;
    path += ` C${mx} ${ay} ${mx} ${by} ${bx} ${by}`;
    for (let step = 1; step <= 12; step += 1) {
      const t = step / 12;
      const u = 1 - t;
      points.push([
        u * u * u * ax + 3 * u * u * t * mx + 3 * u * t * t * mx + t * t * t * bx,
        u * u * u * ay + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * by,
      ]);
    }
  }
  return { path, points };
}

/** Height of a trail at `x`. Trails only ever move rightwards, so this is a function. */
export function yAt(points: [number, number][], x: number): number {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i += 1) {
    const [bx, by] = points[i];
    if (x <= bx) {
      const [ax, ay] = points[i - 1];
      return bx === ax ? by : ay + ((by - ay) * (x - ax)) / (bx - ax);
    }
  }
  return points[points.length - 1][1];
}

export function buildTrailMap({
  club,
  members: size = 4,
  rows,
  span = 4,
  thisYear,
}: {
  club: ClubLanes;
  members?: number;
  rows: ClubTimelineRow[];
  span?: number;
  thisYear: number;
}): TrailMapData | null {
  const chosen = club.lanes.slice(0, size);
  if (chosen.length < 2) return null;
  const slugs = chosen.map((member) => member.slug);
  const onMap = new Set(slugs);

  const firstYear = thisYear - span + 1;
  const xOf = (year: number, day: string | undefined) =>
    TRAIL.x0 + ((year - firstYear + yearFraction(day)) / span) * (TRAIL.x1 - TRAIL.x0);
  const inRange = (year: number) => year >= firstYear && year <= thisYear;

  // Meetings among the people on this map, oldest first, newest kept.
  const meetingOf = rowMeetings(rows);
  let candidates: Candidate[] = [];
  for (const row of rows) {
    const meeting = meetingOf.get(row.key);
    if (!meeting?.first || !row.race || !inRange(row.year)) continue;
    const runners = meeting.runners.filter((slug) => onMap.has(slug));
    if (runners.length < 2) continue;
    candidates.push({
      eventId: row.race.eventId,
      rowKey: row.key,
      runners,
      x: xOf(row.year, row.sortDay ?? row.day),
      year: row.year,
    });
  }
  candidates.sort((a, b) => a.x - b.x || a.rowKey.localeCompare(b.rowKey));
  candidates = candidates.slice(-MAX_MEETINGS);

  // Push meetings apart so no two sets of bends overlap, keeping them in order
  // and inside the axis.
  for (let i = 1; i < candidates.length; i += 1) {
    candidates[i].x = Math.max(candidates[i].x, candidates[i - 1].x + TRAIL.minGap);
  }
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const limit = i === candidates.length - 1 ? TRAIL.x1 - TRAIL.approach : candidates[i + 1].x - TRAIL.minGap;
    candidates[i].x = Math.min(candidates[i].x, limit);
  }

  const { after, start } = order(slugs, candidates);
  const slotY = (slot: number) => TRAIL.top + slot * TRAIL.slot;

  const meetings: TrailMeeting[] = [];
  const drawnBy = new Map<string, Set<string>>();
  const waypoints = new Map<string, [number, number][]>(
    start.map((slug, slot) => [slug, [[TRAIL.x0, slotY(slot)]]]),
  );
  let current = start;

  candidates.forEach((candidate, index) => {
    const next = after[index];
    if (!next) return;
    const arriving = [...candidate.runners].sort((a, b) => current.indexOf(a) - current.indexOf(b));
    const y = arriving.reduce((sum, slug) => sum + slotY(current.indexOf(slug)), 0) / arriving.length;
    meetings.push({ ...candidate, runners: arriving, y });
    drawnBy.set(candidate.rowKey, new Set(arriving));

    for (const slug of arriving) {
      const points = waypoints.get(slug)!;
      const [lastX, lastY] = points[points.length - 1];
      const ahead = candidates
        .slice(index + 1)
        .find((later, laterIndex) => after[index + 1 + laterIndex] && later.runners.includes(slug));
      const approach = Math.min(TRAIL.approach, (candidate.x - lastX) / 2);
      const leave = Math.min(TRAIL.approach, ((ahead?.x ?? TRAIL.x1) - candidate.x) / 2);
      if (candidate.x - approach > lastX) points.push([candidate.x - approach, lastY]);
      points.push([candidate.x, y]);
      points.push([candidate.x + leave, slotY(next.indexOf(slug))]);
    }
    current = next;
  });

  const members: TrailMember[] = chosen.map((member, lane) => {
    const points = waypoints.get(member.slug)!;
    const last = points[points.length - 1];
    if (last[0] < TRAIL.x1) points.push([TRAIL.x1, last[1]]);
    return { ...member, lane, ...trail(points) };
  });
  const bySlug = new Map(members.map((member) => [member.slug, member]));

  // Everyone's other races in range, on their own trail. A later distance row
  // of a drawn meeting belongs to that meeting — its runners are already there
  // and must not get a second dot beside it.
  const nodes: TrailMapData["nodes"] = [];
  let runStart = "";
  for (const row of rows) {
    const meeting = meetingOf.get(row.key);
    if (meeting?.first) runStart = row.key;
    if (!row.race || !inRange(row.year)) continue;
    const drawn = meeting ? drawnBy.get(runStart) : undefined;
    for (const runner of row.race.runners) {
      const member = bySlug.get(runner.slug);
      if (!member || drawn?.has(runner.slug)) continue;
      const x = xOf(row.year, row.sortDay ?? row.day);
      nodes.push({ lane: member.lane, x, y: yAt(member.points, x) });
    }
  }

  const years = Array.from({ length: span }, (_, i) => ({
    from: TRAIL.x0 + (i / span) * (TRAIL.x1 - TRAIL.x0),
    to: TRAIL.x0 + ((i + 1) / span) * (TRAIL.x1 - TRAIL.x0),
    year: firstYear + i,
  }));
  const axis = slotY(chosen.length - 1) + TRAIL.slot;

  return { axis, height: axis + 34, members, meetings, nodes, years };
}


/** Seconds the runners take to cross the whole map, not counting pauses. */
const CROSSING = 9;
/** Seconds everyone stands still at each meeting. */
export const PAUSE = 0.9;

/**
 * Where the runners are at a moment in the loop.
 *
 * One clock for every trail — that is what makes a meeting a meeting — moving
 * at a constant speed and stopping for `PAUSE` at each drawn meeting. Returns
 * when each meeting is reached, when the right edge is, and `xAt(t)`.
 */
export function trailClock(meetings: Pick<TrailMeeting, "x">[]) {
  const speed = (TRAIL.x1 - TRAIL.x0) / CROSSING;
  const arrive = meetings.map((meeting, i) => (meeting.x - TRAIL.x0) / speed + i * PAUSE);
  const end = CROSSING + meetings.length * PAUSE;

  const xAt = (t: number) => {
    let x = TRAIL.x0 + t * speed;
    for (let i = 0; i < meetings.length; i += 1) {
      if (t < arrive[i]) break;
      x = t < arrive[i] + PAUSE ? meetings[i].x : meetings[i].x + (t - arrive[i] - PAUSE) * speed;
    }
    return Math.min(x, TRAIL.x1);
  };

  return { arrive, end, xAt };
}

/**
 * An id for a timeline row that is safe in a URL fragment. Row keys carry `|`
 * (`race-kodiak|50k|2022`), which a fragment would have to escape.
 */
export function rowAnchor(key: string): string {
  return `row-${key.replace(/[^A-Za-z0-9_-]+/g, "-")}`;
}
