"use client";

import { useEffect, useRef, useState } from "react";

import { useDictionary } from "@/components/i18n/dictionary-provider";
import { useSiteMusic } from "@/components/music/SiteMusic";

/**
 * 播放 — the club rail as something to sit back and watch: the site's music
 * starts (`SiteMusic`, which plays on from page to page and with the screen
 * locked) and this page drifts slowly down through the years.
 *
 * THE MUSIC IS THE SITE'S, THE DRIFT IS THIS PAGE'S. Leaving the timeline
 * stops the drift — there is nothing of it to scroll anywhere else — and the
 * music carries on, with its own button in the corner. Pausing the music,
 * from here, from that button or from the lock screen, stops the drift too:
 * the two start together, and moving without the music is not what anyone
 * asked for.
 *
 * THE DRIFT IS haijieliu.com's, for the iOS reasons its comments measure:
 *   - the position is accumulated here and written to `scrollTop`, never read
 *     back from it — on iOS a programmatic scroll reads back unclamped, so the
 *     page never appears to stop;
 *   - it turns back short of the very end, where pressing against it brings
 *     Safari's toolbar back out;
 *   - readers who have asked their system for reduced motion get the music
 *     without the movement.
 *
 * WHAT DIFFERS: the rail grows as it is scrolled (`ClubTimelineFeed` loads the
 * next page from a sentinel near the bottom), so reaching the end while the
 * sentinel exists means waiting for more, not turning round. And the reader's
 * own scrolling holds the drift for a moment rather than ending it: it picks
 * up again from wherever they left it.
 */

/** Slow enough to read a card as it passes — about ten seconds a card. */
const PX_PER_SECOND = 16;
/** How far short of the very end the drift stops (see above). */
const END_MARGIN = 24;
/** How long after the reader's own scrolling the drift waits to resume. */
const RESUME_AFTER = 1500;

const SCROLL_KEYS = new Set(["ArrowDown", "ArrowUp", "End", "Home", "PageDown", "PageUp", " "]);

function drift(onEnd: () => void): () => void {
  const scroller = document.scrollingElement;
  if (!scroller) return () => {};

  let position = scroller.scrollTop;
  let last = performance.now();
  let heldUntil = 0;
  let frame = requestAnimationFrame(function step(now) {
    const elapsed = Math.min(now - last, 100);
    last = now;
    if (now < heldUntil) {
      // The reader has the page: follow them, and set off from where they stop.
      position = scroller.scrollTop;
    } else {
      // Worked out afresh each frame: the rail grows as pages load.
      const end = Math.max(0, scroller.scrollHeight - window.innerHeight - END_MARGIN);
      position = Math.min(position + (elapsed / 1000) * PX_PER_SECOND, end);
      scroller.scrollTop = position;
      if (position >= end && !document.querySelector('[data-testid="club-timeline-sentinel"]')) {
        stop();
        onEnd();
        return;
      }
    }
    frame = requestAnimationFrame(step);
  });

  // Scroll events cannot say who moved the page — the drift fires them too —
  // so the reader taking over is read from their input instead. Pressing the
  // music's own buttons is not reaching for the page.
  const hold = (event: Event) => {
    if (event.target instanceof Element && event.target.closest("[data-music-control]")) return;
    heldUntil = performance.now() + RESUME_AFTER;
  };
  const onKey = (event: KeyboardEvent) => {
    if (SCROLL_KEYS.has(event.key)) hold(event);
  };
  const inputs = ["wheel", "touchmove"] as const;
  inputs.forEach((type) => window.addEventListener(type, hold, { passive: true }));
  window.addEventListener("keydown", onKey);

  function stop() {
    cancelAnimationFrame(frame);
    inputs.forEach((type) => window.removeEventListener(type, hold));
    window.removeEventListener("keydown", onKey);
  }
  return stop;
}

export function TimelinePlayer() {
  const t = useDictionary();
  const music = useSiteMusic();
  // Whether this page should be drifting. Only this button starts it: arriving
  // here with the music already on from another page does not move the page
  // out from under the reader.
  const [drifting, setDrifting] = useState(false);

  // Stopped when somebody pauses the music — from anywhere — and when leaving
  // the page. Counted pauses, not `!playing`: a browser that cannot play the
  // file ends up paused too, and should still drift.
  const pauses = useRef(music.pauses);
  useEffect(() => {
    if (music.pauses === pauses.current) return;
    pauses.current = music.pauses;
    setDrifting(false);
  }, [music.pauses]);

  useEffect(() => {
    if (!drifting) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    return drift(() => setDrifting(false));
  }, [drifting]);

  // Either is "on": a browser that cannot play the file still drifts, and
  // the button must still be the way to stop it.
  const active = music.playing || drifting;

  return (
    <button
      aria-pressed={active}
      className="border border-border bg-background hit-area inline-flex min-h-9 items-center gap-1.5 px-3 text-tag text-muted-foreground transition-colors hover:text-foreground aria-pressed:border-foreground aria-pressed:text-foreground"
      data-music-control=""
      data-testid="club-timeline-play"
      onClick={() => {
        if (active) {
          music.pause();
          setDrifting(false);
        } else {
          music.play();
          setDrifting(true);
        }
      }}
      type="button"
    >
      <svg aria-hidden className="h-3 w-3" viewBox="0 0 12 12">
        {active ? (
          <path d="M2 1h3v10H2zM7 1h3v10H7z" fill="currentColor" />
        ) : (
          <path d="M2 1l9 5-9 5z" fill="currentColor" />
        )}
      </svg>
      {active ? t.clubTimeline.stop : t.clubTimeline.play}
    </button>
  );
}
