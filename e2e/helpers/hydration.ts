import { expect, type Page } from "@playwright/test";

import { budget } from "./budget";

/**
 * Wait until React has taken the page over, before touching anything on it.
 *
 * THE RACE THIS CLOSES, and why `goto` alone does not close it.
 * `waitUntil: "domcontentloaded"` — which nearly every journey here uses,
 * correctly, because waiting for `load` means waiting for images — returns
 * while the page is still server-rendered markup. A control in that window is
 * visible, enabled and stable, so Playwright's actionability checks all pass
 * and it will happily click. What happens next depends on the control, and
 * the two outcomes look nothing alike:
 *
 *   - **A control that needs JS swallows the click.** `FilterChip` is a
 *     `<button>` whose `onClick` calls `setView`. Clicked early, nothing
 *     happens at all — no error, no state change. `V-LANG-3` spent 20s
 *     waiting for album cards that could not render and then reported "the
 *     corpus is empty", which was false and sent two people to the database.
 *
 *   - **A control that works without JS corrupts hydration.**
 *     `LanguageSwitcher` is a native `<details>`, chosen so the language
 *     choices stay real links. The browser opens it with no JS whatsoever, so
 *     an early click *succeeds* and writes `open=""` into the DOM. React then
 *     hydrates onto a tree that never had `open`, logs "A tree hydrated but
 *     some attributes of the server rendered HTML didn't match", and
 *     `test.ts`'s console guard fails the test. `V-LANG-1` died this way.
 *
 * The second is the nastier one: there is no dropped click to notice, and the
 * error lands on an element the test is not asserting about.
 *
 * WHY THIS AND NOT A "PROVE THE CLICK LANDED" RETRY. Wrapping the click in
 * `toPass` until `data-active="true"` appears — the pattern in
 * `race-gallery.spec.ts` — fixes the first case and cannot fix the second: by
 * the time you can observe a `<details>`, the browser has already opened it
 * and the damage is done. Only *not clicking yet* fixes both.
 *
 * `data-hydrated` is published by `HydrationMarker`, rendered last inside
 * `<body>` in `[lang]/(site)/layout.tsx`. It covers the site chrome and any
 * page content not behind its own `<Suspense>`; read that component's header
 * for the precise claim.
 */
export async function waitForHydration(page: Page): Promise<void> {
  // The message says what was not observed, not why — deliberately. Being the
  // first thing that touches the page makes this the first thing to fail when
  // the server is unwell, and a sentence blaming hydration would then send the
  // next reader to React while a 500 sat in the server log. That mistake has
  // already been paid for once here, by an assertion that said "the corpus is
  // empty" about a corpus that was fine.
  await expect(
    page.locator("html[data-hydrated='true']"),
    "the page never signalled that React took over — it may not have rendered at all; read the server log before suspecting hydration",
  ).toBeAttached({ timeout: budget(20_000) });
}
