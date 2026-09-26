"use client";

import { motion, type Variants } from "framer-motion";
import { useMemo } from "react";
import type { ReactNode } from "react";

import { TimelineReveal } from "@/components/riders/TimelineMotion";
import { useDictionary } from "@/components/i18n/dictionary-provider";
import {
  LANE_COLORS,
  LANE_LIMITS,
  braidStrip,
  laneCount,
  laneOf,
  rowMeetings,
  type ClubLanes,
  type RowMeeting,
  type Strip,
  type StripGeometry,
} from "@/lib/riders/club-lanes";
import type { ClubTimelineRow } from "@/lib/riders/club-timeline";
import { rowAnchor } from "@/lib/riders/trail-map";
import { cn } from "@/lib/utils";

/**
 * The braided rail of 野馬營穿越時光 — `?view=braid`. The logic is in
 * `club-lanes.ts`; this file only draws what that returns.
 *
 * A STRIP PER BLOCK, NOT ONE SVG FOR THE RAIL. Every row and every year
 * heading carries its own slice of the lanes, stretched over its full height.
 * A card's height is whatever its content makes it and pages keep arriving as
 * the reader scrolls, so a single drawing would have to be measured and
 * redrawn; slices simply stack. A slice is a fixed-height bend at the top, a
 * stretch of straight lanes, and a fixed-height bend at the bottom — curves
 * never scale with the card, and straight lines do not need to.
 *
 * THE LIST HAS NO GAPS. The single rail spaces its rows with `space-y-5`; here
 * that space is bottom padding *inside* each block, so every strip reaches the
 * next one and the lanes read as continuous.
 *
 * TWO STRIPS PER BLOCK, ONE PER SCREEN WIDTH. A phone has room for four lanes
 * and a wide screen for six, and a lane's position is geometry, not something
 * CSS can re-flow. Both are rendered and a breakpoint shows one — the hidden
 * one never intersects the viewport, so it never animates either.
 *
 * WITHOUT JAVASCRIPT, AND ON PAPER, THE LANES ARE ALREADY IN PLACE. The final
 * geometry is what is server-rendered; only the drawing-in is animated. The
 * pieces that start hidden carry `data-braid-draw` (a stroke drawn from zero)
 * or `data-timeline-reveal` (a scale from zero), and the `<noscript>` block in
 * `ClubTimelineFeed` and `@media print` in globals.css force both to their
 * end state, the same way they already do for the single rail's rows.
 */

const GREY = "hsl(var(--muted-foreground))";

const NARROW: StripGeometry = { first: 8, gap: 12, bundle: 5 };
const WIDE: StripGeometry = { first: 12, gap: 18, bundle: 6 };

/** Where the card starts, clear of the widest set of lanes each screen draws. */
export const BRAID_CONTENT = "pl-[76px] sm:pl-[140px]";

/** Height of the bend at the top and bottom of every block. */
const BEND = 28;

const VIEWS = [
  { geometry: NARROW, limit: LANE_LIMITS.narrow, className: "flex sm:hidden" },
  { geometry: WIDE, limit: LANE_LIMITS.wide, className: "hidden sm:flex" },
] as const;

function colorOf(lane: number, own: number): string {
  return lane < own ? LANE_COLORS[lane] : GREY;
}

const draw: Variants = {
  hidden: { pathLength: 0 },
  shown: (delay: number) => ({
    pathLength: 1,
    transition: { delay, duration: 0.35, ease: "easeOut" },
  }),
};

const pop: Variants = {
  hidden: { scale: 0 },
  shown: { scale: 1, transition: { delay: 0.3, type: "spring", stiffness: 420, damping: 16 } },
};

const ripple: Variants = {
  hidden: { opacity: 0, scale: 0.6 },
  shown: {
    opacity: [0, 0.6, 0],
    scale: [0.6, 2.8],
    transition: { delay: 0.3, duration: 0.9, ease: "easeOut" },
  },
};

function Bend({
  colors,
  delay,
  from,
  to,
  width,
}: {
  colors: string[];
  delay: number;
  from: number[];
  to: number[];
  width: number;
}) {
  const path = (i: number) =>
    `M${from[i]} 0 C${from[i]} ${BEND / 2} ${to[i]} ${BEND / 2} ${to[i]} ${BEND}`;
  const moving = from.map((x, i) => x !== to[i]);

  return (
    <svg className="block shrink-0 overflow-visible" height={BEND} width={width}>
      {from.map((_, i) =>
        moving[i] ? null : (
          <path d={path(i)} fill="none" key={i} stroke={colors[i]} strokeWidth={2.5} />
        ),
      )}
      {/* The background-coloured halo is what makes a lane crossing another
          read as passing over it rather than as a junction. */}
      {from.map((_, i) =>
        moving[i] ? (
          <path
            d={path(i)}
            fill="none"
            key={`halo-${i}`}
            stroke="hsl(var(--background))"
            strokeWidth={7}
          />
        ) : null,
      )}
      {from.map((_, i) =>
        moving[i] ? (
          <motion.path
            custom={delay}
            d={path(i)}
            data-braid-draw=""
            fill="none"
            key={`lane-${i}`}
            stroke={colors[i]}
            strokeLinecap="round"
            strokeWidth={2.5}
            variants={draw}
          />
        ) : null,
      )}
    </svg>
  );
}

function StripView({
  bundle,
  className,
  colors,
  strip,
}: {
  bundle: number;
  className: string;
  colors: string[];
  strip: Strip;
}) {
  const width = Math.max(...strip.top, ...strip.mid, ...strip.bottom) + 12;
  const capsule = strip.capsule;
  const capsuleWidth = capsule ? (capsule.lanes - 1) * bundle + 14 : 0;

  return (
    <motion.div
      aria-hidden
      className={cn("pointer-events-none absolute inset-y-0 left-0 flex-col", className)}
      data-testid="braid-strip"
      initial="hidden"
      style={{ width }}
      viewport={{ amount: 0.3, once: true }}
      whileInView="shown"
    >
      <Bend colors={colors} delay={0} from={strip.top} to={strip.mid} width={width} />
      <div className="relative flex-1">
        {strip.mid.map((x, i) => (
          <span
            className="absolute inset-y-0"
            key={i}
            style={{ background: colors[i], left: x - 1.25, width: 2.5 }}
          />
        ))}
        {capsule && (
          <>
            <motion.span
              className="absolute border-[1.5px] border-foreground"
              style={{ height: 26, left: capsule.x - 13, top: "calc(50% - 13px)", width: 26 }}
              variants={ripple}
            />
            <motion.span
              className="absolute border-[2.5px] border-foreground bg-background"
              data-braid-meeting=""
              data-timeline-reveal=""
              style={{
                height: 26,
                left: capsule.x - capsuleWidth / 2,
                top: "calc(50% - 13px)",
                width: capsuleWidth,
              }}
              variants={pop}
            />
          </>
        )}
        {strip.node && (
          <motion.span
            // Square, like every node on the single rail — the design system
            // has no radius at all. A race is an outline and an article is
            // filled, which is the distinction shape would otherwise carry.
            className="absolute border-[2.5px]"
            data-timeline-reveal=""
            style={{
              background:
                strip.node.kind === "race" ? "hsl(var(--background))" : colors[strip.node.lane],
              borderColor: colors[strip.node.lane],
              height: 11,
              left: strip.node.x - 5.5,
              top: "calc(50% - 5.5px)",
              width: 11,
            }}
            variants={pop}
          />
        )}
      </div>
      <Bend colors={colors} delay={0.55} from={strip.mid} to={strip.bottom} width={width} />
    </motion.div>
  );
}

/** Who the lanes of one row belong to: everyone at its race, or its article's author. */
function participantsOf(row: ClubTimelineRow, meeting: RowMeeting | undefined): string[] {
  if (meeting) return meeting.runners;
  if (row.race) return row.race.runners.map((runner) => runner.slug);
  const author = row.posts[0]?.author;
  return author ? [author.slug] : [];
}

function Strips({
  club,
  meeting,
  row,
}: {
  club: ClubLanes;
  meeting?: RowMeeting;
  row?: ClubTimelineRow;
}) {
  return (
    <>
      {VIEWS.map(({ className, geometry, limit }) => {
        const count = laneCount(club, limit);
        const own = Math.min(club.lanes.length, limit);
        const colors = Array.from({ length: count }, (_, lane) => colorOf(lane, own));
        const participants = row
          ? participantsOf(row, meeting).map((slug) => laneOf(club.lanes, limit, slug))
          : [];
        const strip = braidStrip({
          count,
          geometry,
          kind: row?.race ? "race" : row?.posts.length ? "post" : undefined,
          meeting,
          participants,
        });
        return (
          <StripView
            bundle={geometry.bundle}
            className={className}
            colors={colors}
            key={limit}
            strip={strip}
          />
        );
      })}
    </>
  );
}

/**
 * The colour key: one entry per lane, and the grey lane if anyone is in it.
 *
 * The fifth and sixth members only have a colour of their own on a wide
 * screen, so their entries — and the grey entry, when only they would be in
 * it — follow the same breakpoint as the strips.
 */
export function BraidLegend({ club }: { club: ClubLanes }) {
  const t = useDictionary();
  const greyNarrow = laneCount(club, LANE_LIMITS.narrow) > Math.min(club.lanes.length, LANE_LIMITS.narrow);
  const greyWide = club.others;

  return (
    <ul
      className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground"
      data-testid="braid-legend"
    >
      {club.lanes.map((lane, index) => (
        <li
          className={cn(
            "items-center gap-1.5",
            index < LANE_LIMITS.narrow ? "flex" : "hidden sm:flex",
          )}
          data-lane-slug={lane.slug}
          key={lane.slug}
        >
          <span aria-hidden className="h-[3px] w-4" style={{ background: LANE_COLORS[index] }} />
          {lane.name}
        </li>
      ))}
      {(greyNarrow || greyWide) && (
        <li
          className={cn(
            "items-center gap-1.5",
            greyNarrow && greyWide ? "flex" : greyNarrow ? "flex sm:hidden" : "hidden sm:flex",
          )}
        >
          <span aria-hidden className="h-[3px] w-4" style={{ background: GREY }} />
          {t.clubTimeline.otherMembers}
        </li>
      )}
    </ul>
  );
}

/**
 * The rail itself. Rows are rendered by the caller — the same `Row` the single
 * rail uses — so a card looks the same in both views and only the space to its
 * left differs.
 */
export function BraidRail({
  club,
  renderRow,
  renderYear,
  rows,
}: {
  club: ClubLanes;
  renderRow: (row: ClubTimelineRow, meeting: boolean) => ReactNode;
  renderYear: (year: number) => ReactNode;
  rows: ClubTimelineRow[];
}) {
  const meetings = useMemo(() => rowMeetings(rows), [rows]);
  let lastYear: number | null = null;

  return (
    <ol>
      {rows.map((row, index) => {
        const startsYear = row.year !== lastYear;
        lastYear = row.year;
        const meeting = meetings.get(row.key);

        return (
          // An anchor for the homepage map's links, clear of the sticky header.
          <li className="scroll-mt-24" id={rowAnchor(row.key)} key={row.key}>
            {startsYear && (
              <div className={cn("relative pb-5", index > 0 && "pt-6")}>
                <Strips club={club} />
                <TimelineReveal className={BRAID_CONTENT}>{renderYear(row.year)}</TimelineReveal>
              </div>
            )}
            <div className="relative pb-5">
              <Strips club={club} meeting={meeting} row={row} />
              <TimelineReveal
                className={BRAID_CONTENT}
                delay={Math.min(index % 6, 4) * 0.05}
              >
                {renderRow(row, Boolean(meeting))}
              </TimelineReveal>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
