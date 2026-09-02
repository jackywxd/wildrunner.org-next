/**
 * V-MEDIALIB — the member media library is a window onto the library, and
 * says so.
 *
 * THE BUG THIS EXISTS FOR was invisible by construction. The page asked for
 * `limit=100`, drew whatever came back, and offered no count and no next page.
 * On the seeded corpus that is 100 rows of 546. An admin — whose `read` rule
 * returns `true` rather than an owner clause — was therefore missing four
 * fifths of the library with nothing on screen saying anything was missing,
 * which is exactly how it was reported: "why can't I see all the videos and
 * photos here, when /admin shows them?"
 *
 * So the assertions are about the gap between what is drawn and what exists.
 * A test that only counted tiles would have passed the entire time the bug was
 * there — 100 tiles is 100 tiles.
 *
 * WHY THE FILTER CASES WATCH THE REQUEST. Narrowing a paginated list in the
 * browser is the failure mode that looks right: filter page 1 of 23 to videos
 * and you get the four videos that happen to be on that page, a plausible
 * grid, and 500 rows unreachable behind a page number that no longer means
 * anything. The only way to tell the two implementations apart from outside is
 * to look at what was asked of the server, so that is what these assert —
 * alongside the total, which is the server's own answer and cannot be faked by
 * a client-side filter.
 */
import { expect, test } from "../helpers/test";
import { TEST_ADMIN } from "../helpers/auth";
import { budget } from "../helpers/budget";
import { recordCreated } from "../helpers/created";
import {
  TEST_MEMBER,
  adminContext,
  ensureMemberUser,
} from "../helpers/members";
import { deleteCreatedRows } from "../helpers/teardown";

/** The same fixture shape gallery-video-poster.spec.ts uploads: a real ftyp box. */
const MP4_HEADER = Buffer.concat([
  Buffer.from("00000018", "hex"),
  Buffer.from("ftypmp42"),
  Buffer.from("00000000", "hex"),
  Buffer.from("mp42isom"),
  Buffer.alloc(1024),
]);

/** 1×1 transparent GIF, answered in-process so no request reaches the server. */
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

/**
 * The library renders a thumbnail for every file on the page, all of them
 * absolute images.wildrunner.org URLs the sandbox cannot route. Without this
 * the console guard fails on the corpus rather than on anything the journey
 * did — the same interception gallery-video-poster.spec.ts needs.
 */
async function stubImages(page: import("@playwright/test").Page) {
  await page.route(/\/api\/media\/file\/|images\.wildrunner\.org/, (route) =>
    route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL }),
  );
}

async function signIn(
  page: import("@playwright/test").Page,
  credentials: { email: string; password: string },
) {
  await page.goto("/members/login", { waitUntil: "domcontentloaded" });
  await page.getByTestId("member-login-email").fill(credentials.email);
  await page.getByTestId("member-login-password").fill(credentials.password);
  await page.getByTestId("member-login-submit").click();
  await expect(page).toHaveURL(/\/members$/, { timeout: budget(20_000) });
}

/**
 * By clicking, not by URL — a link a member uses is a link a test uses.
 *
 * Waits for either grid state, because both mean the same thing here: the
 * query came back. The empty one is not a fallback — TEST_MEMBER owns nothing
 * in the seeded corpus, so it is the only state their library can be in, and
 * a helper that insisted on `media-grid` could never reach the member half of
 * T4 at all. Each test then asserts the state it actually needs.
 */
async function openLibrary(page: import("@playwright/test").Page) {
  await page.getByTestId("member-nav-media").click();
  await expect(
    page.getByTestId("media-grid").or(page.getByTestId("media-grid-empty")),
  ).toBeVisible({ timeout: budget(20_000) });
}

/** The number out of "共 N 個檔案", which is the server's `totalDocs`. */
async function totalDocs(
  page: import("@playwright/test").Page,
): Promise<number> {
  const text =
    (await page.getByTestId("media-pager-total").textContent()) ?? "";
  const digits = text.match(/\d+/)?.[0];
  expect(
    digits,
    `could not read a total out of ${JSON.stringify(text)}`,
  ).toBeTruthy();
  return Number(digits);
}

test.describe("V-MEDIALIB the member library pages, filters and shows its videos", () => {
  const created: { collection: string; id: number }[] = [];

  test.afterEach(async ({ request }) => {
    const pending = created.splice(0, created.length).reverse();
    await deleteCreatedRows(request, pending);
  });

  test("V-MEDIALIB-T1: the count is the library's, not the page's, and 下一頁 moves through it", async ({
    page,
  }) => {
    test.setTimeout(budget(60_000));
    await stubImages(page);
    await signIn(page, TEST_ADMIN);
    await openLibrary(page);

    const total = await totalDocs(page);
    const onScreen = await page
      .getByTestId("media-grid")
      .locator("> button")
      .count();

    // Stated rather than implied, so a corpus that shrank below one page fails
    // with the reason rather than with a confusing "0 is not greater than 0".
    // `pnpm db:reset:local` seeds 546 media rows; CI rebuilds the same corpus.
    expect(
      total,
      "this journey needs a library bigger than one page — reseed with pnpm db:reset:local",
    ).toBeGreaterThan(onScreen);
    expect(
      onScreen,
      "a page must not exceed the page size it asked for",
    ).toBeLessThanOrEqual(24);

    // The pager's own claim about where it is, which is the part the old page
    // could not make at all.
    await expect(page.getByTestId("media-pager-page")).toHaveText(
      /第 1 \/ [2-9]/,
    );
    await expect(page.getByTestId("media-pager-prev")).toBeDisabled();

    const firstOnPageOne = await page
      .getByTestId("media-grid")
      .locator("> button")
      .first()
      .getAttribute("data-testid");

    await page.getByTestId("media-pager-next").click();
    await expect(page.getByTestId("media-pager-page")).toHaveText(/第 2 \//, {
      timeout: budget(15_000),
    });

    // Different rows, not the same rows renumbered. The failure this catches
    // is a pager that moves its label and re-requests page 1.
    await expect
      .poll(
        async () =>
          page
            .getByTestId("media-grid")
            .locator("> button")
            .first()
            .getAttribute("data-testid"),
        { timeout: budget(15_000) },
      )
      .not.toBe(firstOnPageOne);

    await expect(page.getByTestId("media-pager-prev")).toBeEnabled();
  });

  test("V-MEDIALIB-T2: 影片 narrows the query on the server, not the page", async ({
    page,
  }) => {
    test.setTimeout(budget(60_000));
    await stubImages(page);
    await signIn(page, TEST_ADMIN);
    await openLibrary(page);

    const unfiltered = await totalDocs(page);

    const request = page.waitForRequest(
      (candidate) =>
        candidate.url().includes("/api/media?") &&
        candidate.url().includes("mimeType"),
      { timeout: budget(15_000) },
    );
    await page.getByTestId("media-filter-kind-video").click();
    const url = (await request).url();

    // The clause itself. A client-side filter would send the same URL it sent
    // before, and every other assertion here would still pass on page 1.
    expect(decodeURIComponent(url)).toContain("where[mimeType][like]=video/");
    // Back to the first page with it: page 4 of 12 is not page 4 of 2, and
    // Payload answers an out-of-range page with an empty list and no error.
    expect(decodeURIComponent(url)).toContain("page=1");

    // The server's own count of the narrowed set — the number a client-side
    // filter cannot produce, because it never asked.
    await expect
      .poll(() => totalDocs(page), { timeout: budget(15_000) })
      .toBeLessThan(unfiltered);

    // ...and every tile drawn really is a video. The tile is the shared
    // `VideoPosterTile`, so its presence is what distinguishes the two kinds.
    const tiles = page.getByTestId("media-grid").locator("> button");
    const count = await tiles.count();
    expect(
      count,
      "the corpus has videos; a video filter returning none is the bug",
    ).toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) {
      await expect(
        tiles
          .nth(i)
          .getByTestId("media-item-poster")
          .or(tiles.nth(i).locator("svg")),
      ).toBeVisible();
    }
  });

  test("V-MEDIALIB-T3: a video's tile draws the frame that was picked for it", async ({
    page,
    request,
  }) => {
    test.setTimeout(budget(60_000));

    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    const stamp = Date.now();
    const uploaded = await request.post("/api/media", {
      multipart: {
        file: {
          name: `v-medialib-${stamp}.mp4`,
          mimeType: "video/mp4",
          buffer: MP4_HEADER,
        },
        _payload: JSON.stringify({
          alt: `V-MEDIALIB ${stamp}`,
          usage: "private",
        }),
      },
    });
    expect(uploaded.ok(), `upload failed: ${uploaded.status()}`).toBeTruthy();
    const videoId = (await uploaded.json()).doc.id as number;
    created.push({ collection: "media", id: videoId });
    recordCreated({
      collection: "media",
      id: videoId,
      note: "V-MEDIALIB video",
    });

    // What `/poster-result` writes when the container reports a frame back.
    // `posterUrl` is `readOnly` in the admin panel only — that flag never
    // reaches the REST API — so this is the same write the container performs.
    const patched = await request.patch(`/api/media/${videoId}`, {
      data: {
        posterUrl: `https://images.wildrunner.org/posters/${videoId}.jpg`,
      },
    });
    expect(
      patched.ok(),
      `poster update failed: ${patched.status()}`,
    ).toBeTruthy();

    await stubImages(page);
    await signIn(page, TEST_ADMIN);
    await openLibrary(page);

    // Newest first is the default sort, so this upload is on page 1 — but
    // addressed by its own id regardless, never by position.
    const tile = page.getByTestId(`media-item-${videoId}`);
    await expect(
      tile,
      "a just-uploaded file belongs on the first page of 最新上傳",
    ).toBeVisible({
      timeout: budget(15_000),
    });

    // THE REGRESSION THIS PINS: this screen drew the string "▶ 影片" on a grey
    // box for every video, so the one place a member chooses a cover frame was
    // the only place that never showed them the frame they chose.
    const poster = tile.getByTestId("media-item-poster");
    await expect(poster).toBeVisible({ timeout: budget(15_000) });
    // On `srcset` rather than `src`: next/image's custom loader rewrites both,
    // and `src` is only the largest fallback candidate.
    await expect(poster).toHaveAttribute(
      "srcset",
      new RegExp(`posters/${videoId}\\.jpg`),
    );
  });

  test("V-MEDIALIB-T4: 只顯示我的 is an admin control, and it asks the server for an owner", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(budget(60_000));

    const admin = await adminContext(baseURL);
    await ensureMemberUser(admin);
    const me = await (await admin.get("/api/users/me")).json();
    const adminId = me.user.id as number;

    await stubImages(page);
    await signIn(page, TEST_ADMIN);
    await openLibrary(page);

    const control = page.getByTestId("media-filter-mine");
    await expect(
      control,
      "an admin sees every member's media and needs a way to exclude it",
    ).toBeVisible();

    const request = page.waitForRequest(
      (candidate) =>
        candidate.url().includes("/api/media?") &&
        candidate.url().includes("owner"),
      { timeout: budget(15_000) },
    );
    await control.check();
    expect(decodeURIComponent((await request).url())).toContain(
      `where[owner][equals]=${adminId}`,
    );

    // A member's read rule already scopes every query to their own rows, so
    // the same control would be one that cannot change the answer — and a
    // checkbox that never does anything teaches a member the library might
    // otherwise be showing them somebody else's files.
    await page.context().clearCookies();
    await signIn(page, TEST_MEMBER);
    await openLibrary(page);
    await expect(
      page.getByTestId("media-filter-mine"),
      "a member's own view is already owner-scoped; the control would be inert",
    ).toHaveCount(0);

    await admin.dispose();
  });
});
