import { expect, test } from "../helpers/test";
import { TEST_ADMIN } from "../helpers/auth";
import { budget } from "../helpers/budget";
import { recordCreated } from "../helpers/created";
import { deleteCreatedRows } from "../helpers/teardown";

/**
 * V-MEDIARACE — the media dialog's race control does not lose a tag it did
 * not ask about.
 *
 * THE FAILURE THIS EXISTS FOR is one this repo has already had once, in the
 * next field along. `MediaDetailDialog` used to write `usage` unconditionally
 * on save, so opening an article image to fix its alt text and pressing 儲存
 * silently reclassified it — the incident `src/lib/media/usage.ts` is written
 * around. The race control now has the identical shape and a worse version of
 * the same risk: the dialog is opened from a `depth: 0` list, so it does not
 * *know* which race the file carries until a second request tells it. If that
 * request has not answered, or fails, an empty picker plus an unconditional
 * write is a tag deleted by somebody editing a caption.
 *
 * Invisible by construction to every other kind of test: the API round-trips
 * `raceEdition` perfectly, and the page renders. Only driving the real dialog
 * shows what the save actually sends.
 *
 * The tagged file is created over the API rather than through the dropzone.
 * The subject here is the dialog; `P-PHOTO` already drives the upload control
 * for real, and duplicating it would buy a second copy of that coverage and
 * a slower test.
 */

/** In the catalogue, and a year no seeded edition holds — see M-EDITION. */
const RACE_SERIES = "others";
const RACE_EVENT_KEY = "other-leadville";
const RACE_YEAR = 2016;

const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"></svg>',
);

async function stubImages(page: import("@playwright/test").Page) {
  await page.route(/\/api\/media\/file\/|images\.wildrunner\.org/, (route) =>
    route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL }),
  );
}

test.describe("V-MEDIARACE editing a tagged file in the media dialog", () => {
  const created: { collection: string; id: number }[] = [];

  test.afterEach(async ({ request }) => {
    const pending = created.splice(0, created.length);
    await deleteCreatedRows(request, pending);
  });

  test("V-MEDIARACE-T1: saving an unrelated edit keeps the race; clearing it clears the race", async ({
    page,
    request,
  }) => {
    test.setTimeout(budget(60_000));

    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    const resolved = await request.post("/api/members/race-editions/resolve", {
      data: { eventId: RACE_EVENT_KEY, year: RACE_YEAR },
    });
    expect(resolved.ok(), await resolved.text()).toBeTruthy();
    const editionId = ((await resolved.json()) as { id: number }).id;

    const stamp = Date.now();
    const uploaded = await request.post("/api/media", {
      multipart: {
        file: {
          name: `v-mediarace-${stamp}.svg`,
          mimeType: "image/svg+xml",
          buffer: SVG,
        },
        _payload: JSON.stringify({
          alt: `V-MEDIARACE ${stamp}`,
          usage: "gallery",
          raceEdition: editionId,
        }),
      },
    });
    expect(uploaded.ok(), `upload failed: ${uploaded.status()}`).toBeTruthy();
    const mediaId = ((await uploaded.json()) as { doc: { id: number } }).doc.id;
    created.push({ collection: "media", id: mediaId });
    recordCreated({ collection: "media", id: mediaId, note: "V-MEDIARACE probe" });

    await stubImages(page);
    await page.goto("/members/login", { waitUntil: "domcontentloaded" });
    await page.getByTestId("member-login-email").fill(TEST_ADMIN.email);
    await page.getByTestId("member-login-password").fill(TEST_ADMIN.password);
    await page.getByTestId("member-login-submit").click();
    await expect(page).toHaveURL(/\/members$/, { timeout: budget(20_000) });

    // By clicking, not by URL — docs/testing-strategy.md §4.
    await page.getByTestId("member-nav-media").click();
    await expect(page.getByTestId("media-grid")).toBeVisible({
      timeout: budget(20_000),
    });

    // Addressed by its own id, never by position.
    await page.getByTestId(`media-item-${mediaId}`).click();
    const dialog = page.getByTestId("media-detail-dialog");
    await expect(dialog).toBeVisible({ timeout: budget(10_000) });

    // The picker opens showing what is stored, which is the half a `depth: 0`
    // list cannot supply on its own — `raceClaimForEdition` fetches it. A
    // blank picker here is the state that makes the save below destructive.
    await expect(dialog.getByTestId("race-event-select")).toHaveValue(
      RACE_EVENT_KEY,
      { timeout: budget(10_000) },
    );
    await expect(dialog.getByTestId("race-series-select")).toHaveValue(RACE_SERIES);
    await expect(dialog.getByTestId("race-year-select")).toHaveValue(
      String(RACE_YEAR),
    );

    // An edit that has nothing to do with the race.
    await dialog.getByTestId("media-detail-title").fill(`renamed ${stamp}`);
    await dialog.getByTestId("media-detail-save").click();
    await expect(dialog).toBeHidden({ timeout: budget(20_000) });

    const afterRename = await request.get(`/api/media/${mediaId}?depth=0`);
    expect(afterRename.ok()).toBeTruthy();
    const renamed = (await afterRename.json()) as {
      title: string;
      raceEdition: number | null;
    };
    expect(renamed.title).toBe(`renamed ${stamp}`);
    expect(
      renamed.raceEdition,
      "renaming a file must not untag the race it is from",
    ).toBe(editionId);

    // And the other direction: clearing it has to actually clear it, or the
    // control is a decoration.
    await page.getByTestId(`media-item-${mediaId}`).click();
    await expect(dialog).toBeVisible({ timeout: budget(10_000) });
    await expect(dialog.getByTestId("race-event-select")).toHaveValue(
      RACE_EVENT_KEY,
      { timeout: budget(10_000) },
    );
    await dialog.getByTestId("media-detail-race-clear").click();
    await dialog.getByTestId("media-detail-save").click();
    await expect(dialog).toBeHidden({ timeout: budget(20_000) });

    const afterClear = await request.get(`/api/media/${mediaId}?depth=0`);
    expect(afterClear.ok()).toBeTruthy();
    expect(
      ((await afterClear.json()) as { raceEdition: number | null }).raceEdition,
    ).toBeNull();
  });
});
