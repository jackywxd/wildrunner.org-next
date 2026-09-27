import { ImageResponse } from "next/og";

import { siteConfig } from "@/config/site";
import { markDataUri } from "@/lib/brand-mark";
import { getClubTimelineRows } from "@/lib/content";
import { bufferOgImage, loadOgFont } from "@/lib/og-render";
import { assignLanes } from "@/lib/riders/club-lanes";
import { TRAIL, buildTrailMap } from "@/lib/riders/trail-map";
import { trailMapSvg } from "@/lib/riders/trail-map-card";

/**
 * 穿越時光's share card: the homepage's 交會地圖 on the map's own dark panel,
 * under the page's title.
 *
 * ITS OWN ROUTE RATHER THAN A TREATMENT OF `/og`, because it is the one card
 * drawn from the database: the map is the club's real trails, built exactly
 * as the homepage builds them (`buildTrailMap` over `assignLanes`), so the
 * card shows who has actually run together. Everything else about a card —
 * the title and byline, the lockup, the size — is `/og`'s, and matches it.
 *
 * Dynamic, not prerendered: `next build` connects to the production database
 * (AGENTS.md), and a card baked at build time would show the trails as they
 * were on the day of the last deploy.
 */

export const dynamic = "force-dynamic";

const WIDTH = 1920;
const HEIGHT = 1080;
const PAD_X = 104;
const PANEL = "#201E1D";
const INK = "#F3F2F2";
const MUTED = "#9A9492";

/** Where the map may sit: below the header, above the bottom margin. */
const MAP_TOP = 400;
const MAP_BOTTOM = HEIGHT - 72;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const title = url.searchParams.get("title") || siteConfig.title;
  const subtitle = url.searchParams.get("subtitle") || siteConfig.description;

  const rows = await getClubTimelineRows({ media: false, posts: false });
  const trail = buildTrailMap({
    club: assignLanes(rows),
    rows,
    thisYear: new Date().getUTCFullYear(),
  });
  const map = trail && trail.meetings.length > 0 ? trail : null;

  // As large as the space allows, never wider than the card's margins.
  const scale = map
    ? Math.min((WIDTH - PAD_X * 2) / TRAIL.width, (MAP_BOTTOM - MAP_TOP) / map.height)
    : 0;
  const mapWidth = map ? TRAIL.width * scale : 0;
  const mapLeft = (WIDTH - mapWidth) / 2;
  // Centred in the space under the header, whichever way the fit ran out.
  const mapTop = map ? MAP_TOP + (MAP_BOTTOM - MAP_TOP - map.height * scale) / 2 : MAP_TOP;

  const fontData = await loadOgFont(request);

  const image = new ImageResponse(
    (
      <div
        tw="flex w-full h-full relative"
        style={{ background: PANEL, fontFamily: fontData ? "Inter" : "sans-serif" }}
      >
        <div tw="flex flex-col absolute" style={{ left: PAD_X, top: 88 }}>
          <div tw="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse requires img */}
            <img src={markDataUri(INK)} alt="" width={72} height={72} />
            <span style={{ color: INK, fontSize: 44, letterSpacing: "0.06em", marginLeft: 20 }}>
              野馬營
            </span>
          </div>
          <span
            style={{ color: INK, fontSize: 96, letterSpacing: "-0.03em", lineHeight: 1.14, marginTop: 40 }}
          >
            {title}
          </span>
          <span style={{ color: MUTED, fontSize: 34, letterSpacing: "0.01em", marginTop: 12 }}>
            {subtitle}
          </span>
        </div>

        {map ? (
          // eslint-disable-next-line @next/next/no-img-element -- ImageResponse requires img
          <img
            src={trailMapSvg(map)}
            alt=""
            width={mapWidth}
            height={map.height * scale}
            tw="absolute"
            style={{ left: mapLeft, top: mapTop }}
          />
        ) : null}

        {/* The years, set here rather than in the SVG — see trail-map-card.ts. */}
        {map?.years.map((year) => (
          <span
            key={year.year}
            tw="absolute flex justify-center"
            style={{
              color: MUTED,
              fontSize: 22 * scale,
              left: mapLeft + year.from * scale,
              top: mapTop + (map.axis + 6) * scale,
              width: (year.to - year.from) * scale,
            }}
          >
            {year.year}
          </span>
        ))}
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: {
        // The trails change when somebody records a race: a day is plenty.
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
      fonts: fontData ? [{ name: "Inter", data: fontData, style: "normal" }] : undefined,
    },
  );

  return bufferOgImage(image);
}
