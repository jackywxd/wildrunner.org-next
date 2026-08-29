/**
 * MOCKUP terrain motifs — owned by the badge artwork track.
 *
 * Still placeholder art, but no longer one shape for everything. The
 * finished set draws nine distinct terrains (peak, canyon, coast, volcano,
 * forest, desert, island, city, plateau); this one draws two — a ridge, and
 * a skyline for `city` — because the marathon majors are road races and a
 * mountain on the Berlin Marathon says the wrong thing about what the race
 * is. The other seven still fall back to the ridge.
 *
 * The switch below is the shape the real implementation takes; filling in a
 * seventh terrain is now adding a `case`, not restructuring anything.
 *
 * Coordinates are in the 64x64 badge viewBox, and the art area is the top
 * BADGE_ART_HEIGHT of it — see badge-contract.ts.
 */

import type { Motif } from "./badge-contract";

/** A ridge line, and the fallback for every terrain not yet drawn. */
const RIDGE = "M2 40 L16 20 L24 30 L36 12 L46 28 L54 20 L62 40 Z";

/**
 * A skyline: flat roofs at varied heights on the same baseline the ridge
 * sits on, so the two read as the same badge with different scenery rather
 * than as two different layouts. Stepped rather than detailed — at 44px the
 * windows and spires of a more literal drawing turn to noise, which is the
 * same reason `badge-art.tsx` drops the terrain entirely below that size.
 */
const SKYLINE =
  "M2 40 L2 26 L9 26 L9 32 L15 32 L15 18 L22 18 L22 30 L29 30 L29 22 " +
  "L36 22 L36 34 L43 34 L43 14 L50 14 L50 28 L57 28 L57 24 L62 24 L62 40 Z";

export function motifPath(motif: Motif): string {
  switch (motif) {
    case "city":
      return SKYLINE;
    default:
      return RIDGE;
  }
}
