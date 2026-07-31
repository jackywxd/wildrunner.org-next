/**
 * MOCKUP terrain motifs — owned by the badge artwork track.
 *
 * Placeholder. The finished set draws nine distinct terrains (peak, canyon,
 * coast, volcano, forest, desert, island, city, plateau); this one draws a
 * generic ridge for all of them, which is enough to size and position the
 * art area but says nothing about the final look.
 *
 * Coordinates are in the 64x64 badge viewBox, and the art area is the top
 * BADGE_ART_HEIGHT of it — see badge-contract.ts.
 */

import type { Motif } from "./badge-contract";

/**
 * A ridge line. Every motif currently returns this; the real implementation
 * switches on `motif`.
 */
export function motifPath(_motif: Motif): string {
  return "M2 40 L16 20 L24 30 L36 12 L46 28 L54 20 L62 40 Z";
}
