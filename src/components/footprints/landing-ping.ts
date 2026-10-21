/**
 * The sound a landing makes on 野馬足跡 — synthesised, so there is no audio
 * file to ship, cache or lose.
 *
 * TWO SINE WAVES, C6 AND G6. A perfect fifth, which is the interval that
 * sounds settled rather than tense, and high enough to be a tick rather than
 * a note. It rings for half a second: a 10ms attack (an instant start clicks)
 * and an exponential decay (a linear one sounds like a gate closing). The peak
 * is 0.08 — quiet on purpose, because the commonest listener has the site's
 * Only Time playing underneath and a ping that competes with a song is a
 * ping that gets switched off.
 *
 * NOTHING HERE MAKES SOUND ON ITS OWN. Browsers hold an `AudioContext`
 * suspended until the page has had a user gesture, and `resume()` before one
 * is refused. That is a browser rule, not something to work around, so:
 * `unlock()` is the only way to wake the context and it must be called from a
 * click, tap or key press; `unlocked` reports whether the context is actually
 * running; and the caller decides whether to ping with `shouldPing()`
 * (footprints.ts), which also takes the visitor's own switch and
 * reduced-motion into account.
 *
 * THE PREFERENCE IS THE VISITOR'S, kept in localStorage. Every read and write
 * is in a try/catch: private windows, blocked site data and thumbnail
 * capture all make the accessor throw or return nothing, and the page must
 * work (silently) without it.
 */

/** C6 and G6, in Hz. */
export const PING_FREQUENCIES = [1046.5, 1568] as const;
export const PING_ATTACK_S = 0.01;
export const PING_DECAY_S = 0.5;
export const PING_PEAK = 0.08;

/** The exponential ramp cannot reach zero; this is "silent" for the ear. */
const FLOOR = 0.0001;

export const SOUND_PREF_KEY = "wildrunner:footprints:sound";

type AudioContextCtor = typeof AudioContext;

function contextConstructor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export type Pinger = {
  /** Call from a user gesture. Safe to call again; never throws. */
  unlock: () => void;
  /** Whether the context is running, i.e. a ping would be heard. */
  readonly unlocked: boolean;
  /** Does nothing unless `unlocked`. */
  ping: () => void;
  dispose: () => void;
};

export function createPinger(): Pinger {
  let context: AudioContext | null = null;

  function ensure(): AudioContext | null {
    if (context) return context;
    const Ctor = contextConstructor();
    if (!Ctor) return null;
    try {
      context = new Ctor();
    } catch {
      context = null;
    }
    return context;
  }

  return {
    unlock() {
      const ctx = ensure();
      if (!ctx || ctx.state === "running") return;
      // A refused resume (no gesture yet) is not an error worth surfacing:
      // `unlocked` stays false and nothing plays.
      void ctx.resume().catch(() => {});
    },
    get unlocked() {
      return context?.state === "running";
    },
    ping() {
      const ctx = context;
      if (!ctx || ctx.state !== "running") return;
      const start = ctx.currentTime;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(FLOOR, start);
      gain.gain.linearRampToValueAtTime(PING_PEAK, start + PING_ATTACK_S);
      gain.gain.exponentialRampToValueAtTime(FLOOR, start + PING_ATTACK_S + PING_DECAY_S);
      gain.connect(ctx.destination);
      for (const frequency of PING_FREQUENCIES) {
        const oscillator = ctx.createOscillator();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        oscillator.connect(gain);
        oscillator.start(start);
        oscillator.stop(start + PING_ATTACK_S + PING_DECAY_S + 0.05);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
      }
    },
    dispose() {
      const ctx = context;
      context = null;
      if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
    },
  };
}

/** `null` when nothing is stored or storage is unavailable — "follow the default". */
export function readSoundPreference(): boolean | null {
  try {
    const value = window.localStorage.getItem(SOUND_PREF_KEY);
    return value === "on" ? true : value === "off" ? false : null;
  } catch {
    return null;
  }
}

export function writeSoundPreference(enabled: boolean): void {
  try {
    window.localStorage.setItem(SOUND_PREF_KEY, enabled ? "on" : "off");
  } catch {
    // Not remembered; the switch still works for this visit.
  }
}
