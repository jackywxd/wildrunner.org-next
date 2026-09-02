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
import { TEST_ADMIN } from "../helpers/auth";
import { budget } from "../helpers/budget";
import { recordCreated } from "../helpers/created";
import { deleteCreatedRows } from "../helpers/teardown";

/** 1×1 transparent GIF, answered in-process so no request reaches the server. */
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

test.describe("V-WALLFILTER the wall filters where the rest of the wall is", () => {
  const created: { collection: string; id: number }[] = [];

  test.afterEach(async ({ request }) => {
    const pending = created.splice(0, created.length);
    await deleteCreatedRows(request, pending);
  });

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

  test("V-WALLFILTER-T3: 賽事 is offered only when there is one, and it asks the server too", async ({
    page,
    request,
  }) => {
    test.setTimeout(budget(90_000));

    await page.route(/\/api\/media\/file\/|images\.wildrunner\.org/, (route) =>
      route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL }),
    );

    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    // Made rather than looked for. The seeded corpus tags no media with a
    // race at all — measured, 0 of 546 — so a spec that reached for an
    // existing one would be skipping itself on a clean database, which is
    // exactly where it needs to run.
    const resolved = await request.post("/api/members/race-editions/resolve", {
      data: { eventId: "other-vermont", year: 2012 },
    });
    expect(resolved.ok(), await resolved.text()).toBeTruthy();
    const editionId = ((await resolved.json()) as { id: number }).id;

    const stamp = Date.now();
    const uploaded = await request.post("/api/media", {
      multipart: {
        file: {
          name: `v-wallfilter-race-${stamp}.svg`,
          mimeType: "image/svg+xml",
          buffer: Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"></svg>',
          ),
        },
        _payload: JSON.stringify({
          alt: `V-WALLFILTER race ${stamp}`,
          usage: "gallery",
          raceEdition: editionId,
        }),
      },
    });
    expect(uploaded.ok(), `fixture upload failed: ${uploaded.status()}`).toBeTruthy();
    const mediaId = ((await uploaded.json()) as { doc: { id: number } }).doc.id;
    created.push({ collection: "media", id: mediaId });
    recordCreated({ collection: "media", id: mediaId, note: "V-WALLFILTER race" });

    await page.goto("/gallery", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("gallery-all-photos")).toBeVisible({
      timeout: budget(20_000),
    });

    const select = page.getByTestId("gallery-filter-race");
    await expect(
      select,
      "one tagged photo is one race, so the control has something to offer",
    ).toBeVisible({ timeout: budget(20_000) });

    // Same assertion shape as T1 and for the same reason: the wall is
    // cursor-paginated, so narrowing it in the browser would show whichever
    // of the loaded sixty match and hide the rest behind a moved cursor.
    const wallRequest = page.waitForRequest(
      (candidate) => candidate.url().includes("/api/gallery/wall?"),
      { timeout: budget(20_000) },
    );
    await select.selectOption(String(editionId));
    const url = new URL((await wallRequest).url());
    expect(url.searchParams.get("race")).toBe(String(editionId));
    // A filter is a new list, not a continuation — carrying the cursor would
    // resume in the middle of a list that no longer exists.
    expect(url.searchParams.get("createdAt")).toBeNull();

    // fixture-scoped: this race is one this test created, so its whole wall
    // is the single file it tagged. "One" is the assertion — a filter applied
    // to the page rather than to the wall would leave the other hundreds.
    await expect
      .poll(
        () => page.locator("[data-testid='gallery-all-photos'] img").count(),
        { timeout: budget(20_000) },
      )
      .toBe(1);
  });
});
