/**
 * The braided view of 野馬營穿越時光: one lane per member, and the lanes of
 * everyone at the same race pulled together where that race sits on the rail.
 *
 * AN OPT-IN VIEW OVER THE SAME ROWS. `/riders/timeline` still draws its single
 * rail by default; `?view=braid` draws these lanes beside the very same
 * `ClubTimelineRow`s, paged by the very same cursor. Nothing here changes what
 * a row is — only how the space to the left of it is drawn.
 *
 * A MEETING IS (EVENT, YEAR), NOT (EVENT, DISTANCE, YEAR). The rows stay split
 * by distance, because a row draws one badge and the badge names a distance.
 * But two members who ran the 100K and the 50K of one edition were still at the
 * same race on the same weekend, and the lanes are there to say exactly that.
 * So a meeting is a *run of adjacent rows* sharing an event and a year: the
 * distances of one edition share a day, so they already sort next to each
 * other (`clubRowOrder`), and the bundle spans all of them. A run with fewer
 * than two people in it is not a meeting.
 *
 * LANES ARE CHOSEN OVER THE WHOLE CLUB, ON THE SERVER. Which members get a lane
 * of their own is decided once from every row, not from the page on screen —
 * otherwise loading page two could reshuffle the colours of page one. The rest
 * share a single grey "other" lane. Meetings, by contrast, are recomputed in
 * the browser from whatever rows are loaded: a run cut in two by a page
 * boundary simply completes when the next page arrives.
 *
 * PURE, like `club-timeline.ts`: geometry is computed here in pixels so it can
 * be checked without a browser, and the component only draws what it is given.
 */

import type { ClubTimelineRow } from "@/lib/riders/club-timeline";

/**
 * How many members get a lane of their own. Six fit beside a card on a wide
 * screen; on a phone every lane costs width the card needs, so four.
 */
export const LANE_LIMITS = { narrow: 4, wide: 6 } as const;

export type LaneMember = { name: string; slug: string };

export type ClubLanes = {
  /** Members with a lane of their own, in lane order. At most `LANE_LIMITS.wide`. */
  lanes: LaneMember[];
  /** Whether anyone in the club is left without one — i.e. whether the grey lane exists. */
  others: boolean;
};

export type RowMeeting = {
  /** Everyone at this race, across every distance row of the run, by slug. */
  runners: string[];
  /** The run starts here: the lanes bend in above this row's card. */
  first: boolean;
  /** The run ends here: the lanes bend back out below it. */
  last: boolean;
};

function eventYear(row: ClubTimelineRow): string | undefined {
  return row.race ? `${row.race.eventId}|${row.year}` : undefined;
}

/**
 * Every row that is part of a meeting, keyed by row key.
 *
 * Only *adjacent* rows join a run. Two rows of one event and year that some
 * other row sorts between — possible only when their editions resolved
 * different days — are left apart, because a bundle held across an unrelated
 * card would say those people were together at that card too.
 */
export function rowMeetings(rows: ClubTimelineRow[]): Map<string, RowMeeting> {
  const meetings = new Map<string, RowMeeting>();
  let start = 0;
  while (start < rows.length) {
    const key = eventYear(rows[start]);
    if (!key) {
      start += 1;
      continue;
    }

    let end = start;
    const runners = new Set<string>();
    while (end < rows.length && eventYear(rows[end]) === key) {
      for (const runner of rows[end].race?.runners ?? []) runners.add(runner.slug);
      end += 1;
    }

    if (runners.size >= 2) {
      const list = [...runners].sort();
      for (let i = start; i < end; i += 1) {
        meetings.set(rows[i].key, { runners: list, first: i === start, last: i === end - 1 });
      }
    }
    start = end;
  }
  return meetings;
}

/**
 * Who gets a lane: the members who meet others most, then the most active.
 *
 * Ranked by meetings first because a lane that never bends is only a coloured
 * line — the point of the view is the bundles, so the people who make them are
 * the ones worth a colour. Name and slug break the remaining ties so the
 * assignment, and therefore every colour, is the same on every render.
 */
export function assignLanes(
  rows: ClubTimelineRow[],
  limit: number = LANE_LIMITS.wide,
): ClubLanes {
  const stats = new Map<string, { entries: number; meetings: number; member: LaneMember }>();
  const touch = (member: LaneMember) => {
    let entry = stats.get(member.slug);
    if (!entry) {
      entry = { entries: 0, meetings: 0, member: { name: member.name, slug: member.slug } };
      stats.set(member.slug, entry);
    }
    return entry;
  };

  for (const row of rows) {
    for (const runner of row.race?.runners ?? []) touch(runner).entries += 1;
    for (const post of row.posts) if (post.author) touch(post.author).entries += 1;
  }

  // Once per meeting, not once per row of it: a run over two distances is
  // still one weekend.
  for (const meeting of rowMeetings(rows).values()) {
    if (!meeting.first) continue;
    for (const slug of meeting.runners) {
      const entry = stats.get(slug);
      if (entry) entry.meetings += 1;
    }
  }

  const ranked = [...stats.values()].sort(
    (a, b) =>
      b.meetings - a.meetings ||
      b.entries - a.entries ||
      a.member.name.localeCompare(b.member.name) ||
      a.member.slug.localeCompare(b.member.slug),
  );

  return {
    lanes: ranked.slice(0, limit).map((entry) => entry.member),
    others: ranked.length > limit,
  };
}

/**
 * Which lane a member is drawn in, for a screen that shows `limit` lanes.
 *
 * Anyone without a lane of their own — past `limit`, or not among the club's
 * lanes at all — is drawn in the grey lane, whose index is `limit`.
 */
export function laneOf(lanes: LaneMember[], limit: number, slug: string): number {
  const index = lanes.findIndex((lane) => lane.slug === slug);
  return index >= 0 && index < limit ? index : limit;
}

/** How many lanes a screen showing `limit` of them draws, the grey one included. */
export function laneCount(club: ClubLanes, limit: number): number {
  const own = Math.min(club.lanes.length, limit);
  const grey = club.others || club.lanes.length > limit;
  return own + (grey ? 1 : 0);
}

export type StripGeometry = {
  /** x of lane 0, in px. */
  first: number;
  /** Distance between two lanes at rest, in px. */
  gap: number;
  /** Distance between two lanes inside a bundle, in px. */
  bundle: number;
};

export type Strip = {
  /** x of every lane where the block starts, halfway down, and where it ends. */
  top: number[];
  mid: number[];
  bottom: number[];
  /** The interchange drawn over a meeting's bundle — only on its first row. */
  capsule?: { lanes: number; x: number };
  /** A single member's race or article, on their own lane. */
  node?: { kind: "post" | "race"; x: number; lane: number };
};

/**
 * One block of the rail: where each lane is at its top, middle and bottom.
 *
 * `participants` are the lanes of the people on this row (for a meeting, of
 * everyone at that race). Two or more distinct lanes bundle around their mean
 * home position, `bundle` px apart; a lane held in a bundle by the row above
 * or below enters or leaves it already merged, so a meeting over two distance
 * rows is one bundle and not two.
 */
export function braidStrip({
  count,
  geometry,
  kind,
  meeting,
  participants,
}: {
  count: number;
  geometry: StripGeometry;
  kind?: "post" | "race";
  meeting?: Pick<RowMeeting, "first" | "last">;
  participants: number[];
}): Strip {
  const home = Array.from({ length: count }, (_, lane) => geometry.first + lane * geometry.gap);
  const lanes = [...new Set(participants)].filter((lane) => lane < count).sort((a, b) => a - b);

  if (lanes.length >= 2) {
    const centre = lanes.reduce((sum, lane) => sum + home[lane], 0) / lanes.length;
    const merged = [...home];
    lanes.forEach((lane, position) => {
      merged[lane] = centre + (position - (lanes.length - 1) / 2) * geometry.bundle;
    });
    const held = (edge: boolean) => (meeting && !edge ? merged : home);
    return {
      top: held(meeting?.first ?? true),
      mid: merged,
      bottom: held(meeting?.last ?? true),
      capsule: !meeting || meeting.first ? { lanes: lanes.length, x: centre } : undefined,
    };
  }

  if (lanes.length === 1) {
    const lane = lanes[0];
    // Several people who all fall in the grey lane still met: an interchange
    // on one lane, rather than a node that would read as one person's race.
    if (meeting) {
      return {
        top: home,
        mid: home,
        bottom: home,
        capsule: meeting.first ? { lanes: 1, x: home[lane] } : undefined,
      };
    }
    return {
      top: home,
      mid: home,
      bottom: home,
      node: kind ? { kind, lane, x: home[lane] } : undefined,
    };
  }

  return { top: home, mid: home, bottom: home };
}
