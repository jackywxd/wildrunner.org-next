/**
 * When a draft should be written without anybody asking.
 *
 * `PostEditor` used to carry a comment saying "nothing here autosaves, so an
 * accidental tab close loses real work", with a `beforeunload` warning as
 * the only defence. A warning is not a save: it fires on a deliberate close
 * as often as an accidental one, it does nothing when the tab crashes or the
 * phone reclaims the page, and a member who clicks the wrong button on it
 * loses the afternoon.
 *
 * The storage side needs nothing new. `savePost`'s header already names
 * autosave as one of the callers it was shaped for: everything but an
 * explicit publish writes with `?draft=true`, so a save here creates a draft
 * version and never touches what the public sees — including on a post that
 * is already published.
 *
 * This module is only the *timing*, and it is separate so the timing can be
 * tested at its boundaries without a browser, a server, or a real clock.
 * Every input is a parameter, `now` included, for the reason
 * `src/lib/races/calendar.ts` gives about dates: a function that reads the
 * clock itself cannot be asked what it does at the interesting moment.
 */

/** Quiet time after the last edit before a save is worth making. */
export const IDLE_MS = 3_000;

/**
 * Floor on the gap between two autosaves.
 *
 * Without it, someone typing steadily would produce a save every time the
 * idle timer happened to catch a pause — and every one of those is a row in
 * `_posts_v`. Thirty seconds keeps a long writing session to a couple of
 * versions a minute at worst while still being far shorter than the work a
 * member would mind losing.
 */
export const MIN_GAP_MS = 30_000;

export type AutosaveState = {
  /** A save is already in flight. Two concurrent writes to one draft race. */
  busy: boolean;
  /** There are unsaved edits. Nothing to do when false. */
  dirty: boolean;
  /** When the document last changed. */
  lastEditAt: number | null;
  /** When the last successful save landed, autosave or manual. */
  lastSaveAt: number | null;
  /**
   * An image upload has not finished.
   *
   * This is a refusal, not a delay to be worked around. `read()` throws
   * while a pending upload is in the tree — the same condition that disables
   * the save buttons — so autosaving here would surface an error the member
   * never asked for, in the middle of a paste they are still waiting on.
   */
  uploading: boolean;
};

/**
 * Whether to write a draft right now.
 *
 * Both conditions must hold, and they answer different questions: the idle
 * check asks "has the member paused", the gap check asks "have we written
 * recently enough already". Either one alone is wrong — idle alone saves on
 * every pause of a slow typist, and a gap alone saves mid-word.
 */
export function shouldAutosave(state: AutosaveState, now: number): boolean {
  if (!state.dirty || state.busy || state.uploading) return false;
  if (state.lastEditAt === null) return false;

  if (now - state.lastEditAt < IDLE_MS) return false;
  // Never saved yet, so there is no gap to respect — the first autosave of a
  // session should not be held back by a rule that exists to space out the
  // ones after it.
  if (state.lastSaveAt === null) return true;

  return now - state.lastSaveAt >= MIN_GAP_MS;
}

/**
 * How long to wait before asking again.
 *
 * Returned rather than fixed at the call site so the timer follows the same
 * arithmetic as the decision: polling every second would ask 30 times to be
 * told "not yet" 29 times, and a single long timeout would miss the moment
 * an edit lands during it.
 *
 * Clamped below at 250ms. A zero or negative delay would spin the timer, and
 * a quarter second is under anything a person notices.
 */
export function nextCheckDelay(state: AutosaveState, now: number): number {
  const untilIdle =
    state.lastEditAt === null ? IDLE_MS : state.lastEditAt + IDLE_MS - now;
  const untilGap =
    state.lastSaveAt === null ? 0 : state.lastSaveAt + MIN_GAP_MS - now;

  return Math.max(250, untilIdle, untilGap);
}
