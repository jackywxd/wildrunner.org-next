import { expect, test } from "../helpers/test";
import { budget } from "../helpers/budget";

/**
 * V-TIMELINE — 時間機器, a member's races and articles on one rail.
 *
 * TWO FAILURES, BOTH INVISIBLE TO EVERY OTHER KIND OF ASSERTION.
 *
 * The rows animate in with framer-motion's `whileInView`, which server-renders
 * them at `opacity: 0` and clears it when an IntersectionObserver says they
 * have arrived. So the whole page can be present, correct, and unreadable —
 * and `toBeVisible()` would not notice: Playwright's visibility check reads
 * the box and `visibility`, never `opacity`. A row that never reveals passes
 * every "is this text on the page" assertion in the suite.
 *
 * The same inline `opacity: 0` is what a printout captures for anything the
 * reader had not scrolled past, which is why `@media print` in globals.css
 * overrides it and why T2 asserts against that override rather than against
 * the rule's presence in a stylesheet.
 *
 * CORPUS-SCOPED BY NATURE, like the rest of `visitor.spec.ts`: a timeline is
 * made of a member's own content, and a visitor cannot create any. The
 * subject is chosen from the directory rather than hardcoded, and a database
 * with no member content fails here loudly instead of skipping — CI seeds the
 * corpus, so absence means the seed broke.
 */

const open = (page: import("@playwright/test").Page, path: string) =>
  page.goto(path, { waitUntil: "domcontentloaded" });

/** The opacity every row must reach for the page to be readable at all. */
const opacities = (page: import("@playwright/test").Page) =>
  page
    .locator("[data-timeline-reveal]")
    .evaluateAll((rows) => rows.map((row) => getComputedStyle(row).opacity));

/**
 * The directory card of a member who has published something, and its href.
 *
 * The card carries its own count as an attribute — added because reading it
 * out of the card's text once parsed 3300 from 「TORX 330」.
 */
async function aMemberWithContent(page: import("@playwright/test").Page) {
  await open(page, "/riders");

  const card = page
    .locator('[data-testid="rider-card"]')
    .filter({ has: page.locator('[data-post-count]:not([data-post-count="0"])') })
    .first();
  await expect(
    card,
    "no member in the directory has published anything — the corpus is empty, not the page",
  ).toBeVisible();

  const href = await card.getAttribute("href");
  expect(href, "a rider card with no href").toBeTruthy();
  return { card, href: href as string };
}

test.describe("V-TIMELINE 時間機器", () => {
  test("V-TIMELINE-T1: every row is readable by the time the reader reaches the end", async ({
    page,
  }) => {
    // By clicking, the way a reader arrives — directory, profile, tab. That
    // tab is a soft navigation, and this suite has already shipped one bug
    // that lived entirely in soft navigation (docs/testing-incidents.md).
    const { card } = await aMemberWithContent(page);
    // The card *is* the anchor (riders/page.tsx renders a `<Link>` as the
    // card), so this clicks the card, not something inside it.
    await card.click();
    await expect(page.getByTestId("rider-name")).toBeVisible();

    await page
      .getByTestId("rider-view-tab")
      .and(page.locator('[data-view="timeline"]'))
      .click();
    await expect(page).toHaveURL(/\/riders\/[^/]+\/timeline$/, {
      timeout: budget(15_000),
    });
    await expect(page.getByTestId("rider-timeline")).toBeVisible();

    // Present in the DOM is not the claim. This is.
    const before = await opacities(page);
    expect(before.length, "the timeline rendered no rows").toBeGreaterThan(0);

    // Scroll the way a reader does — in steps, not one jump to the bottom,
    // because an IntersectionObserver reports what passed through the
    // viewport and a single jump can skip a row past it entirely.
    const height = await page.evaluate(() => window.innerHeight);
    for (let i = 0; i < 40; i += 1) {
      const done = await page.evaluate((step) => {
        const el = document.documentElement;
        const atEnd = window.scrollY + window.innerHeight >= el.scrollHeight - 1;
        window.scrollBy(0, step * 0.6);
        return atEnd;
      }, height);
      if (done) break;
      await page.waitForTimeout(budget(120));
    }
    // The last row's own reveal has a staggered delay before it starts.
    await page.waitForTimeout(budget(1_200));

    const after = await opacities(page);
    expect(
      after.filter((value) => value !== "1"),
      "rows finished scrolled past and still invisible",
    ).toEqual([]);
  });

  test("V-TIMELINE-T2: printing shows the rows the reader never scrolled to", async ({
    page,
  }) => {
    const { href } = await aMemberWithContent(page);
    // BY URL, NOT BY CLICKING, and that is the difference between this test
    // being deterministic and failing two runs in three.
    //
    // Arriving through the tab is a soft navigation, and the scroll that goes
    // with it drags every row through the viewport on the way. `whileInView`
    // is `once: true`, so all of them reveal — and this test would then find
    // nothing left hidden and trip its own precondition. Measured before it
    // was believed: the guard below was made to print what it saw, and it
    // said `["1","1","1","1","1","1"]`. T1 above is the test that covers
    // arriving by clicking; this one is about print, and a plain load is the
    // honest way to set it up.
    await open(page, `${href}/timeline`);
    await expect(page.getByTestId("rider-timeline")).toBeVisible();

    // Deliberately without scrolling: the rows below the fold are exactly the
    // ones framer-motion has left at `opacity: 0`, and they are what a
    // printout loses. Asserting after a scroll would prove nothing — they
    // would already be opaque for the other reason.
    const onScreen = await opacities(page);
    // Both halves of the precondition, separately, because they fail for
    // completely different reasons and a bare `.some()` reports them
    // identically: an empty locator also returns false.
    expect(onScreen.length, "no rows rendered at all").toBeGreaterThan(0);
    expect(
      onScreen.some((value) => value !== "1"),
      `nothing was left unrevealed, so this test cannot observe what it is for — saw ${JSON.stringify(onScreen)}`,
    ).toBe(true);

    await page.emulateMedia({ media: "print" });

    expect(
      (await opacities(page)).filter((value) => value !== "1"),
      "rows would print as blank space",
    ).toEqual([]);
  });
});
