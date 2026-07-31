/**
 * The seam between the badge's structure and its artwork.
 *
 * Badge artwork is developed in parallel with the feature that uses it, on a
 * separate branch. That only works if the two sides never touch the same
 * files, so ownership is split:
 *
 *   functional track  badge.tsx, catalogue.ts, and this file
 *   artwork track     design-tokens.ts, motifs.tsx, badge-art.tsx
 *
 * This file is the agreed shape between them. The artwork track may change
 * everything about how a badge LOOKS; it may not change these types, and it
 * may not change `renderBadgeArt`'s signature. Anything that would require
 * both is a conversation, not a commit.
 *
 * The corollary, which matters more than it looks: no test may assert on
 * artwork — no colours, no path data, no motif. Tests assert the contract
 * (a badge exists, carries the right event/distance/year, renders something
 * non-empty). A single test pinning a mockup colour would mean the final
 * artwork lands as a test failure, and the whole point of the split is lost.
 * `A-T5` enforces this by grepping the specs for colour literals.
 */

import type { ReactNode } from "react";

/**
 * Terrain motifs. Nine is enough to give 65 races a recognisable identity
 * without every badge needing bespoke art — the geography does the work.
 */
export type Motif =
  | "canyon"
  | "city"
  | "coast"
  | "desert"
  | "forest"
  | "island"
  | "peak"
  | "plateau"
  | "volcano";

export type BadgeToken = {
  /** 2–3 characters, drawn on the badge. */
  abbr: string;
  eventId: string;
  /** Outline and band text. Any CSS colour. */
  ink: string;
  motif: Motif;
  /** Dominant fill. Any CSS colour. */
  primary: string;
  /** Accent fill. Any CSS colour. */
  secondary: string;
};

/**
 * Draws the badge's interior, in a 64x64 user-space viewBox.
 *
 * `size` is the rendered pixel size, passed so artwork can drop detail when
 * it would turn to mush — the directory renders at 32px.
 *
 * Must be deterministic: the same token and size always produce the same
 * output, because pages are cached and a badge that shimmers between
 * renders would look like a bug (A-T3).
 */
export type BadgeArtRenderer = (token: BadgeToken, size: number) => ReactNode;

/** The art area. Below this sits the distance band. */
export const BADGE_VIEWBOX = 64;
export const BADGE_ART_HEIGHT = 44;

/**
 * Below this the year is dropped from the drawing and carried only by the
 * `<title>` and the data attributes: two strings cannot both be legible in a
 * 32px square, and an unreadable smudge is worse than an honest omission.
 */
export const BADGE_YEAR_MIN_SIZE = 56;
