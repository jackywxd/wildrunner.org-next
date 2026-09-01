/**
 * A member tags an uploaded photo with a race, and it reaches that race's
 * public photo wall.
 *
 * `docs/testing-strategy.md` §"A member" already listed "uploads photos...
 * and sees them in their library" as a journey the suite was missing before
 * this file. What is new here is not the upload — it is `media.raceEdition`:
 * a photo is not first-person the way a race record is (docs/plan's model
 * section — "相片不是第一人稱"), so the claim worth pinning is specifically
 * that tagging it makes it visible on `/races/[key]/[year]`, not merely that
 * the field round-trips through the API.
 *
 * Drives the real upload control (`UploadDropzone`) rather than POSTing to
 * `/api/media` and reading the page back — that would prove the API and the
 * renderer agree, not that a member can do this.
 */
import { expect, test } from "../helpers/test";
import { TEST_ADMIN } from "../helpers/auth";
import { budget } from "../helpers/budget";
import { getWithRetry } from "../helpers/request";
import { deleteCreatedRows } from "../helpers/teardown";

test.describe("P a member tags a photo with a race", () => {
  /**
   * Deletes by id, not by any pattern. The fixture image is
   * `public/static/brand/mark-purple.svg` — real content the site itself
   * renders (the member-nav mark), tracked, and small (496 bytes).
   *
   * Two wrong choices before this one, both invisible locally and only
   * failing in CI, for different reasons:
   *
   * `public/static/cover.png` exists on disk here but was never
   * `git add`ed — `.gitignore`'s `/public/static/*` excludes everything
   * under this directory except `brand/`. Passed on every local run because
   * the untracked file was simply sitting there; CI's fresh checkout had no
   * such file at all.
   *
   * `public/static/brand/lockup-horizontal.png` fixed that — tracked,
   * `brand/` is the exception — but `.gitattributes` routes every
   * `*.png`/`*.jpg`/`*.webp` through Git LFS, and this repo's CI checks out
   * with `lfs: false` deliberately (`.github/workflows/e2e.yml`,
   * `scripts/assert-no-lfs-in-builds.mjs` — the same reason Workers Builds
   * skips LFS smudge). Locally the real bytes are already smudged in place,
   * so the upload succeeds; in CI the file is the raw LFS pointer text, and
   * Payload correctly refuses it as an invalid image. `.gitattributes`
   * doesn't route `*.svg` through LFS, which is what makes this one safe.
   *
   * Captured the moment the upload response is seen, before any assertion
   * that could fail and skip the delete.
   */
  let createdMediaId: number | null = null;

  test.afterEach(async ({ request }) => {
    if (!createdMediaId) return;
    const id = createdMediaId;
    createdMediaId = null;
    await deleteCreatedRows(request, [{ collection: "media", id }]);
  });

  test("P-PHOTO: uploads a photo tagged with a race, and it appears on that race's wall", async ({
    page,
  }) => {
    test.setTimeout(budget(60_000));

    await page.goto("/members/login", { waitUntil: "domcontentloaded" });
    await page.getByTestId("member-login-email").fill(TEST_ADMIN.email);
    await page.getByTestId("member-login-password").fill(TEST_ADMIN.password);
    await page.getByTestId("member-login-submit").click();
    await expect(page).toHaveURL(/\/members$/, { timeout: budget(15_000) });

    // By clicking, not by URL — the calendar-toggle bug lived entirely in
    // soft navigation, invisible to a suite that only ever used `goto`.
    await page.getByTestId("member-nav-media").click();
    await expect(page).toHaveURL(/\/members\/media/, { timeout: budget(15_000) });

    const raceSelect = page.getByTestId("media-upload-race-edition");
    // The picker only renders once a file is chosen — see UploadDropzone.tsx —
    // so its presence here is itself evidence the seeded corpus has at least
    // one already-started edition. If it never appears, that is a real gap
    // worth failing loudly on rather than silently skipping the tag.
    await page
      .getByTestId("media-upload-input")
      .setInputFiles("public/static/brand/mark-purple.svg");

    await expect(raceSelect).toBeVisible({ timeout: budget(5_000) });
    const editionId = await raceSelect
      .locator("option:not([value=''])")
      .first()
      .getAttribute("value");
    if (!editionId) throw new Error("no already-started race edition in the seeded corpus");
    await raceSelect.selectOption(editionId);

    const uploadResponse = page.waitForResponse(
      (res) => res.url().includes("/api/media") && res.request().method() === "POST",
    );
    await page.getByTestId("media-upload-start").click();
    const response = await uploadResponse;
    const body = (await response.json()) as { doc?: { id: number } };
    if (!body.doc?.id) throw new Error("upload response carried no document id");
    // Captured before the next await, so a failure below still lets
    // afterEach find it.
    createdMediaId = body.doc.id;

    await expect(page.getByTestId("media-upload-done")).toBeVisible({
      timeout: budget(20_000),
    });

    // Resolve which race this edition actually is — the select only carries
    // the id, and the public wall lives at `/races/[event-key]/[year]`.
    const edition = await getWithRetry(page.request, `/api/race-editions/${editionId}?depth=1`);
    expect(edition.ok(), "the edition just offered in the picker should be readable").toBe(true);
    const editionBody = (await edition.json()) as {
      year: number;
      event: { key: string };
    };

    // The public payoff. A direct navigation here, not a click chain: this is
    // the same "did my action have this effect elsewhere" shape as
    // `member-races.spec.ts`'s badge check, which uses `page.goto("/riders")`
    // for the identical reason — the path already has its own click-arrival
    // coverage (`race-photo-wall-link` on `/races`), so this step is about
    // the wall's content, not about how a visitor reaches it.
    await page.goto(`/races/${editionBody.event.key}/${editionBody.year}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("race-photo-wall-empty")).toHaveCount(0, {
      timeout: budget(15_000),
    });
    await expect(page.getByTestId("race-photo-wall")).toBeVisible();

    // getRaceEditionPhotos resolves the uploader to an author's public
    // name/slug and never populates `users` (content.ts) — the same shape
    // of leak `posts.raceRecord` guards against at depth. This is the new
    // page with the same risk, so it gets the same assertion.
    expect(await page.content()).not.toContain("sessions");
  });
});
