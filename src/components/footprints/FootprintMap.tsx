"use client";

import { useEffect, useRef, useState } from "react";

import Link from "@/components/i18n/locale-link";
import { useDictionary } from "@/components/i18n/dictionary-provider";
import { useSiteMusic } from "@/components/music/SiteMusic";
import {
  createPinger,
  readSoundPreference,
  writeSoundPreference,
  type Pinger,
} from "@/components/footprints/landing-ping";
import { startPlayback } from "@/components/footprints/playback";
import { countLabel } from "@/lib/i18n/count";
import { VIEWBOX, flightPath, shouldPing, type FootprintStop } from "@/lib/footprints/footprints";
import { WORLD_DOTS_PATH } from "@/lib/footprints/world-dots";
import { rowAnchor } from "@/lib/riders/trail-map";
import { cn } from "@/lib/utils";

/**
 * 野馬足跡: the club's races, flown oldest first over a map made of dots.
 *
 * WHAT THE SERVER SENDS IS WHAT A CARD SHOWS and nothing else — a stop's name,
 * date, place and head-count. Never an owner, never a runner's slug: the
 * rows behind a stop carry people, and a client component's props are public.
 *
 * THREE LAYERS, ONE OWNER EACH. React draws the land (a single `<path>`, so a
 * page of two thousand dots is one node) and the lists. The three `<g>` layers
 * above it are empty as far as React is concerned and `playback.ts` fills them
 * — see its header for why an animation is not state. Only in reduced-motion
 * does React draw into the trail layer, and then the finished trail all at
 * once, since a visitor who asked for stillness gets the whole picture rather
 * than a lap they cannot see.
 *
 * IT STARTS BY ITSELF AND NEVER ENDS, silent. Sound is the one thing a page
 * may not start (see landing-ping.ts), so the switch next to the map begins
 * off — or on, for a visitor who has already pressed the site's play button,
 * since that press was the gesture. The map does not wait for the music.
 *
 * THE SERVER RENDERS THE LAND AND THE LIST, NOT A TRAIL. Whether a visitor
 * prefers reduced motion is only known in the browser, and drawing a static
 * trail on the server just to remove it on mount is a flash for everyone who
 * did not ask for it. Without JavaScript the `<ol>` is the content.
 */

export type MapStop = Pick<
  FootprintStop,
  "key" | "rowKey" | "eventId" | "year" | "name" | "day" | "location" | "runners" | "x" | "y"
>;

/** What an admin sees for a race the map has no coordinate for. */
export type UnplacedStop = { key: string; name: string; year: number };

const DOT_COLOR = "hsl(var(--muted-foreground))";
const PRIMARY = "hsl(var(--primary))";

function timelineHref(rowKey: string): string {
  return `/riders/timeline?at=${encodeURIComponent(rowKey)}#${rowAnchor(rowKey)}`;
}

function SoundIcon({ on }: { on: boolean }) {
  return (
    <svg aria-hidden className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 16 16">
      <path d="M2 6h3l4-3v10L5 10H2z" fill="currentColor" stroke="none" />
      {on ? (
        <path d="M11.5 5.5a3.5 3.5 0 010 5M13 3.5a6 6 0 010 9" strokeLinecap="round" />
      ) : (
        <path d="M11.5 6l3 4M14.5 6l-3 4" strokeLinecap="round" />
      )}
    </svg>
  );
}

export function FootprintMap({
  stops,
  unplacedCount,
  unplaced,
}: {
  stops: MapStop[];
  unplacedCount: number;
  /** Present for admins only. */
  unplaced?: UnplacedStop[];
}) {
  const t = useDictionary();
  const music = useSiteMusic();

  // `null` until the browser has been asked; see the header.
  const [reduced, setReduced] = useState<boolean | null>(null);
  const [current, setCurrent] = useState(-1);
  const [soundPreference, setSoundPreference] = useState<boolean | null>(null);

  const glow = useRef<SVGGElement>(null);
  const trail = useRef<SVGGElement>(null);
  const fx = useRef<SVGGElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const pinger = useRef<Pinger | null>(null);

  // The visitor's switch if they have ever used it, otherwise "on" exactly
  // when the music is: pressing play was the gesture that allows sound.
  const enabled = soundPreference ?? music.started;
  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    // Read after mount: localStorage is not there on the server, and a state
    // initialised from it would hydrate to something the markup never had.
    setSoundPreference(readSoundPreference());
    const own = createPinger();
    pinger.current = own;
    return () => {
      own.dispose();
      pinger.current = null;
    };
  }, []);

  // Wake the audio context at the earliest moment the browser allows. With
  // the music already playing there has been a gesture and this works at
  // once; on a reload with the switch left on, the first tap or key press
  // anywhere does it.
  useEffect(() => {
    if (!enabled) return;
    pinger.current?.unlock();
    const unlock = () => pinger.current?.unlock();
    window.addEventListener("pointerdown", unlock, { capture: true });
    window.addEventListener("keydown", unlock, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", unlock, { capture: true });
      window.removeEventListener("keydown", unlock, { capture: true });
    };
  }, [enabled]);

  useEffect(() => {
    if (reduced !== false || stops.length === 0) return;
    if (!glow.current || !trail.current || !fx.current || !frame.current) return;

    const playback = startPlayback(
      { glow: glow.current, trail: trail.current, fx: fx.current },
      stops,
      {
        onLand: setCurrent,
        onPing: () => {
          const own = pinger.current;
          if (own && shouldPing({ enabled: enabledRef.current, unlocked: own.unlocked, reducedMotion: false })) {
            own.ping();
          }
        },
      },
    );

    // Runs only while somebody could be looking: tab shown, map on screen.
    let onScreen = true;
    const update = () => playback.setRunning(onScreen && !document.hidden);
    const observer = new IntersectionObserver((entries) => {
      onScreen = entries[entries.length - 1]?.isIntersecting ?? true;
      update();
    });
    observer.observe(frame.current);
    document.addEventListener("visibilitychange", update);
    update();

    return () => {
      document.removeEventListener("visibilitychange", update);
      observer.disconnect();
      playback.destroy();
      setCurrent(-1);
    };
  }, [reduced, stops]);

  const shown = reduced === false && current >= 0 ? stops[current] : undefined;

  return (
    <section data-mode={reduced === null ? "idle" : reduced ? "static" : "playing"} data-testid="footprint-map">
      <div className="mt-6 flex items-center justify-end gap-2 print:hidden">
        {!music.started && (
          // Only ever the way in, as on the timeline: the first press hands
          // over to the corner button that `SiteMusic` shows on every page.
          <button
            className="hit-area inline-flex min-h-9 items-center gap-1.5 border border-border bg-background px-3 text-tag text-muted-foreground transition-colors hover:text-foreground"
            data-music-control=""
            data-testid="footprint-play-music"
            onClick={(event) => music.play(event.currentTarget)}
            type="button"
          >
            <svg aria-hidden className="h-3 w-3" viewBox="0 0 12 12">
              <path d="M2 1l9 5-9 5z" fill="currentColor" />
            </svg>
            {t.footprints.playMusic}
          </button>
        )}
        {reduced === false && stops.length > 0 && (
          <button
            aria-pressed={enabled}
            className="hit-area inline-flex min-h-9 items-center gap-1.5 border border-border bg-background px-3 text-tag text-muted-foreground transition-colors hover:text-foreground"
            data-testid="footprint-sound"
            onClick={() => {
              const next = !enabled;
              setSoundPreference(next);
              writeSoundPreference(next);
              // The press is the gesture; wake the context inside it.
              if (next) pinger.current?.unlock();
            }}
            type="button"
          >
            <SoundIcon on={enabled} />
            {enabled ? t.footprints.soundOn : t.footprints.soundOff}
          </button>
        )}
      </div>

      <div
        className="mt-3 border border-border bg-background"
        data-testid="footprint-frame"
        ref={frame}
      >
        <svg
          aria-label={t.footprints.mapAria}
          className="block h-auto w-full"
          role="img"
          viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
        >
          <path
            d={WORLD_DOTS_PATH}
            fill="none"
            stroke={DOT_COLOR}
            strokeLinecap="round"
            strokeOpacity={0.35}
            strokeWidth={1.2}
          />
          <g ref={glow} />
          <g ref={trail}>
            {reduced === true && (
              <>
                {stops.slice(1).flatMap((stop, i) =>
                  flightPath(stops[i], stop).map((d, part) => (
                    <path
                      d={d}
                      data-testid="footprint-arc"
                      fill="none"
                      key={`${stop.key}:${part}`}
                      opacity={0.6}
                      stroke={PRIMARY}
                      strokeLinecap="round"
                      strokeWidth={0.6}
                    />
                  )),
                )}
                {stops.map((stop) => (
                  <circle cx={stop.x} cy={stop.y} data-testid="footprint-pin" fill={PRIMARY} key={stop.key} r={1.8} />
                ))}
              </>
            )}
          </g>
          <g ref={fx} />
        </svg>
      </div>

      {/* Below the map at every width: over it, on a phone, the card would
          hide the stop it is describing. Its height is fixed so that the
          list underneath does not jump on each landing. */}
      {reduced !== true && (
        <div className="mt-3 min-h-24 border border-border bg-background p-4" data-testid="footprint-card">
          {shown && (
            <>
              <p className="text-lg font-bold leading-snug">{shown.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {shown.day ?? t.clubTimeline.year.replace("{year}", String(shown.year))}
                {shown.location ? ` · ${shown.location}` : ""}
                {" · "}
                {countLabel(t.footprints.runnerCount, shown.runners)}
              </p>
              <Link
                className="mt-2 inline-block text-sm text-primary hover:underline"
                data-testid="footprint-card-link"
                href={timelineHref(shown.rowKey)}
              >
                {t.footprints.openRow}
              </Link>
            </>
          )}
        </div>
      )}

      {stops.length === 0 && (
        <p className="mt-6 text-muted-foreground" data-testid="footprint-empty">
          {t.footprints.empty}
        </p>
      )}

      {unplacedCount > 0 && (
        <div className="mt-4 text-sm text-muted-foreground" data-testid="footprint-unplaced">
          <p>{countLabel(t.footprints.unplaced, unplacedCount)}</p>
          {unplaced && unplaced.length > 0 && (
            <div className="mt-2">
              <p>
                {t.footprints.unplacedAdmin} ·{" "}
                {/* A document navigation on purpose: /admin is Payload's own app
                    under a different root layout, not a page of this one. */}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a className="text-primary hover:underline" href="/admin">
                  {t.footprints.unplacedAdminLink}
                </a>
              </p>
              <ul className="mt-1 list-disc pl-5">
                {unplaced.map((stop) => (
                  <li key={stop.key}>
                    {stop.year} · {stop.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {stops.length > 0 && (
        <>
          <h2 className="mt-10 text-xl font-bold">{t.footprints.listTitle}</h2>
          <ol aria-label={t.footprints.listAria} className="mt-4 border-t border-border" data-testid="footprint-list">
            {stops.map((stop, index) => {
              const isCurrent = index === current;
              return (
                <li
                  aria-current={isCurrent ? "true" : undefined}
                  className={cn(
                    "flex items-baseline gap-3 border-b border-border px-2 py-2 text-sm transition-colors",
                    isCurrent && "bg-secondary",
                  )}
                  data-current={isCurrent ? "true" : "false"}
                  data-event-id={stop.eventId}
                  data-stop-key={stop.key}
                  data-testid="footprint-stop"
                  data-year={stop.year}
                  key={stop.key}
                >
                  <span aria-hidden className="w-7 shrink-0 text-right tabular-nums text-muted-foreground">
                    {index + 1}
                  </span>
                  <Link className="font-bold hover:text-primary" href={timelineHref(stop.rowKey)}>
                    {stop.name}
                  </Link>
                  <span className="ml-auto shrink-0 text-muted-foreground">
                    {stop.day ?? stop.year}
                    {stop.location ? ` · ${stop.location}` : ""}
                  </span>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}
