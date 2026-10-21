/**
 * The one projection the footprint map draws with.
 *
 * WHY THIS IS ITS OWN FILE. Two things have to agree to the decimal or the
 * map lies quietly: the land dots (`world-dots.ts`, produced by
 * `scripts/generate-world-dots.ts`) and the stops a race is pinned with
 * (`footprints.ts`). A stop that is placed with a different offset than the
 * land under it lands in the sea — nothing throws, the page just shows Hong
 * Kong in the Pacific. So both import `project` from here, and the generator
 * stamps the constants it used into the file it writes, so a stale generated
 * file is a red test (U-FOOT-T5) rather than a wrong map.
 *
 * Plain equirectangular, one degree = one SVG unit. That is deliberately
 * dull: it makes the viewBox 360 x 140, makes "7 units" in the landing glow
 * read as "about 7 degrees", and keeps a date-line crossing a plain
 * |Δx| > 180 comparison with no projection maths in the way.
 *
 * Latitude runs 82 -> -58: Greenland's north is in, Antarctica is out. A
 * trail-running club has no business there and the band it frees up is ~25%
 * of the height.
 *
 * NOTHING HERE IMPORTS A GEO LIBRARY. The generator does, at build time of the
 * data; the browser gets numbers.
 */

export type Point = { x: number; y: number };

/** Degrees between neighbouring land dots, both ways. */
export const GRID_STEP = 2.6;

export const LNG_MIN = -180;
export const LNG_MAX = 180;
export const LAT_MAX = 82;
export const LAT_MIN = -58;

/** SVG units per degree. */
export const SCALE = 1;

export const VIEWBOX = {
  width: (LNG_MAX - LNG_MIN) * SCALE,
  height: (LAT_MAX - LAT_MIN) * SCALE,
} as const;

/** Two decimals: enough for a 360-unit map, and the same string on server and client. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** [longitude, latitude] in degrees -> a point in the map's SVG units. */
export function project([lng, lat]: readonly [number, number]): Point {
  return {
    x: round2((lng - LNG_MIN) * SCALE),
    y: round2((LAT_MAX - lat) * SCALE),
  };
}

/** Whether a coordinate has a place on this map at all. */
export function onMap([lng, lat]: readonly [number, number]): boolean {
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lng >= LNG_MIN &&
    lng <= LNG_MAX &&
    lat >= LAT_MIN &&
    lat <= LAT_MAX
  );
}
