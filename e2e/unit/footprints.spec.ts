import { expect, test } from "@playwright/test";

import type { ClubRunner, ClubTimelineRow } from "@/lib/riders/club-timeline";
import {
  TIMING,
  buildFootprints,
  dotsNear,
  firstStep,
  flightPath,
  nextStep,
  project,
  shouldPing,
  type FootprintEvent,
  type PlaybackStep,
} from "@/lib/footprints/footprints";
import { GRID_STEP, LAT_MAX, LAT_MIN, LNG_MAX, LNG_MIN, SCALE, VIEWBOX } from "@/lib/footprints/projection";
import { WORLD_DOTS, WORLD_DOTS_PATH, WORLD_DOTS_PROJECTION } from "@/lib/footprints/world-dots";

/**
 * U-FOOT — the logic behind 野馬足跡 (/riders/footprints): which stops the
 * route flies through, the curve between them, the glow a landing leaves on
 * the land, and the loop that decides what happens next.
 *
 * THE FAILURES THESE PROTECT AGAINST, each one costly and none of them an
 * error — the page renders a map either way:
 *
 * - A route flown newest-first, because that is the order the timeline hands
 *   rows over.
 * - One race drawn as three stops because it has three distances, or its
 *   runners counted once per distance.
 * - A race with no coordinates pinned at (0,0) in the Gulf of Guinea and the
 *   route flown through it.
 * - Vancouver to Hong Kong drawn as a line across the whole of Asia.
 * - The dots and the pins projected with different constants, so every pin is
 *   in the sea.
 * - A landing glow on the ocean, or one that swallows half a continent.
 * - A loop that stops on the last stop, or restarts on the second.
 * - A landing sound with no gesture, with the switch off, or for a visitor
 *   who asked for no motion.
 *
 * PLAIN OBJECTS, no catalogue, no database, no browser: these are functions
 * of arrays. The component that times and draws them is not the subject here.
 */

const ann: ClubRunner = { name: "Ann", slug: "ann" };
const bo: ClubRunner = { name: "Bo", slug: "bo" };
const cy: ClubRunner = { name: "Cy", slug: "cy" };

// Real places, so a projection that is wrong lands them somewhere a person
// can tell is wrong. [lat, lng] as the catalogue will carry them.
const VANCOUVER = { lat: 49.3, lng: -123.1 };
const HONG_KONG = { lat: 22.3, lng: 114.2 };
const CHAMONIX = { lat: 45.9, lng: 6.9 };

function event(id: string, extra: Partial<FootprintEvent> = {}): FootprintEvent {
  return { id, name: `Race ${id}`, ...extra };
}

function row(
  eventId: string,
  year: number,
  extra: Partial<ClubTimelineRow> & { distanceId?: string; runners?: ClubRunner[] } = {},
): ClubTimelineRow {
  const { distanceId = "100k", runners = [ann], ...rest } = extra;
  return {
    key: `race-${eventId}|${distanceId}|${year}`,
    year,
    race: { eventId, distanceId, runners },
    posts: [],
    ...rest,
  };
}

/** Every number in a path string, in order. */
function numbers(d: string): number[] {
  return (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
}

test("U-FOOT-T1: the route is flown oldest first, the reverse of the timeline", () => {
  // The loader hands rows over newest first. A route in that order would fly
  // the club's history backwards and the map would read as a trip home.
  const events = [
    event("a", CHAMONIX),
    event("b", CHAMONIX),
    event("c", CHAMONIX),
    event("d", CHAMONIX),
    event("e", CHAMONIX),
  ];
  const timelineOrder = [
    row("a", 2024, { sortDay: "2024-09-01" }),
    row("b", 2024, { sortDay: "2024-03-10" }),
    // Dateless: "some time in 2024", so it goes first in its year, not last.
    row("c", 2024),
    row("d", 2023, { sortDay: "2023-12-31" }),
    // Same day as `d`: the key decides, ascending.
    row("e", 2023, { sortDay: "2023-12-31" }),
  ];

  const { stops } = buildFootprints(timelineOrder, events);

  expect(stops.map((stop) => stop.eventId)).toEqual(["d", "e", "c", "b", "a"]);
  // And it is a function of the rows, not of the order they arrived in.
  const shuffled = [timelineOrder[2], timelineOrder[4], timelineOrder[0], timelineOrder[3], timelineOrder[1]];
  expect(buildFootprints(shuffled, events).stops.map((stop) => stop.eventId)).toEqual(["d", "e", "c", "b", "a"]);
});

test("U-FOOT-T2: one race in one year is one stop, and each runner counts once", () => {
  const events = [event("utmb", { ...CHAMONIX, name: "UTMB", nameZh: "環勃朗峰" })];
  const rows = [
    // A 100M and a 50K the same weekend; Ann ran both.
    row("utmb", 2024, { distanceId: "100m", runners: [ann, bo], sortDay: "2024-08-30", day: "2024-08-30", location: "Chamonix" }),
    row("utmb", 2024, { distanceId: "50k", runners: [ann, cy], sortDay: "2024-08-30", day: "2024-08-30" }),
    // The next year is a different trip.
    row("utmb", 2025, { runners: [ann], sortDay: "2025-08-29" }),
    // An article is not a stop.
    { key: "post-1", year: 2024, day: "2024-09-01", sortDay: "2024-09-01", posts: [] } satisfies ClubTimelineRow,
  ];

  const { stops, unplaced } = buildFootprints(rows, events);

  expect(stops.map((stop) => [stop.year, stop.runners])).toEqual([
    [2024, 3],
    [2025, 1],
  ]);
  expect(unplaced).toEqual([]);
  expect(stops[0]).toMatchObject({
    key: "utmb|2024",
    name: "環勃朗峰",
    location: "Chamonix",
    day: "2024-08-30",
    // The first of the merged rows by key, so the link does not depend on load order.
    rowKey: "race-utmb|100m|2024",
  });
});

test("U-FOOT-T3: a race with no coordinates is reported, never pinned at (0,0)", () => {
  const events = [
    event("placed", CHAMONIX),
    event("bare"),
    event("nulls", { lat: null, lng: null }),
    // What a column default of 0 looks like after `db.create`.
    event("zero", { lat: 0, lng: 0 }),
    // South of the map's last row: no room for it, so it is not drawn at all.
    event("pole", { lat: -75, lng: 10 }),
    event("half", { lat: 45.9 }),
  ];
  const rows = [
    row("placed", 2024, { sortDay: "2024-01-01" }),
    row("bare", 2024, { sortDay: "2024-02-01" }),
    row("nulls", 2024, { sortDay: "2024-03-01" }),
    row("zero", 2024, { sortDay: "2024-04-01" }),
    row("pole", 2024, { sortDay: "2024-05-01" }),
    row("half", 2024, { sortDay: "2024-06-01" }),
    // The catalogue no longer has this event at all.
    row("gone", 2024, { sortDay: "2024-07-01" }),
  ];

  const { stops, unplaced } = buildFootprints(rows, events);

  expect(stops.map((stop) => stop.eventId)).toEqual(["placed"]);
  expect(unplaced.map((stop) => stop.eventId)).toEqual(["bare", "nulls", "zero", "pole", "half", "gone"]);
  // Not a single stop sits on the origin of the map.
  expect(stops.some((stop) => stop.x === 0 && stop.y === 0)).toBe(false);
  // An unplaced race keeps its name so the page can say which, and has no position at all.
  expect(unplaced[5]).toMatchObject({ eventId: "gone", name: "gone" });
  expect(unplaced[0]).not.toHaveProperty("x");
});

test("U-FOOT-T4: a crossing of the Pacific leaves one edge of the map and enters the other", () => {
  const width = VIEWBOX.width;
  const vancouver = project([VANCOUVER.lng, VANCOUVER.lat]);
  const hongKong = project([HONG_KONG.lng, HONG_KONG.lat]);

  for (const [from, to] of [
    [vancouver, hongKong],
    [hongKong, vancouver],
  ]) {
    const segments = flightPath(from, to);
    // Two pieces: out at one edge, in at the other.
    expect(segments.length).toBe(2);
    const [first, second] = segments.map(numbers);
    // Nothing leaves the map sideways...
    for (const value of [first[0], first[2], first[4], second[0], second[2], second[4]]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(width);
    }
    // ...they start and end where the stops are...
    expect([first[0], first[1]]).toEqual([from.x, from.y]);
    expect([second[4], second[5]]).toEqual([to.x, to.y]);
    // ...the first ends on one edge, the second begins on the other, at the same height...
    expect(new Set([first[4], second[0]])).toEqual(new Set([0, width]));
    expect(first[4]).not.toBe(second[0]);
    expect(first[5]).toBe(second[1]);
    // ...and neither half is a line across the world: together they span the
    // 123 degrees that actually separate the two, not the 237 they do not.
    const spanned = Math.abs(first[4] - first[0]) + Math.abs(second[4] - second[0]);
    expect(spanned).toBeLessThan(180);
  }

  // Exactly half the world apart is not a crossing: both ways are equal and
  // the direct one is drawn. One degree more, it is.
  expect(flightPath({ x: 90, y: 50 }, { x: 270, y: 50 }).length).toBe(1);
  expect(flightPath({ x: 89.5, y: 50 }, { x: 270, y: 50 }).length).toBe(2);

  // The arc is a quarter of the distance, and never more than 30.
  const near = numbers(flightPath({ x: 100, y: 60 }, { x: 140, y: 60 })[0]);
  expect(near[3]).toBeCloseTo(60 - 40 * 0.25, 1);
  const far = numbers(flightPath({ x: 20, y: 60 }, { x: 190, y: 60 })[0]);
  expect(far[3]).toBeCloseTo(60 - 30, 1);
});

test("U-FOOT-T5: the dots and the pins are projected with the same constants", () => {
  // Independent of the code under test: where four known corners and the
  // centre of the world must fall, worked out by hand from the viewBox.
  expect(project([-180, 82])).toEqual({ x: 0, y: 0 });
  expect(project([180, -58])).toEqual({ x: 360, y: 140 });
  expect(project([0, 0])).toEqual({ x: 180, y: 82 });
  expect(project([-123.1, 49.3])).toEqual({ x: 56.9, y: 32.7 });

  // The generated file says which constants it was made with. Editing
  // projection.ts without re-running the generator leaves a map whose land
  // and pins disagree; this is where that is noticed.
  expect(WORLD_DOTS_PROJECTION).toEqual({
    gridStep: GRID_STEP,
    lngMin: LNG_MIN,
    lngMax: LNG_MAX,
    latMax: LAT_MAX,
    latMin: LAT_MIN,
    scale: SCALE,
    width: VIEWBOX.width,
    height: VIEWBOX.height,
  });

  // And the stamp is true: every dot is the centre of a grid cell under
  // `project`, so a pin and the land beneath it are measured by one ruler.
  for (const [x, y] of WORLD_DOTS) {
    const lng = LNG_MIN + (Math.round((x / SCALE / GRID_STEP) - 0.5) + 0.5) * GRID_STEP;
    const lat = LAT_MAX - (Math.round((y / SCALE / GRID_STEP) - 0.5) + 0.5) * GRID_STEP;
    expect(project([lng, lat])).toEqual({ x, y });
  }

  // Inland places must have land under their pin.
  for (const [name, lat, lng] of [
    ["Chamonix", 45.9, 6.9],
    ["Denver", 39.7, -105.0],
    ["Beijing", 39.9, 116.4],
  ] as const) {
    const pin = project([lng, lat]);
    expect(dotsNear(pin.x, pin.y, GRID_STEP).length, name).toBeGreaterThan(0);
  }

  // The path draws exactly the dots there are.
  expect(WORLD_DOTS_PATH.split("M").length - 1).toBe(WORLD_DOTS.length);
});

test("U-FOOT-T6: a landing lights up the land around it and nothing else", () => {
  // Inland Kazakhstan: every dot in a radius-7 disc is land, so the count is
  // the lattice points of a 2.6-unit grid inside 7 units — i, j in -2..2
  // with i² + j² <= (7 / 2.6)² (= 7.25), 25 minus the four corners.
  const steppe = project([66.3, 48.3]);
  const [centre] = dotsNear(steppe.x, steppe.y, GRID_STEP);
  const around = dotsNear(centre.x, centre.y, 7);
  expect(around.length).toBe(21);
  // Every dot reported is within range, nearest first, and the nearest is the centre itself.
  expect(around[0]).toMatchObject({ x: centre.x, y: centre.y, d: 0 });
  for (const dot of around) {
    expect(Math.hypot(dot.x - centre.x, dot.y - centre.y)).toBeCloseTo(dot.d, 6);
    expect(dot.d).toBeLessThanOrEqual(7);
  }
  expect(around.map((dot) => dot.d)).toEqual([...around.map((dot) => dot.d)].sort((a, b) => a - b));
  // The radius is what decides, in both directions: the next lattice points
  // out are the corners at 2.6·√8 = 7.35, then the axes at 3 steps = 7.8.
  expect(dotsNear(centre.x, centre.y, 7.3).length).toBe(21);
  expect(dotsNear(centre.x, centre.y, 7.4).length).toBe(25);
  expect(dotsNear(centre.x, centre.y, 7.9).length).toBe(29);

  // The middle of the South Pacific: no land within 7 units, so no glow.
  const ocean = project([-140, -20]);
  expect(dotsNear(ocean.x, ocean.y, 7)).toEqual([]);
});

test("U-FOOT-T7: the loop reaches the last stop, rests, fades and starts again at the first", () => {
  const trace = (stopCount: number, steps: number): string[] => {
    const out: string[] = [];
    let step: PlaybackStep | null = firstStep(stopCount);
    for (let i = 0; i < steps && step; i++) {
      out.push(`${step.phase}${step.index}`);
      step = nextStep(step, stopCount);
    }
    return out;
  };

  // One round of three stops, and then the same round again — the loop does
  // not end, and it does not skip the first stop on the way back.
  const round = ["land0", "hold0", "fly1", "land1", "hold1", "fly2", "land2", "rest2", "fade2"];
  expect(trace(3, round.length * 3)).toEqual([...round, ...round, ...round]);

  // One stop has nowhere to fly to, and still comes round again.
  expect(trace(1, 8)).toEqual(["land0", "rest0", "fade0", "land0", "rest0", "fade0", "land0", "rest0"]);

  // No stops: nothing to start, nothing to be stuck in.
  expect(firstStep(0)).toBeNull();
  expect(nextStep({ phase: "land", index: 0 }, 0)).toBeNull();

  // The timings are the ones the design names.
  const durations = (stopCount: number) => {
    const seen = new Map<string, number>();
    let step = firstStep(stopCount);
    for (let i = 0; i < 20 && step; i++) {
      seen.set(step.phase, step.durationMs);
      step = nextStep(step, stopCount);
    }
    return Object.fromEntries(seen);
  };
  expect(durations(3)).toEqual({ land: 1500, hold: 900, fly: 1300, rest: 3000, fade: 900 + 500 });
  expect(TIMING.landScale).toBe(1.6);
  // Forty stops still fly at the full 1.3s; one more and the hops shorten.
  expect(durations(40).fly).toBe(1300);
  expect(durations(41).fly).toBe(700);
});

test("U-FOOT-T8: a landing makes a sound only with the switch on, a gesture given and motion allowed", () => {
  const expected = (enabled: boolean, unlocked: boolean, reducedMotion: boolean) =>
    enabled && unlocked && !reducedMotion;

  for (const enabled of [false, true]) {
    for (const unlocked of [false, true]) {
      for (const reducedMotion of [false, true]) {
        expect(shouldPing({ enabled, unlocked, reducedMotion }), `${enabled}/${unlocked}/${reducedMotion}`).toBe(
          expected(enabled, unlocked, reducedMotion),
        );
      }
    }
  }
  // The one case that does ping, spelled out so a wrong `expected` cannot hide it.
  expect(shouldPing({ enabled: true, unlocked: true, reducedMotion: false })).toBe(true);
  expect(shouldPing({ enabled: true, unlocked: false, reducedMotion: false })).toBe(false);
});
