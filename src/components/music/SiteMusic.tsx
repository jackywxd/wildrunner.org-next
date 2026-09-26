"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

import { useDictionary } from "@/components/i18n/dictionary-provider";
import { SpectrumBackdrop } from "@/components/music/SpectrumBackdrop";
import { claimPlaybackAudioSession } from "@/lib/audio-session";

/**
 * The site's music: one `<audio>` element for the whole public site, so it
 * plays on while the reader moves from page to page.
 *
 * IT LIVES IN THE PUBLIC LAYOUT, NOT ON A PAGE. A player mounted by the page
 * that starts it stops the moment the reader leaves that page — which is how
 * haijieliu.com's home-page player behaves, and the one thing this one must
 * not do. `(public)/layout.tsx` stays mounted across every client-side
 * navigation within the public site, so the element, and the sound, do too.
 * (Leaving for `/members` or `/admin` leaves this layout, and the music with
 * it; those are different sites in all but address.)
 *
 * IT KEEPS PLAYING WITH THE SCREEN LOCKED, OR IN ANOTHER APP. Two pieces, both
 * set in the tap that starts it:
 *   - `claimPlaybackAudioSession()` — the same call haijieliu.com makes — so
 *     iOS treats this as playback rather than ambient sound;
 *   - the Media Session API, so the lock screen and the phone's controls name
 *     what is playing and can pause and resume it. Pausing from there goes
 *     through the element's own events, so every button on the page agrees.
 *
 * THE SPECTRUM ALONG THE BOTTOM, as on haijieliu.com: the element is routed
 * through an `AudioContext` — source → analyser → speakers — and
 * `SpectrumBackdrop` draws the analyser. Routing sound through an
 * AudioContext is exactly what iOS interrupts when the screen locks, unless
 * the page holds a "playback" session, which is the other reason for
 * `claimPlaybackAudioSession()` above. The graph is built once, in the first
 * tap (an element can only ever have one media-element source), and if the
 * browser cannot build it the element simply plays straight to the speakers,
 * without a spectrum.
 *
 * NOTHING PLAYS UNTIL SOMEBODY ASKS. The only way in is `play()`, called from a
 * click (the timeline's 播放, or this file's own corner button once it has
 * appeared). Browsers refuse sound that nobody asked for, and so should we.
 */

const SRC = "/audio/life-long-love.m4a";

/** Seconds the sound takes to fade in or out. Long enough to hide the edge, short enough to feel immediate. */
const FADE_S = 0.25;

/** How long the first press takes to fly to the corner — haijieliu.com's figure. */
const FLIGHT_MS = 750;

type SiteMusic = {
  /** Whether the music has ever been started on this visit — the corner button appears then. */
  started: boolean;
  playing: boolean;
  /**
   * How many times somebody has paused it — from any button or the lock
   * screen. Not `!playing`: a file the browser cannot decode also ends up
   * paused, and that is not anyone asking for quiet.
   */
  pauses: number;
  pause: () => void;
  /**
   * Must be called from a click or tap. `from` is the button that asked, on
   * the first press only: the corner button flies out of it (see below).
   */
  play: (from?: HTMLElement) => void;
};

const Context = createContext<SiteMusic | null>(null);

export function useSiteMusic(): SiteMusic {
  const music = useContext(Context);
  if (!music) throw new Error("useSiteMusic needs <SiteMusicProvider> above it");
  return music;
}

export function SiteMusicProvider({ children }: { children: ReactNode }) {
  const t = useDictionary();
  const audio = useRef<HTMLAudioElement>(null);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [pauses, setPauses] = useState(0);
  const graph = useRef<{ context: AudioContext; gain: GainNode } | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  // The pause waiting for its fade to finish, so a play pressed meanwhile can
  // call it off.
  const pending = useRef<number | undefined>(undefined);
  // Where the first press came from, for the corner button to fly out of.
  const flight = useRef<{ from: DOMRect; focused: boolean } | null>(null);
  const dockFly = useRef<HTMLSpanElement>(null);
  const dockButton = useRef<HTMLButtonElement>(null);

  /**
   * FADED, NOT CUT. Stopping a waveform mid-cycle is an audible click — on a
   * phone's speaker, a pop — so the sound is ramped to silence over a quarter
   * of a second before the element pauses and the context is suspended. A
   * GainNode rather than `audio.volume`, which iOS does not let a page set.
   */
  const pause = useCallback(() => {
    const element = audio.current;
    const nodes = graph.current;
    if (!element) return;
    if (!nodes) {
      element.pause();
      return;
    }
    const { context, gain } = nodes;
    const now = context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + FADE_S);
    window.clearTimeout(pending.current);
    pending.current = window.setTimeout(() => {
      element.pause();
      // Nothing to analyse while it is quiet; haijieliu.com suspends it too.
      void context.suspend();
    }, FADE_S * 1000 + 30);
  }, []);

  const play = useCallback((from?: HTMLElement) => {
    const element = audio.current;
    if (!element) return;
    if (from && !flight.current) {
      flight.current = {
        focused: document.activeElement === from,
        from: from.getBoundingClientRect(),
      };
    }
    claimPlaybackAudioSession();
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        artist: t.music.artist,
        title: t.clubTimeline.title,
      });
    }
    if (!graph.current) {
      try {
        const AudioContextClass =
          window.AudioContext ??
          (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        const context = new AudioContextClass();
        const node = context.createAnalyser();
        node.smoothingTimeConstant = 0.85;
        node.fftSize = 256;
        const source = context.createMediaElementSource(element);
        // source → gain → (analyser, speakers): the fade applies to both, so
        // the spectrum sinks with the sound.
        const gain = context.createGain();
        source.connect(gain);
        gain.connect(node);
        gain.connect(context.destination);
        graph.current = { context, gain };
        setAnalyser(node);
      } catch {
        // No spectrum; the element still plays to the speakers on its own.
      }
    }
    // In the tap, so the context is allowed to run.
    window.clearTimeout(pending.current);
    if (graph.current) {
      // Up from silence, for the same reason the pause goes down to it.
      const { context, gain } = graph.current;
      void context.resume();
      const now = context.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(element.paused ? 0 : gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(1, now + FADE_S);
    }
    setStarted(true);
    // Rejected when the browser cannot decode the file or refuses to play;
    // whatever asked for the music carries on without it.
    void element.play().catch(() => undefined);
  }, [t]);

  // The phone's own controls — lock screen, headphones, control centre.
  useEffect(() => {
    if (!started || !("mediaSession" in navigator)) return;
    navigator.mediaSession.setActionHandler("play", () => play());
    navigator.mediaSession.setActionHandler("pause", () => pause());
    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
    };
  }, [pause, play, started]);

  /*
   * THE FIRST PRESS FLIES TO THE CORNER, as on haijieliu.com: the button that
   * started the music gives way to the corner button, which starts where that
   * button was and travels to its place. Measure both ends and play the
   * difference back to zero. X and Y ride on separate elements with different
   * easings — across first, then down — which bends the straight line into
   * an arc; the corner button also grows from the starting button's size.
   */
  useLayoutEffect(() => {
    const trip = flight.current;
    const fly = dockFly.current;
    const button = dockButton.current;
    if (!started || !trip || !fly || !button) return;
    flight.current = null;

    // The starting button had keyboard focus; hand it to its replacement.
    if (trip.focused) button.focus({ preventScroll: true });
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const to = button.getBoundingClientRect();
    const dx = trip.from.left + trip.from.width / 2 - (to.left + to.width / 2);
    const dy = trip.from.top + trip.from.height / 2 - (to.top + to.height / 2);
    const scale = trip.from.height / to.height;
    fly.animate([{ transform: `translateX(${dx}px)` }, { transform: "none" }], {
      duration: FLIGHT_MS,
      easing: "cubic-bezier(0.3, 0.7, 0.4, 1)",
    });
    button.animate([{ transform: `translateY(${dy}px) scale(${scale})` }, { transform: "none" }], {
      duration: FLIGHT_MS,
      easing: "cubic-bezier(0.6, 0, 0.8, 0.4)",
    });
  }, [started]);

  const value = useMemo(
    () => ({ pause, pauses, play, playing, started }),
    [pause, pauses, play, playing, started],
  );

  return (
    <Context.Provider value={value}>
      {children}
      <audio
        data-testid="site-music-audio"
        loop
        onPause={(event) => {
          setPlaying(false);
          // A play that failed (no decoder, network) also fires `pause`.
          if (!event.currentTarget.error) setPauses((count) => count + 1);
        }}
        onPlay={() => setPlaying(true)}
        // Ten megabytes is not a cost every visitor should pay; nothing is
        // fetched until someone presses play.
        preload="none"
        ref={audio}
        src={SRC}
      />
      {started && (
        // Behind the page (`-z-10`): the cards are opaque, so the bars show in
        // the gaps between them, as haijieliu.com's show between its lines.
        // The window's width on a phone, the content column on a wide screen.
        // The site's own purple, but faint — something felt more than seen,
        // never competing with the cards for attention.
        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 bottom-0 -z-10 h-[120px] opacity-[0.12] md:left-1/2 md:right-auto md:w-full md:max-w-4xl md:-translate-x-1/2 print:hidden"
        >
          <SpectrumBackdrop analyser={analyser} playing={playing} />
        </div>
      )}
      {started && (
        // Wherever the reader goes once the music is on, this is how to turn
        // it off — or back on. Real button, named by what pressing it does.
        <span className="fixed bottom-4 right-4 z-40 print:hidden" data-music-dock="" ref={dockFly}>
          <button
            aria-label={playing ? t.music.pause : t.music.play}
            aria-pressed={playing}
            className="inline-flex h-11 w-11 items-center justify-center border border-foreground bg-background text-foreground shadow-md transition-colors hover:bg-secondary"
            data-music-control=""
            data-testid="site-music-toggle"
            onClick={() => (playing ? pause() : play())}
            ref={dockButton}
            type="button"
          >
            <svg aria-hidden className="h-3.5 w-3.5" viewBox="0 0 12 12">
              {playing ? (
                <path d="M2 1h3v10H2zM7 1h3v10H7z" fill="currentColor" />
              ) : (
                <path d="M2 1l9 5-9 5z" fill="currentColor" />
              )}
            </svg>
          </button>
        </span>
      )}
    </Context.Provider>
  );
}
