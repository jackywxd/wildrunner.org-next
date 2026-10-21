/**
 * The logic behind 野馬足跡 (/riders/footprints): which stops the map flies
 * through, the curve between two of them, which land dots a landing lights up,
 * and the loop that decides what happens next.
 *
 * PURE, and kept apart from the component for the reason `club-timeline.ts`
 * is kept apart from its page: every way this can go wrong is invisible once
 * it is a picture. A route flown backwards, a pin at (0,0), a crossing of the
 * Pacific drawn straight across Asia and a loop that never comes back to the
 * start all render *something*. They are checked here, as functions of
 * arrays, with no server and no browser. The component's only jobs are to
 * schedule timers from `nextStep` and to draw what these functions return.
 *
 * ORDER IS THE REVERSE OF THE TIMELINE. `/riders/timeline` lists newest first;
 * a route is flown oldest first. `buildFootprints` therefore sorts ascending
 * by `sortDay` (the date the timeline orders by, including its inferred
 * "typical day"), then by `key`. Both are compared as "YYYY-MM-DD" strings —
 * a `Date` built from a stored value lands on the previous day west of
 * Greenwich, see `src/lib/races/calendar.ts`. A race with no date at all
 * sorts to the *start* of its year: that is the exact mirror of the timeline,
 * which puts it at the bottom of the year, and it keeps the claim the data
 * makes ("some time that year") from being turned into "after everything".
 *
 * A STOP IS (EVENT, YEAR), NOT A TIMELINE ROW. The timeline draws a 100M and
 * a 50K of the same race as two rows because a badge is (event, distance,
 * year). A place is not: both start in the same town, and flying there twice
 * in a row would be a zero-length hop and a card that says "2 runners" twice.
 * So rows merge across distances and runners are counted once by slug.
 *
 * NO COORDINATE, NO STOP. An event with no `lat`/`lng` is returned in
 * `unplaced` and never drawn. The tempting fallback — a database default of 0
 * or a missing number coerced by arithmetic — pins the race at (0,0), in the
 * Gulf of Guinea, and flies the route through it. AGENTS.md documents that
 * `payload.db.create` writes a column's *declared* default, so an exact 0/0
 * pair is treated as missing too: no trail-running city is at null island.
 * A coordinate the map has no room for (it stops at 58°S) is unplaced for the
 * same reason: off-canvas is a lie by omission, "unplaced" says so.
 */

import type { ClubTimelineRow } from "@/lib/riders/club-timeline";

import { WORLD_DOTS } from "./world-dots";
import { VIEWBOX, onMap, project, type Point } from "./projection";

export { VIEWBOX, project, type Point } from "./projection";

/**
 * What `buildFootprints` needs from a catalogue event. Structurally a subset
 * of `CatalogueEvent`; `lat`/`lng` are optional (and nullable, because
 * Payload hands back `null` for an empty number) so the type stays compatible
 * with a catalogue that has not been given coordinates yet.
 */
export type FootprintEvent = {
  id: string;
  name: string;
  nameZh?: string;
  lat?: number | null;
  lng?: number | null;
  /** The city the geocoder matched (`race-events.geoPlace`); see `placeOf`. */
  geoPlace?: string | null;
};

export type FootprintStop = {
  /** `${eventId}|${year}` — unique per stop. */
  key: string;
  /** The timeline row to link to: `/riders/timeline?at=<rowKey>#<rowAnchor(rowKey)>`. */
  rowKey: string;
  eventId: string;
  year: number;
  name: string;
  /** "YYYY-MM-DD" when known — what a card shows. */
  day?: string;
  /** What the order was decided by; see the header. */
  sortDay?: string;
  location?: string;
  /** Distinct members who ran it, across every distance. */
  runners: number;
  x: number;
  y: number;
};

/** A race the map cannot place: same facts, no position. */
export type UnplacedFootprint = Omit<FootprintStop, "x" | "y">;

type Draft = Omit<FootprintStop, "x" | "y"> & { slugs: Set<string> };

/**
 * The marker `resolve-event-place.ts` (RELAXED_MARK) appends to a `geoPlace`
 * that matched on the looser query. It is there for the admin who reviews the
 * geocoder's work and means nothing to a visitor reading a card. Repeated
 * rather than imported: that module reaches the server, and this one ships to
 * the browser.
 */
const RELAXED_MARK = /\s*\(relaxed\)\s*$/;

/**
 * The place a stop shows: the event's own city if the geocoder found one,
 * otherwise whatever the edition's `location` said, otherwise nothing.
 *
 * `geoPlace` first because it is what the dot on the map was placed from — a
 * card naming a different town than the pin sits on reads as a mistake — and
 * because an edition's location is free text ("Silverton, Colorado",
 * "Yamanashi / Shizuoka") that exists on only some editions.
 */
function placeOf(event: FootprintEvent | undefined, edition: string | undefined): string | undefined {
  const geo = event?.geoPlace?.replace(RELAXED_MARK, "").trim();
  return geo || edition || undefined;
}

/** `<` on strings, never `localeCompare`: the order must not depend on a locale. */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function hasCoordinates(event: FootprintEvent | undefined): event is FootprintEvent & {
  lat: number;
  lng: number;
} {
  if (!event) return false;
  const { lat, lng } = event;
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (lat === 0 && lng === 0) return false;
  return onMap([lng, lat]);
}

/** Oldest first; a race with no date sorts to the start of its year. */
function chronological(
  a: Pick<UnplacedFootprint, "key" | "sortDay" | "year">,
  b: Pick<UnplacedFootprint, "key" | "sortDay" | "year">,
): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.sortDay !== b.sortDay) {
    if (!a.sortDay) return -1;
    if (!b.sortDay) return 1;
    return compareText(a.sortDay, b.sortDay);
  }
  return compareText(a.key, b.key);
}

export function buildFootprints(
  rows: readonly ClubTimelineRow[],
  events: readonly FootprintEvent[],
): { stops: FootprintStop[]; unplaced: UnplacedFootprint[] } {
  const byId = new Map(events.map((event) => [event.id, event]));
  const drafts = new Map<string, Draft>();

  // Smallest row key first, so the row a stop links to does not depend on the
  // order the loader happened to return. It is also the row the timeline
  // itself draws first among rows that share a day.
  const raceRows = rows.filter((row) => row.race).sort((a, b) => compareText(a.key, b.key));

  for (const row of raceRows) {
    const race = row.race!;
    const key = `${race.eventId}|${row.year}`;
    let draft = drafts.get(key);
    if (!draft) {
      const event = byId.get(race.eventId);
      draft = {
        key,
        rowKey: row.key,
        eventId: race.eventId,
        year: row.year,
        // The same fallback the rest of the site uses: Chinese name, then the
        // English one, then the id of an event the catalogue no longer has.
        name: event?.nameZh || event?.name || race.eventId,
        runners: 0,
        slugs: new Set(),
      };
      drafts.set(key, draft);
    }
    draft.day ??= row.day;
    draft.sortDay ??= row.sortDay;
    draft.location ||= row.location;
    for (const runner of race.runners) draft.slugs.add(runner.slug);
  }

  const stops: FootprintStop[] = [];
  const unplaced: UnplacedFootprint[] = [];

  for (const { slugs, ...draft } of [...drafts.values()].sort(chronological)) {
    const event = byId.get(draft.eventId);
    const facts = { ...draft, location: placeOf(event, draft.location), runners: slugs.size };
    if (hasCoordinates(event)) {
      stops.push({ ...facts, ...project([event.lng, event.lat]) });
    } else {
      unplaced.push(facts);
    }
  }

  return { stops, unplaced };
}

/** Longest the arc may bulge, in SVG units. */
const ARC_MAX = 30;
/** Arc height as a share of the straight distance. */
const ARC_RATIO = 0.25;

function fmt(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function quadratic(p0: Point, c: Point, p1: Point): string {
  return `M${fmt(p0.x)} ${fmt(p0.y)}Q${fmt(c.x)} ${fmt(c.y)} ${fmt(p1.x)} ${fmt(p1.y)}`;
}

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * The curve from one stop to the next, as SVG path data — one string, or two
 * when it crosses the edge of the map.
 *
 * A quadratic bezier whose control point sits off the middle of the chord,
 * perpendicular to it, on the upper side: `min(30, distance * 0.25)`. The cap
 * is what keeps a Vancouver-to-Cape-Town hop from arching out of the viewBox,
 * and the ratio is what keeps a hop between two Alpine valleys nearly flat.
 *
 * THE DATE LINE. When the two stops are more than half the map apart
 * (|Δx| > 180, i.e. |Δlng| > 180) the short way round is across the edge:
 * Vancouver to Hong Kong is 63° west-about, not 237° east. Drawn naively that
 * is a line straight across Asia and the Atlantic that no plane flies. So the
 * curve is built on the *unwrapped* chord (the far stop moved one map-width
 * towards the near one), cut where it meets the edge, and the second half is
 * moved back by one width — two segments, the first leaving the map at one
 * edge and the second entering at the other, joined at the same y. Exactly
 * 180° apart is not wrapped: both ways are equal and the direct one is used.
 *
 * The cut is found by bisection, valid because the control point cannot
 * leave the x-range of the chord on a wrapped hop (the chord is >180 wide,
 * the bulge at most 30), which makes x(t) monotonic.
 */
export function flightPath(a: Point, b: Point): string[] {
  const width = VIEWBOX.width;
  const wrapped = Math.abs(b.x - a.x) > width / 2;
  const target: Point = wrapped ? { x: b.x + (b.x > a.x ? -width : width), y: b.y } : b;

  const dx = target.x - a.x;
  const dy = target.y - a.y;
  const distance = Math.hypot(dx, dy);
  const mid = lerp(a, target, 0.5);

  let control = mid;
  if (distance > 0) {
    const height = Math.min(ARC_MAX, distance * ARC_RATIO);
    // Perpendicular to the chord, flipped to point up the screen; a
    // perfectly vertical chord has no "up" side and bulges right.
    let nx = -dy / distance;
    let ny = dx / distance;
    if (ny > 0 || (ny === 0 && nx < 0)) {
      nx = -nx;
      ny = -ny;
    }
    control = { x: mid.x + nx * height, y: mid.y + ny * height };
  }

  if (!wrapped) return [quadratic(a, control, target)];

  const edge = target.x < 0 ? 0 : width;
  const xAt = (t: number) =>
    (1 - t) * (1 - t) * a.x + 2 * t * (1 - t) * control.x + t * t * target.x;
  // x(t) runs from a.x towards the edge side, so which sign means "not there
  // yet" depends on the direction of travel.
  const before = (t: number) => (edge === 0 ? xAt(t) > edge : xAt(t) < edge);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 50; i++) {
    const t = (lo + hi) / 2;
    if (before(t)) lo = t;
    else hi = t;
  }
  const t = (lo + hi) / 2;

  const q0 = lerp(a, control, t);
  const q1 = lerp(control, target, t);
  const cut = lerp(q0, q1, t);

  const shift = edge === 0 ? width : -width;
  const exit: Point = { x: edge, y: cut.y };
  const enter: Point = { x: edge === 0 ? width : 0, y: cut.y };
  const back = (p: Point): Point => ({ x: p.x + shift, y: p.y });

  return [quadratic(a, q0, exit), quadratic(enter, back(q1), back(target))];
}

export type NearDot = { x: number; y: number; d: number };

/**
 * The land dots within `r` of a point, nearest first, each with its distance.
 *
 * What a landing lights up: the distance is both the brightness falloff and
 * the stagger, so the glow spreads outward from the pin. Straight-line in SVG
 * units, no wrapping across the edge — a landing at x=1 does not light the
 * far side of the world. Ties break on x then y so the order is stable.
 */
export function dotsNear(x: number, y: number, r: number): NearDot[] {
  const found: NearDot[] = [];
  for (const [dx, dy] of WORLD_DOTS) {
    const d = Math.hypot(dx - x, dy - y);
    if (d <= r) found.push({ x: dx, y: dy, d });
  }
  return found.sort((a, b) => a.d - b.d || a.x - b.x || a.y - b.y);
}

/**
 * Every duration the loop and the landing use, in one place — a number that
 * lives in two files is one of them wrong.
 */
export const TIMING = {
  /** One hop between two stops. */
  flyMs: 1300,
  /** One hop when there are more than `denseAbove` stops: 40 hops at 1.3s is a minute, too slow. */
  flyDenseMs: 700,
  denseAbove: 40,
  /** Pause on a stop before leaving for the next. */
  gapMs: 900,
  /** On the last stop, so a visitor can read the whole trail. */
  restMs: 3000,
  /** Trail and pins fading out. */
  fadeMs: 900,
  /** Dark beat after the fade; belongs to the fade step, see `nextStep`. */
  pauseMs: 500,
  /** The landing animation as a whole. */
  landMs: 1500,
  /** How large the pin swells at landing, and for how long it grows and stays. */
  landScale: 1.6,
  landScaleInMs: 180,
  landScaleHoldMs: 700,
} as const;

export type PlaybackPhase = "land" | "hold" | "fly" | "rest" | "fade";

/** Where the loop is: `index` is the stop being landed on, held, flown to, rested on, or faded from. */
export type PlaybackState = { phase: PlaybackPhase; index: number };

export type PlaybackStep = PlaybackState & { durationMs: number };

function stepFor(phase: PlaybackPhase, index: number, stopCount: number): PlaybackStep {
  switch (phase) {
    case "land":
      return { phase, index, durationMs: TIMING.landMs };
    case "hold":
      return { phase, index, durationMs: TIMING.gapMs };
    case "fly":
      return {
        phase,
        index,
        durationMs: stopCount > TIMING.denseAbove ? TIMING.flyDenseMs : TIMING.flyMs,
      };
    case "rest":
      return { phase, index, durationMs: TIMING.restMs };
    case "fade":
      // The pause is part of the fade so that the step after it, land(0),
      // always begins on an empty map with nothing left to schedule.
      return { phase, index, durationMs: TIMING.fadeMs + TIMING.pauseMs };
  }
}

/** The step the loop starts on, or `null` when there is nothing to fly. */
export function firstStep(stopCount: number): PlaybackStep | null {
  return stopCount > 0 ? stepFor("land", 0, stopCount) : null;
}

/**
 * The loop, as a state machine the component only has to time.
 *
 *   land(0) hold(0) fly(1) land(1) hold(1) fly(2) … land(n-1) rest fade land(0) …
 *
 * It does not end: after `fade` comes `land(0)` again, which is what makes
 * the page a loop rather than a one-shot. One stop has nothing to fly to, so
 * it goes straight from `land(0)` to `rest`. No stops returns `null` — the
 * caller must not start, and there is no state for it to be stuck in.
 *
 * Each step carries its own duration (`durationMs`): the component sets one
 * timer per step and asks for the next, so no timing lives in the component.
 */
export function nextStep(state: PlaybackState, stopCount: number): PlaybackStep | null {
  if (stopCount <= 0) return null;
  const last = stopCount - 1;
  switch (state.phase) {
    case "land":
      return state.index >= last
        ? stepFor("rest", last, stopCount)
        : stepFor("hold", state.index, stopCount);
    case "hold":
      return stepFor("fly", state.index + 1, stopCount);
    case "fly":
      return stepFor("land", state.index, stopCount);
    case "rest":
      return stepFor("fade", last, stopCount);
    case "fade":
      return stepFor("land", 0, stopCount);
  }
}

/**
 * Whether a landing may make a sound.
 *
 * All three, never any one: `enabled` is the visitor's own switch,
 * `unlocked` is whether the browser has had a gesture to allow audio (before
 * one, an AudioContext is suspended and `resume()` is refused — that is a
 * browser rule, not something to work around), and `reducedMotion` is a
 * request for a quiet, still page that a sound cue would contradict.
 */
export function shouldPing({
  enabled,
  unlocked,
  reducedMotion,
}: {
  enabled: boolean;
  unlocked: boolean;
  reducedMotion: boolean;
}): boolean {
  return enabled && unlocked && !reducedMotion;
}
