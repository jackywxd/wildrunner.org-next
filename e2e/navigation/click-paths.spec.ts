import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { expectOkJson } from "../helpers/api";
import { adminContext } from "../helpers/members";

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
/**
 * Assert the browser landed on `href`, comparing paths rather than matching
 * a regex.
 *
 * The first version interpolated the href straight into `new RegExp(...)`,
 * which made every assertion depend on the slug containing no regex
 * metacharacter. A member whose slug holds a dot or a plus — and e2e
 * fixtures generate slugs from timestamps and free text — turned a correct
 * navigation into an intermittent failure. That is the shape of flake that
 * gets rerun rather than read.
 */
async function landedOn(
  page: import("@playwright/test").Page,
  href: string,
) {
  await expect(page).toHaveURL((url) => url.pathname === href);
}

async function arrived(locator: import("@playwright/test").Locator) {
  await expect(locator).toHaveCount(1);
  await expect(locator).toBeVisible();
}

test.describe("N navigation click paths", () => {
  /**
   * The schedule this file needs, created and removed by this file.
   *
   * The first version of N-T2 asserted on whatever rows happened to be in
   * the database and passed locally, where a seeded schedule exists. In CI
   * the database starts empty and `race-schedule.spec.ts` — which does
   * create rows — runs *after* this file and deletes them again, so
   * `/races` rendered its empty state and there was no list to toggle away
   * from.
   *
   * Depending on ambient data is the failure this suite is otherwise
   * careful to avoid, and it is worth naming here because the test that got
   * it wrong is the one added to catch a class of bug the suite was missing.
   */
  let admin: APIRequestContext;
  const created: number[] = [];
  const stamp = Date.now();

  test.beforeAll(async ({ baseURL }) => {
    admin = await adminContext(baseURL);
    // Inside the default twelve-month window, so both the list and the
    // calendar have something to render.
    const soon = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const body = await expectOkJson<{ doc: { id: number } }>(
      await admin.post("/api/race-schedule", {
        data: {
          name: `E2E nav race ${stamp}`,
          series: "others",
          startDate: `${soon}T00:00:00.000Z`,
        },
      }),
    );
    created.push(body.doc.id);
  });

  test.afterAll(async () => {
    for (const id of created) await admin.delete(`/api/race-schedule/${id}`);
    await admin.dispose();
  });

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
      await landedOn(page, href);
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
    await landedOn(page, href!);
    await arrived(page.locator("h1"));
  });

  test("N-T6: a post card opens that post", async ({ page }) => {
    await page.goto("/posts");
    const card = page.locator('a[href^="/posts/"]').first();
    test.skip((await card.count()) === 0, "no published posts in this environment");

    const href = await card.getAttribute("href");
    await card.click();
    await landedOn(page, href!);
    await arrived(page.locator("h1"));
  });
});
