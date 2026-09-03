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
 * Open the timeline of a member who has something on it, by clicking.
 *
 * Arrives the way a reader does — directory, profile, tab — because that tab
 * is a soft navigation and this suite has already shipped one bug that lived
 * entirely in soft navigation (docs/testing-incidents.md).
 */
async function openTimelineOfAMemberWithContent(
  page: import("@playwright/test").Page,
) {
  await open(page, "/riders");

  // The rider card carries its own count as an attribute — added because
  // reading it out of the card's text once parsed 3300 from 「TORX 330」.
  const withPosts = page
    .locator('[data-testid="rider-card"]')
    .filter({
      has: page.locator('[data-post-count]:not([data-post-count="0"])'),
    })
    .first();
  await expect(
    withPosts,
    "no member in the directory has published anything — the corpus is empty, not the page",
  ).toBeVisible();

  // The card *is* the anchor (riders/page.tsx renders a `<Link>` as the card),
  // so this clicks the card, not something inside it.
  await withPosts.click();
  await expect(page.getByTestId("rider-name")).toBeVisible();

  await page
    .getByTestId("rider-view-tab")
    .and(page.locator('[data-view="timeline"]'))
    .click();
  await expect(page).toHaveURL(/\/riders\/[^/]+\/timeline$/, {
    timeout: budget(15_000),
  });
  await expect(page.getByTestId("rider-timeline")).toBeVisible();
}

test.describe("V-TIMELINE 時間機器", () => {
  test("V-TIMELINE-T1: every row is readable by the time the reader reaches the end", async ({
    page,
  }) => {
    await openTimelineOfAMemberWithContent(page);

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
        const atEnd =
          window.scrollY + window.innerHeight >= el.scrollHeight - 1;
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
    await openTimelineOfAMemberWithContent(page);

    // Deliberately without scrolling: the rows below the fold are exactly the
    // ones framer-motion has left at `opacity: 0`, and they are what a
    // printout loses. Asserting after a scroll would prove nothing — they
    // would already be opaque for the other reason.
    const onScreen = await opacities(page);
    expect(
      onScreen.some((value) => value !== "1"),
      "nothing was left unrevealed, so this test cannot observe what it is for — the member's timeline is shorter than one screen",
    ).toBe(true);

    await page.emulateMedia({ media: "print" });

    expect(
      (await opacities(page)).filter((value) => value !== "1"),
      "rows would print as blank space",
    ).toEqual([]);
  });

  test("V-TIMELINE-T3: the rail can be had as a PDF file, and says when it cannot", async ({
    page,
    request,
  }) => {
    await openTimelineOfAMemberWithContent(page);
    const slug = new URL(page.url()).pathname.split("/")[2];

    // TWO BUTTONS THAT DO DIFFERENT THINGS, and the second one is new: 列印
    // opens the browser's dialog on this page, 下載 PDF asks the server to
    // render the same URL through Browser Rendering — the only way to get a
    // page number on every sheet. The button is the article print page's,
    // shared rather than copied (`PrintDownloadButton`).
    await expect(page.getByTestId("rider-timeline-print")).toBeVisible();
    await expect(page.getByTestId("rider-timeline-download")).toBeVisible();

    // 503 is the right answer in this environment and is asserted rather than
    // skipped around: Browser Rendering is absent in dev and CI by
    // construction, exactly as the transcoder is. Read through `request` so
    // no browser sees the 5xx — the console guard is right to refuse one.
    const download = await request.get(`/api/print/riders/${slug}/timeline`);
    expect(
      download.status(),
      "the timeline download must report that no renderer is configured, not quietly fail",
    ).toBe(503);

    // The club rail deliberately has no download: it is an infinite scroll,
    // so a server-side render would produce a PDF silently missing everything
    // past page one. Its print button loads the rest first, which nothing
    // outside a browser can do.
    await open(page, "/riders/timeline");
    await expect(page.getByTestId("club-timeline-print")).toBeVisible();
    await expect(page.getByTestId("rider-timeline-download")).toHaveCount(0);
  });
});
