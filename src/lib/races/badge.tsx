/**
 * A race badge: one event, one distance, one year.
 *
 * Owns the badge's *structure* — frame, distance band, series tag, the
 * `data-*` the tests key on — and delegates the drawing to the artwork track
 * through `renderBadgeArt`. See badge-contract.ts for why the split exists.
 *
 * One artwork per event, with distance and year as text: the alternative,
 * an image per (event, distance, year), would need 200+ drawings to say what
 * 65 plus two strings already say.
 */

import {
  BADGE_ART_HEIGHT,
  BADGE_VIEWBOX,
  BADGE_YEAR_MIN_SIZE,
} from "./badge-contract";
import { fitBandLabel } from "./badge-band";
import { renderBadgeArt, renderSixMajorsArt } from "./badge-art";
import type { BadgeArtRenderer } from "./badge-contract";
import { badgeToken } from "./design-tokens";
import type { BadgeDistance, BadgeEvent } from "./badge-source";
import {
  SIX_MAJORS_BADGE_EVENT,
  SIX_MAJORS_BAND,
  SIX_MAJORS_ID,
  SIX_MAJORS_TITLE,
} from "./six-majors";
import { cn } from "@/lib/utils";

export type RaceBadgeProps = {
  className?: string;
  /** Resolved by the caller — see badge-source.ts for why. */
  distance: BadgeDistance;
  event: BadgeEvent;
  /**
   * Draws the interior. Defaults to the race artwork; `SixMajorsBadge` below
   * passes its own, because an achievement is not a place and the terrain
   * renderer has nothing true to say about it. Both come from the artwork
   * track — this prop is the seam, not an invitation to draw here.
   */
  renderArt?: BadgeArtRenderer;
  size?: number;
  /**
   * Overrides the accessible name. Only for badges that are not one race —
   * `SixMajorsBadge` would otherwise announce itself as
   * "Six Star Finisher — 6★ 2024", saying the same thing twice.
   */
  title?: string;
  year: number;
};

export function RaceBadge({
  className,
  distance,
  event,
  renderArt = renderBadgeArt,
  size = 64,
  title: titleOverride,
  year,
}: RaceBadgeProps) {
  const token = badgeToken(event);

  const distanceLabel = distance.label;
  const showYear = size >= BADGE_YEAR_MIN_SIZE;
  const title = titleOverride ?? `${event.name} — ${distanceLabel} ${year}`;

  const band = fitBandLabel(
    distanceLabel,
    showYear ? ` ${year}` : "",
    showYear ? 11 : 13,
  );

  return (
    <svg
      aria-label={title}
      className={cn("shrink-0", className)}
      data-distance-id={distance.id}
      data-event-id={event.id}
      data-testid="race-badge"
      data-year={year}
      height={size}
      role="img"
      viewBox={`0 0 ${BADGE_VIEWBOX} ${BADGE_VIEWBOX}`}
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>

      {renderArt(token, size)}

      {/* Distance band. Structure, not artwork — the label has to sit in a
          known place for the layout to stay predictable across 65 designs. */}
      <rect
        fill={token.secondary}
        height={BADGE_VIEWBOX - BADGE_ART_HEIGHT}
        width={BADGE_VIEWBOX}
        x={0}
        y={BADGE_ART_HEIGHT}
      />
      <text
        dominantBaseline="central"
        fill={token.ink}
        fontFamily="inherit"
        fontSize={band.fontSize}
        fontWeight={700}
        textAnchor="middle"
        x={BADGE_VIEWBOX / 2}
        y={BADGE_ART_HEIGHT + (BADGE_VIEWBOX - BADGE_ART_HEIGHT) / 2}
      >
        {band.text}
      </text>

      {/* Series tag. Two marks rather than a label: at 32px a word is
          unreadable, but a corner shape still distinguishes the series. */}
      {event.series === "utmb" && (
        <path d="M0 0 L14 0 L0 14 Z" fill={token.ink} opacity={0.9} />
      )}
      {event.series === "wtm" && (
        <circle cx={6} cy={6} fill={token.ink} opacity={0.9} r={4} />
      )}
    </svg>
  );
}

/**
 * Six Star: all six Abbott World Marathon Majors, and the year of the sixth.
 *
 * Built out of `RaceBadge` rather than drawn separately, so it inherits the
 * frame, the band and the `data-*` the tests key on — but it passes its own
 * art, because the terrain renderer draws places and this is not one.
 *
 * The band reads `6★` where a race badge reads its distance: this badge's
 * subject is a set of races, and no single distance describes it. Latin
 * rather than 「六大」 because a badge travels — screenshotted and pasted
 * somewhere with none of this site around it.
 */
export function SixMajorsBadge({
  className,
  size = 64,
  year,
}: {
  className?: string;
  size?: number;
  year: number;
}) {
  return (
    <RaceBadge
      className={className}
      distance={{ id: SIX_MAJORS_ID, label: SIX_MAJORS_BAND }}
      event={SIX_MAJORS_BADGE_EVENT}
      renderArt={renderSixMajorsArt}
      size={size}
      title={`${SIX_MAJORS_TITLE} — ${year}`}
      year={year}
    />
  );
}
