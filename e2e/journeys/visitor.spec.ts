import { expect, test } from "../helpers/test";
import { budget } from "../helpers/budget";

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
    // No skip-if-absent guard, deliberately. An earlier version had one, and
    // on CI — where the database starts empty — this journey and two others
    // quietly *skipped* while the run reported green. A site with nothing to
    // read is not a reason to stop testing; it is the most serious thing this
    // journey could discover. CI seeds the corpus (.github/workflows/e2e.yml),
    // so absence here means the seed broke or the page stopped listing.
    await expect(first).toBeVisible();

    const href = await first.getAttribute("href");
    await first.click();
    // Clicking is a different code path from `goto`: it is a soft navigation
    // through the client router, and that is where the calendar-toggle bug
    // lived, invisible to a suite that only ever used `goto`.
    // See docs/testing-incidents.md.
    await expect(page).toHaveURL((url) => url.pathname === href, {
      timeout: budget(15_000),
    });
    // The article's own title, not every h1 on the page. The count is what
    // matters — a duplicated page subtree renders the title twice — but
    // `h1` alone counts the *document's* headings too, and a member who
    // types `# 標題` is following the shortcut list the editor now shows
    // them. Scoped to the direct child of <article>, which is the title and
    // nothing else: body headings render inside .article-body.
    const title = page.locator("article > h1");
    await expect(title).toHaveCount(1);
    await expect(title).toBeVisible();
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

    /**
     * Wait for the page transition to finish before touching the page again.
     *
     * `PageTransitionEffect` crossfades routes with `AnimatePresence`, which
     * keeps the outgoing subtree mounted for the length of the animation —
     * so for `transitionApple`'s 300ms *both* copies of the schedule are in
     * the DOM, each with its own toggle. Measured, not assumed: sampling the
     * DOM every 25ms across a click showed `race-schedule-toggle` at 2 for
     * ~350ms before settling back to 1.
     *
     * A click during that window resolves to two elements and fails on
     * strict mode, which is exactly how this test went red on staging while
     * passing here — the window is real everywhere, and only the machine's
     * speed decides whether a click lands inside it. Asserting the count is
     * the honest wait: it says what is being waited for, and it would fail
     * loudly if a transition ever stopped settling.
     */
    const settled = async () => {
      await expect(toggle).toHaveCount(1, { timeout: budget(15_000) });
    };

    await settled();
    // Counts, not visibility. What this test is about is that the *view
    // swapped* — the calendar arrived and the list left. Whether the container
    // has a non-empty bounding box is a different question, and asserting it
    // made this fail on a page where the swap had demonstrably happened.
    await toggle.getByText("月曆", { exact: true }).click();
    await expect(page.getByTestId("race-calendar")).toHaveCount(1, {
      timeout: budget(15_000),
    });
    await expect(page.getByTestId("race-list")).toHaveCount(0);

    await settled();
    await toggle.getByText("列表", { exact: true }).click();
    await expect(page.getByTestId("race-list")).toHaveCount(1, {
      timeout: budget(15_000),
    });
    await expect(page.getByTestId("race-calendar")).toHaveCount(0);

    await settled();

    // And the window moves, without a reload.
    const older = page.getByTestId("race-pager-older");
    if (await older.count()) {
      await older.click();
      await expect(page.getByTestId("race-schedule")).toBeVisible();
    }
  });

  test("V6: opens a rider and sees their page", async ({ page }) => {
    await open(page, "/riders");
    // The rider card itself, not "the first link starting /riders/".
    //
    // That prefix was a proxy for "a member", and it stopped being one the
    // moment the directory grew a second kind of `/riders/…` link: the club
    // timeline at /riders/timeline, which sits above the cards and is not a
    // person. The test then clicked it, navigated correctly, and failed
    // looking for a name — reporting a missing member on a page that has
    // none by design. The card carries its own testid and *is* the anchor
    // (riders/page.tsx renders a `<Link>` as the card), so this asks for the
    // thing the test is named after.
    const first = page.getByTestId("rider-card").first();
    await expect(first).toBeVisible();

    const href = await first.getAttribute("href");
    await first.click();
    await expect(page).toHaveURL((url) => url.pathname === href, {
      timeout: budget(15_000),
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

  test("V10: the about page renders, in the language it is written in", async ({
    page,
  }) => {
    const response = await open(page, "/about");
    await expect(page.locator("h1")).toBeVisible();

    // The site is Traditional Chinese and declared itself English for the
    // life of the repository. `lang` decides the voice a screen reader
    // picks, what a search engine indexes the page as, and one of the
    // signals a browser uses to choose a CJK fallback face — a page saying
    // `en` can be drawn with Japanese or Simplified glyph forms for
    // characters the scripts share.
    //
    // Counted, not sampled. docs/testing-incidents.md records a probe that
    // grepped the served HTML for `<html lang` and took `head -1`: it
    // answered `en` under every condition tried, because the page had *two*
    // `<html>` elements and the one it read was hardcoded. The count is the
    // assertion that could have caught that, so it is here beside the value.
    const served = (await response?.text()) ?? "";
    expect(served.match(/<html[\s>]/g)?.length ?? 0).toBe(1);
    expect(served).toContain('lang="zh-Hant"');

    // And it is still that once the client has had its turn.
    //
    // This half exists because the first version of V10 had only the half
    // above, expressed as `toHaveAttribute` — which polls *until it
    // matches* and then stops looking. `I18nProvider` ran
    // `document.documentElement.lang = "en"` in an effect, so the served
    // HTML was right, the first sample matched, and the assertion passed
    // while every visitor's browser held "en". It was green locally through
    // the entire life of that bug and red on staging, purely on which side
    // of hydration the first sample landed. A value that is rewritten after
    // the fact has to be watched, not sampled.
    //
    // `load` bounds the wait on the JS being fetched; the settle after it
    // covers hydration, for which the App Router exposes no signal. Arriving
    // by a click would prove hydration outright, but the nav is built from
    // the Site global (src/lib/nav.ts), and a spec for the document language
    // must not fail because someone edited a menu.
    expect(await page.locator("html").count()).toBe(1);
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hant");
    await page.waitForLoadState("load");
    await page.waitForTimeout(budget(1_500));
    expect(await page.locator("html").getAttribute("lang")).toBe("zh-Hant");
  });
});
