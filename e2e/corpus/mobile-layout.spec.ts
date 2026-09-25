import type { Page } from "@playwright/test";

import { expect, test } from "../helpers/test";
import { budget } from "../helpers/budget";

/**
 * X-MOBILE — the public site fits a phone.
 *
 * Two layout defects were measured at 320 and 375px on 2026-09-25 (see
 * docs/ux-mobile-review.md), both invisible to every other spec because the
 * suite runs at 1280px:
 *
 * - The article list scrolled sideways by 1654px. Each card's `<img>` carried its
 *   original's `width` with nothing constraining it, a grid item does not
 *   shrink below its min-content width, and so the grid track was ~2000px
 *   wide. Every title was cut in half and the page could be dragged left and
 *   right. Text is present, in order, in the right tags — nothing that asks
 *   "is it there" can see it.
 * - Page titles had a 12px line box under 36px type (`leading-3`). On one
 *   line nothing shows; the moment a long race name wraps, the second line
 *   is drawn over the first. Asserted on the computed line height rather
 *   than on a title that happens to wrap, so the check does not depend on
 *   which race names the catalogue holds this year.
 *
 * READS AMBIENT DATA, deliberately. The overflow needs a real cover image
 * wider than the screen, which is what the seeded corpus's articles have and
 * what an SVG fixture cannot provide (see post-cover.spec.ts on why fixtures
 * here are SVG). So this covers the whole class the corpus offers: every
 * public index page, and every article `/posts` links to — the pages where
 * covers, tables and images arrive from content nobody reviewed at 320px.
 */

const WIDTH = 320;

const INDEX_ROUTES = ["/", "/posts", "/gallery", "/races", "/riders", "/about"];

async function measure(page: Page) {
  return page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    const headings = [...document.querySelectorAll("h1")]
      .filter((h) => h.getBoundingClientRect().height > 0)
      .map((h) => {
        const style = getComputedStyle(h);
        return {
          text: (h.textContent ?? "").trim().slice(0, 30),
          fontSize: parseFloat(style.fontSize),
          // `normal` is never shorter than the type, so it passes as such.
          lineHeight:
            style.lineHeight === "normal"
              ? parseFloat(style.fontSize) * 1.2
              : parseFloat(style.lineHeight),
        };
      });
    return { overflow, headings };
  });
}

async function assertFits(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.locator("h1").first()).toBeVisible({ timeout: budget(20_000) });
  // Images decide the width that matters here, so wait for them to be laid
  // out — an `<img width>` sizes its box before its bytes arrive, but only
  // once the element exists.
  await page.waitForLoadState("load");

  const { overflow, headings } = await measure(page);
  expect(overflow, `${path} scrolls sideways at ${WIDTH}px`).toBeLessThanOrEqual(0);
  for (const heading of headings) {
    expect(
      heading.lineHeight,
      `${path}: 「${heading.text}」 has a ${heading.lineHeight}px line box under ${heading.fontSize}px type`,
    ).toBeGreaterThanOrEqual(heading.fontSize);
  }
}

test.describe("X-MOBILE the public site at phone width", () => {
  test.use({ viewport: { width: WIDTH, height: 640 }, isMobile: true, hasTouch: true });

  test("X-MOBILE-T1: no index page scrolls sideways or overlaps its title", async ({ page }) => {
    test.setTimeout(budget(120_000));
    for (const path of INDEX_ROUTES) {
      await assertFits(page, path);
    }
  });

  test("X-MOBILE-T2: no article scrolls sideways or overlaps its title", async ({ page }) => {
    test.setTimeout(budget(240_000));

    await page.goto("/posts", { waitUntil: "domcontentloaded" });
    const hrefs = await page
      .locator('main a[href*="/posts/"]')
      .evaluateAll((links) => [
        ...new Set(links.map((link) => new URL((link as HTMLAnchorElement).href).pathname)),
      ]);
    // corpus-scoped: the seeded corpus carries 15 published articles. None
    // means the seed step produced nothing, which is a red, not a skip.
    expect(hrefs.length, "no articles on /posts — the corpus is empty").toBeGreaterThan(0);

    for (const path of hrefs) {
      await assertFits(page, path);
    }
  });
});
