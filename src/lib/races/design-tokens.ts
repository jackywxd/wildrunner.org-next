/**
 * MOCKUP design tokens — owned by the badge artwork track.
 *
 * This whole file is placeholder. It exists so the feature can be built,
 * reviewed and tested against real layout instead of grey boxes, and it is
 * meant to be replaced wholesale when the artwork is finalised. Nothing
 * outside `design-tokens.ts`, `motifs.tsx` and `badge-art.tsx` needs to
 * change when that happens — see badge-contract.ts.
 *
 * It is deliberately not a grey square: every race gets a distinct hue and a
 * real abbreviation, so the directory and profile layouts can be judged for
 * density and legibility now. Only the drawing itself is provisional.
 */

import { findRaceEvent } from "./catalogue";
import type { BadgeToken, Motif } from "./badge-contract";

/** FNV-1a, the same hash `riders/avatar.ts` uses, for the same reason. */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Derived from the event name rather than curated, because these are
 * placeholders. The final tokens will carry hand-picked abbreviations —
 * runners call it "CCC" and "WSER", not "UM" and "WS".
 */
function abbreviate(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .split(/[\s-]+/)
    .filter((word) => word.length > 0 && !/^(by|the|de|del|of|d)$/i.test(word));

  if (words.length === 0) return "??";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .slice(0, 3)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

/**
 * Every mockup badge uses the same motif. Assigning the real nine per race
 * is artwork work, and guessing here would only produce something that looks
 * decided when it is not.
 */
const MOCKUP_MOTIF: Motif = "peak";

export function badgeToken(eventId: string): BadgeToken {
  const event = findRaceEvent(eventId);

  // An unknown id still gets a badge. Records outlive catalogue edits, and a
  // member's profile throwing because a race was renamed would be a far
  // worse failure than a neutral placeholder (A-T4).
  if (!event) {
    return {
      abbr: "?",
      eventId,
      ink: "hsl(0 0% 100%)",
      motif: MOCKUP_MOTIF,
      primary: "hsl(0 0% 45%)",
      secondary: "hsl(0 0% 30%)",
    };
  }

  const hue = hash(event.id) % 360;

  return {
    abbr: abbreviate(event.name),
    eventId: event.id,
    ink: "hsl(0 0% 100%)",
    motif: MOCKUP_MOTIF,
    primary: `hsl(${hue} 62% 46%)`,
    secondary: `hsl(${(hue + 28) % 360} 58% 30%)`,
  };
}
