import type { APIRequestContext } from "@playwright/test";

import { budget } from "../helpers/budget";
import { waitForHydration } from "../helpers/hydration";
import { adminContext } from "../helpers/members";
import { expect, test } from "../helpers/test";

/**
 * Q — filtering the schedule down to Western States / Hardrock qualifiers.
 *
 * ARRIVES BY CLICKING, not by `goto`. The filters are links on a
 * `force-dynamic` route, so a chip that renders the right href but whose
 * page ignores the parameter looks identical in the HTML — and a soft
 * navigation is exactly where the calendar-toggle regression lived,
 * invisible to a suite that only ever used `goto`
 * (docs/testing-incidents.md).
 *
 * CREATES ITS OWN FIXTURE, which is why it is not in visitor.spec.ts: that
 * file reads the site as it is, because a visitor cannot do otherwise.
 * Here, leaning on ambient data would make the test worthless in both
 * directions. Locally the database is e2e residue; in CI it starts empty
 * and is seeded from `data/race-categories.csv`, whose qualifier flags are
 * a snapshot of two lists that get re-cut every year — and the window this
 * page shows is the next twelve months from *now*, so a corpus that
 * qualifies today can legitimately hold no qualifying race a year from now.
 * A test asserting "every visible row carries the tag" would then pass over
 * an empty list and prove nothing. Flagging one category up front means the
 * assertion always has something to be wrong about.
 *
 * RESTORES WHAT IT FOUND, rather than clearing. Once the real lists are
 * imported the category it picks may legitimately be a qualifier already,
 * and blanking it would corrupt the corpus for whatever runs next. Restore
 * is by captured id and captured value — never by pattern (AGENTS.md).
 */

type Category = {
  id: number;
  label: string;
  qualifiesWser?: boolean | null;
  wserVerifiedAt?: string | null;
};

/** The first race the schedule lists, and a category of its event. */
async function pickCategory(
  admin: APIRequestContext,
  editionId: string,
): Promise<Category> {
  const edition = await admin.get(`/api/race-editions/${editionId}?depth=0`);
  expect(edition.ok(), await edition.text()).toBeTruthy();
  const eventId = (await edition.json()).event as number;

  const found = await admin.get(
    `/api/race-categories?where[event][equals]=${eventId}&limit=1&depth=0`,
  );
  expect(found.ok(), await found.text()).toBeTruthy();
  const docs = (await found.json()).docs as Category[];
  // Every event has at least one category — validate-catalogue.ts fails the
  // CSV otherwise — so an empty list here is a broken seed, not a skip.
  expect(docs.length, "the first scheduled race has no categories").toBeGreaterThan(0);
  return docs[0];
}

test.describe("Q race qualifier filters", () => {
  test("Q1: filters the schedule to Western States qualifiers by clicking", async ({
    baseURL,
    page,
  }) => {
    // Declared, not guessed at, and for the reason playwright.config.ts
    // gives: a test past 15s says so rather than living on the shared 20s
    // budget. This one is an admin sign-in, four API round trips, two full
    // page loads and two soft navigations — measured at 16.4s in CI, and
    // between 17s and 39s locally depending on whether the dev server is
    // warm, since running first after a reset means paying the route
    // compile. So 20s was never margin: under a full-suite run it simply
    // ran out, with the page snapshot at failure showing the filter had
    // worked and every visible row correctly tagged.
    //
    // Through budget() because every number here was measured against a dev
    // server, and this journey is almost all writes — the admin sign-in and
    // the PATCH are exactly the calls that cost 5x against a deployed
    // Worker (e2e/helpers/budget.ts).
    //
    // 90s since the two render waits below were added: each may legitimately
    // take up to 30s on a cold dev server (see them), on top of the above.
    test.setTimeout(budget(90_000));

    const admin = await adminContext(baseURL);

    await page.goto("/races", { waitUntil: "domcontentloaded" });
    const rows = page.getByTestId("race-list-item");
    await expect(rows.first()).toBeVisible();

    const editionId = await rows.first().getAttribute("data-race-id");
    expect(editionId).toBeTruthy();
    const category = await pickCategory(admin, editionId as string);

    // Captured before anything is written, so the restore below puts back
    // what was actually there rather than a guess at what it should be.
    const previous = {
      qualifiesWser: category.qualifiesWser ?? false,
      wserVerifiedAt: category.wserVerifiedAt ?? null,
    };

    try {
      const patched = await admin.patch(`/api/race-categories/${category.id}`, {
        data: { qualifiesWser: true, wserVerifiedAt: "2026-08-26T00:00:00.000Z" },
      });
      expect(patched.ok(), await patched.text()).toBeTruthy();

      await page.reload({ waitUntil: "domcontentloaded" });
      // Before the click: the chip is a Link, and clicked before React takes
      // over it is a hard load of a query-string URL, which mounts the page
      // twice (PageTransitionEffect re-keys it) and the click lands on the
      // copy that is discarded.
      await waitForHydration(page);
      await page.getByTestId("race-filter-wser").click();

      // The URL moved...
      await expect(page).toHaveURL(/[?&]qualifier=wser/, { timeout: budget(15_000) });

      // THE URL MOVES BEFORE THE LIST DOES. On a query-only soft navigation
      // Next updates the address at once, and the page changes only when the
      // server's render for the new URL arrives; until then
      // PageTransitionEffect's FrozenRouter keeps the PREVIOUS page on screen,
      // and once it lands the old copy stays in the DOM while it exits. So
      // everything below could be reading the old list. Observed on the dev
      // server: URL already `?qualifier=wser`, DOM still the unfiltered 45
      // rows, and the log reading `GET /races?qualifier=wser 200 in 20.0s`.
      // Warm renders of /races measured 3.7-9.6s over nine requests and CI's
      // warmup 6.5s — the default 5s expect timeout sits inside that. (Production
      // answers in 0.2-0.3s; this is a dev-server cost, not a user one.)
      //
      // So wait for the new render's own mark: the chip is `aria-current`
      // when active, decided on the server from the filters, which the frozen
      // copy can never have. Not a strict locator — during the exit both
      // copies are in the DOM, and a strict one would throw on two.
      const activeChip = page.locator(
        '[data-testid="race-filter-wser"][aria-current="true"]',
      );
      await expect(
        activeChip.first(),
        "the filtered render never arrived — the list on screen is still the previous page",
      ).toBeAttached({ timeout: budget(30_000) });

      // THE MARKER PROVES ARRIVAL, NOT DEPARTURE. The new copy mounts while the
      // old one is still fading out (`transitionApple`, 0.3s, popLayout), and
      // both contain the flagged race — so the strict locator below threw
      // "resolved to 2 elements" the instant it ran inside that window. Playwright
      // does not retry a strict-mode violation, so it failed after ~170ms, not
      // after the timeout. Every copy of the page carries exactly one such chip,
      // so a count of 1 means the exiting copy is gone. `toHaveCount` retries;
      // the default 5s is >15x the fade, so no budget() is needed. The second
      // click on this chip, further down, is strict for the same reason and
      // relies on this wait.
      await expect(page.getByTestId("race-filter-wser")).toHaveCount(1);

      // ...and so did the list. The race whose category was just flagged is
      // still here, which is what stops the next assertion being vacuous.
      await expect(
        page.locator(`[data-testid="race-list-item"][data-race-id="${editionId}"]`),
      ).toBeVisible();

      // THE ASSERTION THIS TEST EXISTS FOR: nothing without a Western
      // States tag survived the filter. A filter that let a non-qualifier
      // through would render a perfectly normal-looking schedule.
      //
      // One auto-retrying locator rather than counting the rows and looping
      // over the count. The count is read during a soft navigation, so it
      // can be the *previous* list's length while the assertions run
      // against the new one — which is how the first version of this test
      // walked off the end of a shorter list and reported a missing tag
      // that was never missing.
      await expect(
        page.locator(
          '[data-testid="race-list-item"]:not(:has([data-qualifier="wser"]))',
        ),
      ).toHaveCount(0);
      // fixture-scoped: the PATCH above guarantees at least one row, so the
      // assertion cannot be passing over an empty list. Read only now: the
      // zero-untagged count above cannot hold while the old copy is in the
      // DOM, since the unfiltered list contains untagged rows.
      const filtered = await rows.count();
      expect(filtered).toBeGreaterThan(0);

      // Clicking the active chip clears it, and the schedule comes back.
      await page.getByTestId("race-filter-wser").click();
      await expect(page).toHaveURL((url) => !url.search.includes("qualifier="), {
        timeout: budget(15_000),
      });
      // Same wait, mirrored: the filtered copy still carries the active chip
      // while it exits, so its absence is the unfiltered render having
      // arrived. Without it the count below can read the old filtered list.
      await expect(
        activeChip,
        "the unfiltered render never arrived — the filtered list is still on screen",
      ).toHaveCount(0, { timeout: budget(30_000) });
      // Strictly more rows once the filter is off, which is also the proof
      // that the filter was removing something rather than doing nothing.
      await expect(rows).not.toHaveCount(filtered);
    } finally {
      await admin.patch(`/api/race-categories/${category.id}`, { data: previous });
      await admin.dispose();
    }
  });
});
