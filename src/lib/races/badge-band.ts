/**
 * How a distance label is made to fit the badge's band.
 *
 * A MODULE OF ITS OWN, and for the reason catalogue-shape.ts gives about
 * itself: this is a pure function of a string, and reaching it through
 * badge.tsx would make its unit test import React and the whole artwork
 * track to check what a function does with 「Monte Rosa Trail」.
 */

import { BADGE_BAND_WIDTH } from "./badge-contract";

/**
 * The size below which shrinking stops buying legibility and starts costing
 * it. In badge user units, so a 40px badge renders this at 5px and the 72px
 * profile wall at 9.
 */
const BAND_MIN_FONT_SIZE = 8;

/**
 * Width in em, counting CJK as full-width.
 *
 * An estimate, not a measurement — there is no text metrics API on the
 * server and the badge is rendered as SSR'd SVG. 0.6em per latin character
 * is a little generous for this weight, which is the direction to err in:
 * it shrinks a label that would just have fitted rather than clipping one
 * that did not. The CJK arm is not decoration on a Chinese-language site —
 * an admin naming a distance 「越野跑 50 公里」 in /admin is one edit away,
 * and at 0.6em that string is measured as two thirds of its real width.
 */
export function emWidth(text: string): number {
  let em = 0;
  for (const character of text) {
    em += /[\u2e80-\u9fff\uff00-\uffef]/.test(character) ? 1 : 0.6;
  }
  return em;
}

/**
 * Fit the band label inside the badge instead of letting it run off the edge.
 *
 * WHAT WAS WRONG. A distance's label is whatever the catalogue calls it, and
 * only a minority of them are 「42K」-shaped: 222 of the 344 in the seed data
 * are route names — 「Monte Rosa Trail」, 「Western States 100-Mile Endurance
 * Run」 — and every one of those was wider than the 64-unit frame it was
 * centred in. An `<svg>` root clips at its own edge, so this never looked
 * like overflow. It looked like a badge reading 「nte Rosa T」: sliced at both
 * ends, at full size, so nothing about it said "there is more of this".
 *
 * SHRINK FIRST, because at the lengths that actually dominate the catalogue
 * that is all it takes and it costs nothing — 「20K Quinde」 fits at 9.7
 * instead of 13, and is still a whole label. Truncating at a fixed width
 * would have thrown away two thirds of every one of those to solve a problem
 * they do not have.
 *
 * TRUNCATE ONLY BELOW THE FLOOR, because shrinking has an end: 「Ultra Trail
 * Métropole Nice Côte d'Azur 100M」 scaled to fit is a grey smear, which is
 * not more honest than a slice, only quieter. Past that point the label is
 * cut with an ellipsis — the one mark that says a name continues — and the
 * full text stays in `<title>` and the accessible name either way.
 *
 * THE YEAR IS NEVER WHAT GOES. It arrives as a suffix rather than as part of
 * the string so the truncation cannot eat it: a badge that dropped 「2024」 to
 * keep two more letters of a race name would be losing the half a reader
 * cannot infer.
 */
export function fitBandLabel(
  label: string,
  suffix: string,
  preferredFontSize: number,
): { fontSize: number; text: string } {
  const full = `${label}${suffix}`;
  const width = emWidth(full);
  const fontSize = width
    ? Math.min(preferredFontSize, BADGE_BAND_WIDTH / width)
    : preferredFontSize;
  if (fontSize >= BAND_MIN_FONT_SIZE) return { fontSize, text: full };

  // Everything the floor can hold, less what the year and the ellipsis have
  // already spoken for.
  let room = BADGE_BAND_WIDTH / BAND_MIN_FONT_SIZE - emWidth(suffix) - 0.6;
  let kept = "";
  for (const character of label) {
    const cost = emWidth(character);
    if (cost > room) break;
    room -= cost;
    kept += character;
  }

  return {
    fontSize: BAND_MIN_FONT_SIZE,
    // `trimEnd` so a cut landing after a word does not render 「Monte …」 —
    // the gap reads as a missing glyph rather than as an abbreviation.
    text: `${kept.trimEnd()}…${suffix}`,
  };
}
