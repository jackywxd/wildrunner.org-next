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
import { renderBadgeArt } from "./badge-art";
import { badgeToken } from "./design-tokens";
import {
  RACE_SERIES_LABELS,
  findRaceDistance,
  findRaceEvent,
} from "./catalogue";
import { cn } from "@/lib/utils";

export type RaceBadgeProps = {
  className?: string;
  distanceId: string;
  eventId: string;
  size?: number;
  year: number;
};

export function RaceBadge({
  className,
  distanceId,
  eventId,
  size = 64,
  year,
}: RaceBadgeProps) {
  const event = findRaceEvent(eventId);
  const token = badgeToken(eventId);

  // An unknown event or distance still renders. A record is written once and
  // read forever; the catalogue is edited between deploys. Throwing here
  // would let a catalogue edit take down every profile holding an old
  // record — so the id itself becomes the label and the badge stays honest
  // about what it does not know.
  const distance = event ? findRaceDistance(event, distanceId) : undefined;
  const distanceLabel = distance?.label ?? distanceId.toUpperCase();
  const eventName = event?.name ?? eventId;
  const seriesLabel = event ? RACE_SERIES_LABELS[event.series] : "";

  const showYear = size >= BADGE_YEAR_MIN_SIZE;
  const title = `${eventName} — ${distanceLabel} ${year}`;

  return (
    <svg
      aria-label={title}
      className={cn("shrink-0", className)}
      data-distance-id={distanceId}
      data-event-id={eventId}
      data-testid="race-badge"
      data-year={year}
      height={size}
      role="img"
      viewBox={`0 0 ${BADGE_VIEWBOX} ${BADGE_VIEWBOX}`}
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>

      {renderBadgeArt(token, size)}

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
        fontSize={showYear ? 11 : 13}
        fontWeight={700}
        textAnchor="middle"
        x={BADGE_VIEWBOX / 2}
        y={BADGE_ART_HEIGHT + (BADGE_VIEWBOX - BADGE_ART_HEIGHT) / 2}
      >
        {showYear ? `${distanceLabel} ${year}` : distanceLabel}
      </text>

      {/* Series tag. Two marks rather than a label: at 32px a word is
          unreadable, but a corner shape still distinguishes the series. */}
      {event?.series === "utmb" && (
        <path d="M0 0 L14 0 L0 14 Z" fill={token.ink} opacity={0.9} />
      )}
      {event?.series === "wtm" && (
        <circle cx={6} cy={6} fill={token.ink} opacity={0.9} r={4} />
      )}
    </svg>
  );
}
