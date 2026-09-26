"use client";

import { useEffect, useId, useRef, useState } from "react";

import Link from "@/components/i18n/locale-link";
import { useDictionary } from "@/components/i18n/dictionary-provider";
import { LANE_COLORS } from "@/lib/riders/club-lanes";
import {
  PAUSE,
  TRAIL,
  rowAnchor,
  trailClock,
  yAt,
  type TrailMapData,
} from "@/lib/riders/trail-map";

/**
 * The homepage's 交會地圖. Where everything goes is decided in
 * `trail-map.ts`; this file moves the dots.
 *
 * THE SERVER RENDERS THE LAST FRAME: every trail drawn, every meeting marked,
 * every runner at the right-hand edge. That is what a reader without
 * JavaScript sees, and what one who asked for reduced motion keeps. The loop
 * starts only after mount — so server and client render the same markup, and
 * nothing hydrates into a different state than it was sent in.
 *
 * ONE CLOCK, DRIVEN BY `requestAnimationFrame`, WRITING TO THE SVG DIRECTLY.
 * Sixty React renders a second to move four circles would be the expensive
 * way to do it; the caption is the only piece of state, and it changes once
 * per meeting. The loop also stops whenever the map is off screen.
 */

/** Seconds the finished map is held before it fades and starts again. */
const HOLD = 2.5;
const FADE = 0.6;
const PANEL = "#201E1D";

function draw(
  svg: SVGSVGElement,
  data: TrailMapData,
  clock: ReturnType<typeof trailClock>,
  t: number,
) {
  const x = t < clock.end ? clock.xAt(t) : TRAIL.x1;
  svg.querySelector("[data-trail-clip]")?.setAttribute("width", String(x));

  data.members.forEach((member, i) => {
    const dot = svg.querySelector(`[data-trail-dot="${i}"]`);
    dot?.setAttribute("cx", String(x));
    dot?.setAttribute("cy", String(yAt(member.points, x)));
  });

  data.meetings.forEach((meeting, i) => {
    const since = t - clock.arrive[i];
    const marker = svg.querySelector(`[data-trail-meeting="${i}"]`);
    const ring = svg.querySelector(`[data-trail-ring="${i}"]`);
    // A quick overshoot on arrival, then still.
    const grow = since < 0 ? 0 : since < 0.15 ? (since / 0.15) * 1.3 : since < 0.3 ? 1.3 - ((since - 0.15) / 0.15) * 0.3 : 1;
    marker?.setAttribute(
      "transform",
      `translate(${meeting.x} ${meeting.y}) scale(${grow}) translate(${-meeting.x} ${-meeting.y})`,
    );
    const p = since / PAUSE;
    ring?.setAttribute("r", String(12 + Math.max(0, Math.min(p, 1)) * 26));
    ring?.setAttribute("opacity", String(p >= 0 && p < 1 ? 0.8 * (1 - p) : 0));
  });

  const fading = t - clock.end - HOLD;
  svg
    .querySelector("[data-trail-stage]")
    ?.setAttribute("opacity", String(fading > 0 ? Math.max(0, 1 - fading / FADE) : 1));
}

export function TrailMap({
  data,
  eventNames,
}: {
  data: TrailMapData;
  /** Each drawn meeting's race, by event id, already in the reader's script. */
  eventNames: Record<string, string>;
}) {
  const t = useDictionary();
  const svgRef = useRef<SVGSVGElement>(null);
  // -1 is "no meeting yet": the hint, which is also the server's frame.
  const [current, setCurrent] = useState(-1);
  const clip = `trail-${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  const nameOf = new Map(data.members.map((member) => [member.slug, member.name]));

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const clock = trailClock(data.meetings);
    const cycle = clock.end + HOLD + FADE;
    let elapsed = 0;
    let last = 0;
    let frame = 0;
    let visible = false;
    let shown = -1;

    const tick = (now: number) => {
      frame = 0;
      if (!visible) return;
      // Capped, so returning to a background tab resumes rather than jumps.
      elapsed = (elapsed + Math.min((now - last) / 1000, 0.1)) % cycle;
      last = now;
      draw(svg, data, clock, elapsed);

      let reached = -1;
      clock.arrive.forEach((at, i) => {
        if (elapsed >= at) reached = i;
      });
      if (elapsed > clock.end + HOLD) reached = -1;
      if (reached !== shown) {
        shown = reached;
        setCurrent(reached);
      }
      frame = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !frame) {
        last = performance.now();
        frame = requestAnimationFrame(tick);
      }
    });
    observer.observe(svg);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      // Back to the frame the server sent, for whatever mounts next.
      draw(svg, data, clock, cycle - FADE - 0.01);
      setCurrent(-1);
    };
  }, [data]);

  const meeting = current >= 0 ? data.meetings[current] : undefined;
  const lastYear = data.years[data.years.length - 1]?.year;
  const summary = t.home.trailSummary
    .replace("{members}", String(data.members.length))
    .replace("{meetings}", String(data.meetings.length))
    .replace("{from}", String(data.years[0]?.year))
    .replace("{to}", String(lastYear));

  return (
    <figure className="m-0" data-testid="home-trail-map">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-base font-extrabold">{t.home.timeline}</span>
        <span className="text-xs text-muted-foreground" data-testid="home-trail-summary">
          {summary}
        </span>
      </div>

      <div style={{ background: PANEL, color: "#F3F2F2" }}>
        <svg
          aria-label={summary}
          className="block h-auto w-full"
          ref={svgRef}
          role="img"
          viewBox={`0 0 ${TRAIL.width} ${data.height}`}
        >
          <defs>
            <clipPath id={clip}>
              <rect data-trail-clip="" height={data.height} width={TRAIL.width} x={0} y={0} />
            </clipPath>
          </defs>

          {data.years.slice(1).map((year) => (
            <line
              key={year.year}
              stroke="#35312F"
              strokeDasharray="3 6"
              vectorEffect="non-scaling-stroke"
              x1={year.from}
              x2={year.from}
              y1={8}
              y2={data.axis}
            />
          ))}
          <line
            stroke="#4A4543"
            vectorEffect="non-scaling-stroke"
            x1={TRAIL.x0}
            x2={TRAIL.x1}
            y1={data.axis}
            y2={data.axis}
          />
          {data.years.map((year) => (
            <text
              fill="#9A9492"
              fontSize={22}
              fontWeight={600}
              key={year.year}
              textAnchor="middle"
              x={(year.from + year.to) / 2}
              y={data.axis + 26}
            >
              {year.year}
            </text>
          ))}

          {/* The route ahead, faint, so the reader sees where everyone is going. */}
          {data.members.map((member) => (
            <path
              d={member.path}
              fill="none"
              key={member.slug}
              opacity={0.4}
              stroke={LANE_COLORS[member.lane]}
              strokeDasharray="2 6"
              strokeLinecap="round"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <g data-trail-stage="">
            <g clipPath={`url(#${clip})`}>
              {data.members.map((member) => (
                <path
                  d={member.path}
                  fill="none"
                  key={member.slug}
                  stroke={LANE_COLORS[member.lane]}
                  strokeLinecap="round"
                  strokeWidth={3}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>

            {data.nodes.map((node, i) => (
              <circle
                cx={node.x}
                cy={node.y}
                fill={PANEL}
                key={i}
                r={5}
                stroke={LANE_COLORS[node.lane]}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {data.meetings.map((item, i) => (
              <circle
                cx={item.x}
                cy={item.y}
                data-trail-ring={i}
                fill="none"
                key={`ring-${item.rowKey}`}
                opacity={0}
                r={12}
                stroke="#F3F2F2"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {data.meetings.map((item, i) => (
              <g data-trail-meeting={i} key={item.rowKey}>
                <circle
                  cx={item.x}
                  cy={item.y}
                  fill={PANEL}
                  r={12}
                  stroke="#F3F2F2"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
                <circle cx={item.x} cy={item.y} fill="#F3F2F2" r={4} />
              </g>
            ))}

            {data.members.map((member, i) => (
              <circle
                cx={TRAIL.x1}
                cy={member.points[member.points.length - 1][1]}
                data-trail-dot={i}
                fill={LANE_COLORS[member.lane]}
                key={member.slug}
                r={9}
                stroke={PANEL}
                strokeWidth={3}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        </svg>

        <figcaption
          className="flex min-h-[3.5rem] items-center border-t px-3 py-2 text-sm leading-snug"
          data-testid="home-trail-caption"
          style={{ borderColor: "#35312F" }}
        >
          {meeting ? (
            <Link
              className="flex w-full items-center justify-between gap-3 hover:underline"
              data-testid="home-trail-meeting"
              href={`/riders/timeline?view=braid&at=${encodeURIComponent(meeting.rowKey)}#${rowAnchor(meeting.rowKey)}`}
            >
              <span>
                <span className="font-bold">
                  {meeting.year} · {eventNames[meeting.eventId] ?? meeting.eventId}
                </span>
                <br />
                {meeting.runners.map((slug) => nameOf.get(slug)).join(" × ")}
              </span>
              <span aria-hidden>→</span>
            </Link>
          ) : (
            <Link
              className="text-[#C9C4C2] hover:underline"
              data-testid="home-trail-braid-link"
              href="/riders/timeline?view=braid"
            >
              {t.home.trailHint}
            </Link>
          )}
        </figcaption>
      </div>

      <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {data.members.map((member) => (
          <li className="flex items-center gap-1.5" key={member.slug}>
            <span
              aria-hidden
              className="h-2.5 w-2.5"
              style={{ background: LANE_COLORS[member.lane] }}
            />
            {member.name}
          </li>
        ))}
      </ul>
    </figure>
  );
}
