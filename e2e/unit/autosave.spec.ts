import { expect, test } from "@playwright/test";

import {
  IDLE_MS,
  MIN_GAP_MS,
  nextCheckDelay,
  shouldAutosave,
  type AutosaveState,
} from "@/lib/members/autosave";

/**
 * U-AUTOSAVE — when a draft is written without anybody asking.
 *
 * Every case here is a boundary, which is why `now` is a parameter of the
 * function rather than a call to `Date.now()` inside it. The same convention
 * `src/lib/races/calendar.ts` sets, for the same reason.
 *
 * The refusal that matters most is `uploading`. `read()` throws while an
 * image upload is still in the tree, so an autosave that fired there would
 * surface an error the member never asked for, in the middle of a paste they
 * are still waiting on — turning a working upload into what looks like a
 * broken editor.
 */

const BASE: AutosaveState = {
  busy: false,
  dirty: true,
  lastEditAt: 0,
  lastSaveAt: null,
  uploading: false,
};

const at = (over: Partial<AutosaveState>): AutosaveState => ({ ...BASE, ...over });

test.describe("U-AUTOSAVE draft timing", () => {
  test("U-AUTOSAVE-1: nothing is written until the member pauses", () => {
    // Still typing.
    expect(shouldAutosave(at({}), IDLE_MS - 1)).toBe(false);
    // Paused long enough.
    expect(shouldAutosave(at({}), IDLE_MS)).toBe(true);
  });

  test("U-AUTOSAVE-2: a clean, busy or uploading editor is never written", () => {
    const settled = IDLE_MS + MIN_GAP_MS;
    // Nothing to save.
    expect(shouldAutosave(at({ dirty: false }), settled)).toBe(false);
    // A save is already in flight; two writes to one draft race each other.
    expect(shouldAutosave(at({ busy: true }), settled)).toBe(false);
    // The one that would produce a visible error rather than a silent no-op.
    expect(shouldAutosave(at({ uploading: true }), settled)).toBe(false);
  });

  test("U-AUTOSAVE-3: the first save of a session is not held back by the gap", () => {
    // `lastSaveAt: null` means nothing has been written yet. Applying the
    // 30s floor here would make a member who types one sentence and closes
    // the tab lose it, which is the exact case this feature exists for.
    expect(shouldAutosave(at({ lastSaveAt: null }), IDLE_MS)).toBe(true);
  });

  test("U-AUTOSAVE-4: saves are spaced out once one has happened", () => {
    // Idle long enough, but the previous save was recent.
    const soon = MIN_GAP_MS - 1;
    expect(
      shouldAutosave(at({ lastEditAt: soon - IDLE_MS, lastSaveAt: 0 }), soon),
    ).toBe(false);

    // The gap has elapsed.
    expect(
      shouldAutosave(
        at({ lastEditAt: MIN_GAP_MS - IDLE_MS, lastSaveAt: 0 }),
        MIN_GAP_MS,
      ),
    ).toBe(true);
  });

  test("U-AUTOSAVE-5: the next check waits for whichever condition is furthest off", () => {
    // Mid-edit with no save yet: wait out the idle window.
    expect(nextCheckDelay(at({ lastEditAt: 0 }), 1_000)).toBe(IDLE_MS - 1_000);

    // Idle satisfied, but a save landed a moment ago — the gap is what is
    // left to wait for, and asking again sooner just gets refused.
    expect(nextCheckDelay(at({ lastEditAt: 0, lastSaveAt: 0 }), IDLE_MS)).toBe(
      MIN_GAP_MS - IDLE_MS,
    );
  });

  test("U-AUTOSAVE-6: the delay never becomes a spin", () => {
    // Both windows long past. A zero or negative timeout here would busy-loop
    // the timer for as long as the editor stays open on a saved document.
    const late = MIN_GAP_MS * 10;
    expect(nextCheckDelay(at({ lastEditAt: 0, lastSaveAt: 0 }), late)).toBe(250);
  });
});
