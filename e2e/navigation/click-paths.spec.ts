import { expect, test } from "@playwright/test";

/**
 * N — every navigable control, reached by clicking it.
 *
 * WHY THIS FILE EXISTS. `/races?view=calendar` shipped broken: clicking 月曆
 * changed the URL and nothing else, and a manual refresh was needed before
 * the calendar appeared. The cause was `PageTransitionEffect` keying its
 * `AnimatePresence` on `usePathname()` alone, so `/races` and
 * `/races?view=calendar` produced the same key and framer-motion never
 * swapped the children.
 *
 * The suite could not have caught it. `race-schedule.spec.ts` reaches the
 * calendar with `page.goto("/races?view=calendar")` — a full document load,
 * where the transition component never runs. Every other spec navigates the
 * same way. So the application's entire soft-navigation behaviour — client
 * routing, transitions, RSC payload handling, route-level cache — was
 * exercised by nothing at all.
 *
 * The rule this file enforces: **tests navigate by URL, users navigate by
 * clicking, and those are different code paths.** Anything reachable by a
 * link needs at least one test that arrives the way a person does.
 *
 * Deliberately shallow. It asserts arrival, not content — the content specs
 * cover that, and duplicating them here would make this file expensive to
 * keep true. What it uniquely proves is that clicking works at all.
 */

/**
 * Assert a page element is present exactly once, then visible.
 *
 * `PageTransitionEffect` wraps the route in `AnimatePresence mode="popLayout"`,
 * which keeps the outgoing page mounted inside the same `<main>` while the
 * incoming one animates in. Mid-transition there are two `race-schedule`
 * containers and two `h1`s, and a bare `toBeVisible()` fails strict mode on
 * both. Waiting for `<main>` to settle does not help — there is only ever
 * one of those.
 *
 * The `toHaveCount(1)` is the assertion, not a workaround: two copies left
 * mounted is what the calendar bug looked like from the outside, so a
 * transition that never resolves fails here instead of passing.
 */
async function arrived(locator: import("@playwright/test").Locator) {
  await expect(locator).toHaveCount(1);
  await expect(locator).toBeVisible();
}

test.describe("N navigation click paths", () => {
  test("N-T1: the top nav reaches every public page by clicking", async ({
    page,
  }) => {
    await page.goto("/");

    // Read the nav's own links rather than hard-coding them: the list comes
    // from the Site global and an editor can change it. A hard-coded list
    // would keep passing while the real nav pointed somewhere broken.
    const hrefs = await page
      .locator('header a[href^="/"]')
      .evaluateAll((links) =>
        Array.from(
          new Set(
            links
              .map((a) => a.getAttribute("href"))
              .filter((href): href is string => Boolean(href) && href !== "/"),
          ),
        ),
      );

    expect(hrefs.length, "the top nav has no internal links").toBeGreaterThan(0);

    for (const href of hrefs) {
      await page.goto("/");
      await page.locator(`header a[href="${href}"]`).first().click();
      await expect(page).toHaveURL(new RegExp(`${href}(\\?|/|$)`));
      // A soft navigation that rendered nothing still changes the URL, so
      // the URL on its own proves too little.
      await arrived(page.locator("main"));
    }
  });

  test("N-T2: the calendar toggle swaps the view without a reload", async ({
    page,
  }) => {
    await page.goto("/races");
    await expect(page.getByTestId("race-list")).toBeVisible();

    const toggle = page.getByTestId("race-schedule-toggle");

    // THE REGRESSION TEST. Clicking, not goto — the bug lived entirely in
    // the soft-navigation path and a full load hides it completely.
    await toggle.getByRole("link", { name: "月曆" }).click();
    await expect(page).toHaveURL(/view=calendar/);
    await arrived(page.getByTestId("race-calendar"));
    await expect(page.getByTestId("race-list")).toHaveCount(0);

    // And back, which is the same failure in the other direction.
    await toggle.getByRole("link", { name: "列表" }).click();
    await expect(page).toHaveURL(/^(?!.*view=calendar)/);
    await arrived(page.getByTestId("race-list"));
    await expect(page.getByTestId("race-calendar")).toHaveCount(0);
  });

  test("N-T3: a series filter applies by clicking", async ({ page }) => {
    await page.goto("/races");
    await page.getByRole("link", { name: "UTMB 世界系列賽" }).click();
    await expect(page).toHaveURL(/series=utmb/);
    await arrived(page.getByTestId("race-schedule"));
  });

  test("N-T4: the pager moves the window by clicking", async ({ page }) => {
    await page.goto("/races");
    const older = page.getByTestId("race-pager-older");
    test.skip((await older.count()) === 0, "schedule does not reach back");

    await older.click();
    await expect(page).toHaveURL(/from=\d{4}-\d{2}/);
    await arrived(page.getByTestId("race-schedule"));
  });

  test("N-T5: a rider card opens that rider's page", async ({ page }) => {
    await page.goto("/riders");
    const card = page.locator('a[href^="/riders/"]').first();
    test.skip((await card.count()) === 0, "no riders in this environment");

    const href = await card.getAttribute("href");
    await card.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await arrived(page.locator("h1"));
  });

  test("N-T6: a post card opens that post", async ({ page }) => {
    await page.goto("/posts");
    const card = page.locator('a[href^="/posts/"]').first();
    test.skip((await card.count()) === 0, "no published posts in this environment");

    const href = await card.getAttribute("href");
    await card.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await arrived(page.locator("h1"));
  });
});
