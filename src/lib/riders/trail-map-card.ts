import { LANE_COLORS } from "@/lib/riders/club-lanes";
import { TRAIL, type TrailMapData } from "@/lib/riders/trail-map";

/**
 * The 交會地圖 as one still picture, for 穿越時光's share card
 * (`/og/timeline`): the frame `TrailMap` server-renders and holds at the end
 * of every loop — every trail drawn, every meeting marked, every runner at
 * the right-hand edge. Same geometry, same colours, from the same
 * `buildTrailMap` data, so the card is the homepage's map rather than a
 * drawing of one.
 *
 * WHAT DIFFERS FROM THE COMPONENT, and why:
 *   - No `vector-effect: non-scaling-stroke`. On the page it keeps lines 3px
 *     however wide the map is; on a card that is always 1920 wide, widths in
 *     drawing units scale with the map, which is what keeps the proportions
 *     the page has at its usual size.
 *   - No year labels. The card's rasteriser has no fonts inside an SVG image,
 *     so text here would silently vanish; `/og/timeline` sets them as its own
 *     type, under the axis, at `years[].from`/`to`.
 *   - No faint route-ahead: in the last frame the full trails cover it.
 *
 * A data URI, like `markDataUri`: no fetch, no asset, nothing to fail.
 */

const PANEL = "#201E1D";

export function trailMapSvg(data: TrailMapData): string {
  const parts: string[] = [];

  for (const year of data.years.slice(1)) {
    parts.push(
      `<line x1="${year.from}" x2="${year.from}" y1="8" y2="${data.axis}" stroke="#35312F" stroke-width="1" stroke-dasharray="3 6"/>`,
    );
  }
  parts.push(
    `<line x1="${TRAIL.x0}" x2="${TRAIL.x1}" y1="${data.axis}" y2="${data.axis}" stroke="#4A4543" stroke-width="1"/>`,
  );

  for (const member of data.members) {
    parts.push(
      `<path d="${member.path}" fill="none" stroke="${LANE_COLORS[member.lane]}" stroke-width="3" stroke-linecap="round"/>`,
    );
  }
  for (const node of data.nodes) {
    parts.push(
      `<circle cx="${node.x}" cy="${node.y}" r="5" fill="${PANEL}" stroke="${LANE_COLORS[node.lane]}" stroke-width="2"/>`,
    );
  }
  for (const meeting of data.meetings) {
    parts.push(
      `<circle cx="${meeting.x}" cy="${meeting.y}" r="12" fill="${PANEL}" stroke="#F3F2F2" stroke-width="2"/>`,
      `<circle cx="${meeting.x}" cy="${meeting.y}" r="4" fill="#F3F2F2"/>`,
    );
  }
  for (const member of data.members) {
    const end = member.points[member.points.length - 1][1];
    parts.push(
      `<circle cx="${TRAIL.x1}" cy="${end}" r="9" fill="${LANE_COLORS[member.lane]}" stroke="${PANEL}" stroke-width="3"/>`,
    );
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TRAIL.width} ${data.height}">` +
    parts.join("") +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
