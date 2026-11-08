/**
 * The page following the voice: highlight the paragraph being read, and keep
 * it on screen until the reader takes the page back.
 *
 * LOADED WITH `import()` ON THE FIRST PRESS OF PLAY (`use-follow.ts`). Most
 * visitors to a narrated article read it, and none of this — the timing fetch,
 * the observers, the scroll arithmetic — is something their first paint should
 * pay for. It also means nothing here runs during hydration, so nothing here
 * can disagree with the server's render: the attributes it writes
 * (`data-narrating`) are not in any React props, and React leaves attributes it
 * did not render alone.
 *
 * THREE STATES, reported through `onState`:
 *   following   the page moves with the voice
 *   detached    the reader scrolled by hand; the highlight still moves, the page
 *               does not
 *   unavailable there is no usable timing table; nothing was changed
 * and a fourth for the reader's own preference, `off`.
 *
 * WHAT COUNTS AS THE READER TAKING OVER: a wheel, a touch drag, or a key that
 * scrolls. Never a `scroll` event — our own `scrollTo` raises those, and a
 * detector that heard itself would detach on every paragraph.
 */

import {
  canFollow,
  readingBand,
  scrollDelta,
  targetForLine,
} from "@/lib/reader/narration-follow";
import { lineAt, parseTiming, type Timing } from "@/lib/reader/narration-timing";

export type FollowState = "following" | "detached" | "unavailable" | "off";

export const FOLLOW_PREF_KEY = "narration-follow";

/** Keys that move the page. Space is here; on a button or the player it does something else (see `fromControl`). */
const SCROLL_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  " ",
]);

export type Follow = {
  /** The reader pressed play: follow again, from wherever the voice is. */
  play(): void;
  setEnabled(on: boolean): void;
  /** The "back to the reading position" button. */
  returnToText(): void;
  destroy(): void;
};

function readPref(): boolean {
  try {
    return window.localStorage.getItem(FOLLOW_PREF_KEY) !== "off";
  } catch {
    // Blocked storage: follow, which is the default.
    return true;
  }
}

function writePref(on: boolean) {
  try {
    window.localStorage.setItem(FOLLOW_PREF_KEY, on ? "on" : "off");
  } catch {
    // A preference that does not stick is not worth an error.
  }
}

/** Resolves once the audio knows its duration; the table is checked against it. */
function metadata(audio: HTMLAudioElement): Promise<void> {
  if (audio.readyState >= 1) return Promise.resolve();
  return new Promise((resolve) =>
    audio.addEventListener("loadedmetadata", () => resolve(), { once: true }),
  );
}

export async function startFollow(options: {
  audio: HTMLAudioElement;
  /** The element holding the player: measured for the band when it is stuck. */
  player: HTMLElement;
  postId: number | string;
  audioKey: string;
  /** `titled + sum(blocks)`, from the page's own plan. */
  lines: number;
  titled: boolean;
  onState: (state: FollowState) => void;
}): Promise<Follow | null> {
  const { audio, player, postId, audioKey, lines, titled, onState } = options;

  // Scoped to the player's own <article>, never the document. Two copies of
  // this page can be in the DOM at once: `PageTransitionEffect` keeps the
  // exiting copy mounted during its exit, and a hard load whose URL has a query
  // string (`?fbclid=…`, `?utm_…`, i.e. every shared link) mounts the page
  // twice. A document-wide query would capture both copies' paragraphs once and
  // keep them: `segs` would stop ascending, which `targetForLine`'s binary
  // search needs, and highlights would land on elements about to be removed.
  // No enclosing article means no following, not a fallback to the document.
  const article = player.closest("article");
  if (!article) return null;
  const blocks = Array.from(article.querySelectorAll<HTMLElement>("[data-seg]"));
  const title = article.querySelector<HTMLElement>("h1[data-narration-title]");
  if (blocks.length === 0) return null;

  let timing: Timing | null = null;
  try {
    const response = await fetch(
      `/api/article-audio/${postId}/timing?key=${encodeURIComponent(audioKey)}`,
      { credentials: "same-origin" },
    );
    if (response.ok) timing = parseTiming(await response.json());
  } catch {
    // Offline, or the endpoint is down: same answer as no table.
  }
  if (!timing) return null;

  await metadata(audio);
  if (
    !canFollow({
      timing,
      expectedLines: lines,
      audioDuration: audio.duration,
      segCount: blocks.length,
    })
  ) {
    return null;
  }

  const starts = timing.starts;
  const segs = blocks.map((el) => Number(el.dataset.seg));

  let enabled = readPref();
  let detached = false;
  let current: HTMLElement | null = null;
  // The last highlighted target, so a timeupdate that lands in the same block
  // does nothing at all (it fires ~4 times a second).
  let currentKey: string | null = null;

  const state = (): FollowState => (!enabled ? "off" : detached ? "detached" : "following");
  const emit = () => onState(state());

  const clear = () => {
    current?.removeAttribute("data-narrating");
    current = null;
    currentKey = null;
  };

  const elementNow = (): { el: HTMLElement; key: string } | null => {
    const target = targetForLine(segs, lineAt(starts, audio.currentTime), titled);
    if (!target) return null;
    if (target.kind === "title") return title ? { el: title, key: "title" } : null;
    return { el: blocks[target.index], key: String(target.index) };
  };

  /** Move the page only if the block is outside the band. */
  const reveal = (el: HTMLElement, instant: boolean) => {
    const header = document.querySelector<HTMLElement>("header.sticky");
    const headerBottom = header ? header.getBoundingClientRect().bottom : 0;
    // The player's height counts whether or not it is stuck YET. Following
    // starts on the press of play, and the player only becomes sticky on the
    // render after that; a block placed by the numbers of the moment before
    // would end up underneath it. When the player is not stuck the cost is a
    // little extra margin.
    const band = readingBand(
      headerBottom,
      player.getBoundingClientRect().height,
      window.innerHeight,
    );
    const delta = scrollDelta(el.getBoundingClientRect().top, band);
    if (delta === null) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({
      top: window.scrollY + delta,
      behavior: instant || reduced ? "auto" : "smooth",
    });
  };

  /** Bring the highlight to the voice; scroll too when following and visible. */
  const sync = (force: boolean) => {
    if (!enabled) return;
    const now = elementNow();
    if (!now) return;
    const changed = now.key !== currentKey;
    if (changed) {
      clear();
      now.el.setAttribute("data-narrating", "");
      current = now.el;
      currentKey = now.key;
    }
    // A hidden tab does not scroll: it would run the animation to nobody, and
    // `visibilitychange` jumps once on return instead.
    if ((changed || force) && !detached && !document.hidden) reveal(now.el, false);
  };

  const detach = () => {
    if (detached || !enabled) return;
    detached = true;
    emit();
  };

  const rejoin = () => {
    detached = false;
    emit();
    if (!enabled) return;
    // A frame later, not now: `emit` makes React render the follow controls and
    // make the player sticky, both of which change the player's height, and
    // the band is measured from it.
    requestAnimationFrame(() => {
      if (!detached) sync(true);
    });
  };

  /** A key pressed on a control does that control's job, not the page's. */
  const fromControl = (target: EventTarget | null) =>
    target instanceof Element &&
    target.closest("[data-testid=article-audio], input, textarea, select, button, [contenteditable]") !== null;

  const onKey = (event: KeyboardEvent) => {
    if (SCROLL_KEYS.has(event.key) && !fromControl(event.target)) detach();
  };
  const onTimeUpdate = () => sync(false);
  const onSeeked = () => rejoin();
  const onVisible = () => {
    // Back from the background: one jump, not the animation of every
    // paragraph that was skipped.
    if (!document.hidden && !detached && enabled) {
      const now = elementNow();
      if (now) reveal(now.el, true);
    }
  };

  window.addEventListener("wheel", detach, { passive: true });
  window.addEventListener("touchmove", detach, { passive: true });
  window.addEventListener("keydown", onKey);
  audio.addEventListener("timeupdate", onTimeUpdate);
  audio.addEventListener("seeked", onSeeked);
  document.addEventListener("visibilitychange", onVisible);

  return {
    play() {
      // Pressing play is the reader asking to be taken to the voice.
      rejoin();
    },
    setEnabled(on) {
      enabled = on;
      writePref(on);
      if (!on) {
        clear();
        emit();
      } else {
        rejoin();
      }
    },
    returnToText: rejoin,
    destroy() {
      window.removeEventListener("wheel", detach);
      window.removeEventListener("touchmove", detach);
      window.removeEventListener("keydown", onKey);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("seeked", onSeeked);
      document.removeEventListener("visibilitychange", onVisible);
      clear();
    },
  };
}
