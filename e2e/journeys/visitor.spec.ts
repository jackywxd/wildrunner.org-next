import { expect, test } from "../helpers/test";

/**
 * V — what someone who has never signed in can do.
 *
 * One test per use case in `docs/testing-plan.md` §1, each walking the path a
 * person walks: arriving somewhere, clicking to get further, and finding what
 * they came for. Nothing here creates fixtures over the API, because a visitor
 * cannot; these read the site as it is.
 *
 * That makes them the one place in the suite that is *corpus-scoped by nature*
 * — they assert about content that already exists. On a database with no
 * published content they would have nothing to click, so each states what it
 * needs and skips loudly rather than passing vacuously.
 *
 * `domcontentloaded` throughout: every assertion is about server-rendered
 * markup, and waiting for `load` makes a test depend on images and third-party
 * iframes finishing — which is how a fully-rendered page with every request
 * answered still timed out at 30 seconds in CI.
 */

const open = (page: import("@playwright/test").Page, path: string) =>
  page.goto(path, { waitUntil: "domcontentloaded" });

test.describe("V what a visitor can do", () => {
  test("V1: reads an article, arriving by clicking rather than by URL", async ({
    page,
  }) => {
    await open(page, "/posts");
    const first = page.locator('a[href^="/posts/"]').first();
    test.skip(
      (await first.count()) === 0,
      "no published post in this environment — nothing for a visitor to read",
    );

    const href = await first.getAttribute("href");
    await first.click();
    // Clicking is a different code path from `goto`: it is a soft navigation
    // through the client router, and that is where the calendar-toggle bug
    // lived, invisible to a suite that only ever used `goto`.
    // See docs/testing-incidents.md.
    await expect(page).toHaveURL((url) => url.pathname === href, {
      timeout: 15_000,
    });
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toBeVisible();
  });

  test("V2: browses the gallery and opens one", async ({ page }) => {
    await open(page, "/gallery");
    // Not any `/gallery/` href, and specifically not the first one.
    //
    // The index opens with a Swiper carousel, and Swiper binds pointer
    // handlers to drive dragging — a click inside a slide is consumed as the
    // start of a gesture, so the anchor's navigation never happens. Playwright
    // reports the click as successful and the URL simply stays put, which is
    // what this test spent three wrong hypotheses on. `.last()` lands in the
    // plain list below the carousel, where an anchor is just an anchor.
    //
    // The `:not([href*="/v/"])` excludes video permalinks
    // (`/gallery/<slug>/v/<id>`), which are galleries' children, not galleries.
    const first = page
      .locator('a[href^="/gallery/"]:not([href*="/v/"])')
      .last();
    test.skip((await first.count()) === 0, "no gallery in this environment");

    const href = await first.getAttribute("href");
    await first.click();
    await expect(page).toHaveURL((url) => url.pathname === href, {
      timeout: 15_000,
    });
    // Any heading, not `h1`. What a visitor needs is that the gallery they
    // clicked rendered its title; which tag carries it is the app's choice,
    // and asserting `h1` was this test asserting its own assumption — the
    // index itself titles cards with `h2`.
    await expect(page.getByRole("heading").first()).toBeVisible();
  });

  test("V4/V5: moves the race calendar and switches how it is shown", async ({
    page,
  }) => {
    await open(page, "/races");
    await expect(page.getByTestId("race-schedule")).toBeVisible();

    // By clicking the chip, not the container. `race-schedule-toggle` is the
    // wrapper around two links — clicking it hits the flexbox and nothing
    // happens, which is indistinguishable from a dead control.
    //
    // This is the regression the whole click-path idea came from: the URL
    // changed and the view did not, because the transition component keyed on
    // pathname alone. See docs/testing-incidents.md.
    const toggle = page.getByTestId("race-schedule-toggle");
    // Counts, not visibility. What this test is about is that the *view
    // swapped* — the calendar arrived and the list left. Whether the container
    // has a non-empty bounding box is a different question, and asserting it
    // made this fail on a page where the swap had demonstrably happened.
    await toggle.getByText("月曆", { exact: true }).click();
    await expect(page.getByTestId("race-calendar")).toHaveCount(1, {
      timeout: 15_000,
    });
    await expect(page.getByTestId("race-list")).toHaveCount(0);

    await toggle.getByText("列表", { exact: true }).click();
    await expect(page.getByTestId("race-list")).toHaveCount(1, {
      timeout: 15_000,
    });
    await expect(page.getByTestId("race-calendar")).toHaveCount(0);

    // And the window moves, without a reload.
    const older = page.getByTestId("race-pager-older");
    if (await older.count()) {
      await older.click();
      await expect(page.getByTestId("race-schedule")).toBeVisible();
    }
  });

  test("V6: opens a rider and sees their page", async ({ page }) => {
    await open(page, "/riders");
    const first = page.locator('a[href^="/riders/"]').first();
    test.skip((await first.count()) === 0, "no rider in this environment");

    const href = await first.getAttribute("href");
    await first.click();
    await expect(page).toHaveURL((url) => url.pathname === href, {
      timeout: 15_000,
    });
    await expect(page.getByTestId("rider-name")).toBeVisible();
  });

  test("V8: a URL that does not exist answers 404, not a page saying so", async ({
    page,
  }) => {
    // The status, not the body. Both used to answer 200 with the not-found
    // page inside, so crawlers indexed them as real pages — the body was
    // always right, which is exactly why asserting on it proved nothing.
    for (const path of [
      "/posts/definitely-not-a-post",
      "/gallery/definitely-not-a-gallery",
    ]) {
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(response?.status(), path).toBe(404);
    }
  });

  test("V10: the about page renders", async ({ page }) => {
    await open(page, "/about");
    await expect(page.locator("h1")).toBeVisible();
  });
});
