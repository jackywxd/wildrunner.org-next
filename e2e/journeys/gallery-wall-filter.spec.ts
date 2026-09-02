/**
 * V-WALLFILTER — /gallery's wall narrows and reorders at the server.
 *
 * THE FAILURE THIS EXISTS TO CATCH is the one that looks correct on screen.
 * The wall is cursor-paginated: the browser holds the first sixty of several
 * hundred and fetches more as the visitor scrolls. Filtering that in the
 * browser produces a plausible grid — whichever handful of the sixty are
 * videos — while everything past the cursor is unreachable, because the cursor
 * has already moved past rows the filter would have kept. Nothing errors and
 * nothing looks broken; the wall is simply missing most of itself, which is
 * precisely the shape of the member-library bug this shipped alongside.
 *
 * So the assertion is on the request. A client-side filter sends nothing, and
 * every visible-state assertion would still pass on the first page.
 *
 * Album pages are the deliberate exception and are asserted separately: an
 * album holds every item it will ever hold, so the same `arrangeMedia` runs in
 * the browser there — and its default must stay `curated`, because the album's
 * order is its curator's, which is what #95 and #102 were both for.
 */
import { expect, test } from "../helpers/test";
import { budget } from "../helpers/budget";

/** 1×1 transparent GIF, answered in-process so no request reaches the server. */
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

test.describe("V-WALLFILTER the wall filters where the rest of the wall is", () => {
  test("V-WALLFILTER-T1: 影片 asks the server for videos, and the grid then holds only videos", async ({
    page,
  }) => {
    test.setTimeout(budget(60_000));

    // The corpus is hundreds of absolute images.wildrunner.org URLs the
    // sandbox cannot route; without this the console guard fails on the
    // corpus rather than on anything this journey did.
    await page.route(/\/api\/media\/file\/|images\.wildrunner\.org/, (route) =>
      route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL }),
    );

    await page.goto("/gallery", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("gallery-all-photos")).toBeVisible({
      timeout: budget(20_000),
    });

    const photosBefore = await page.getByTestId("gallery-video-tile").count();

    const request = page.waitForRequest(
      (candidate) => candidate.url().includes("/api/gallery/wall?"),
      { timeout: budget(20_000) },
    );
    await page.getByTestId("gallery-filter-kind-video").click();
    const url = new URL((await request).url());

    expect(url.searchParams.get("kind")).toBe("video");
    // No cursor: a filter is a new list, not a continuation of the old one.
    // Carrying the cursor would resume in the middle of a list that no longer
    // exists and drop everything before it.
    expect(url.searchParams.get("createdAt")).toBeNull();

    // The corpus seeds 22 videos, so this cannot be vacuous — and every tile
    // on screen has to be one of them.
    await expect
      .poll(() => page.getByTestId("gallery-video-tile").count(), {
        timeout: budget(20_000),
      })
      .toBeGreaterThan(photosBefore);

    // react-photo-album renders one child per item; a photo among them would
    // be a `NextJsImage`, never a video tile.
    const tiles = await page.getByTestId("gallery-video-tile").count();
    const images = await page
      .locator("[data-testid='gallery-all-photos'] img")
      .count();
    expect(
      images,
      "a video filter that still draws photos is filtering the page, not the wall",
    ).toBe(0);
    expect(tiles).toBeGreaterThan(0);
  });

  test("V-WALLFILTER-T2: an album opens in its curator's order, not by date", async ({
    page,
    request,
  }) => {
    test.setTimeout(budget(60_000));

    await page.route(/\/api\/media\/file\/|images\.wildrunner\.org/, (route) =>
      route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL }),
    );

    // Any published album will do; the claim is about the control's default,
    // not about a particular album's contents.
    const albums = await request.get(
      "/api/galleries?limit=1&depth=0&where[_status][equals]=published",
    );
    expect(
      albums.ok(),
      `could not read an album: ${albums.status()}`,
    ).toBeTruthy();
    const slug = (await albums.json()).docs?.[0]?.slug as string | undefined;
    expect(
      slug,
      "the seeded corpus has 20 galleries — reseed with pnpm db:reset:local",
    ).toBeTruthy();

    await page.goto(`/gallery/${slug}`, { waitUntil: "domcontentloaded" });

    // `curated` — the album's own order — and the wall's own two orders are
    // offered below it. A default of 最新 here would silently reorder every
    // album on the site the day this shipped.
    const sort = page.getByTestId("gallery-filter-sort");
    await expect(sort).toBeVisible({ timeout: budget(20_000) });
    await expect(sort).toHaveValue("curated");
  });
});
