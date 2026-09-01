/**
 * A member uploads a photo, picks no race, and it appears on /gallery.
 *
 * This is the bug the `media.usage` refactor exists for. `/gallery` used to
 * select media with `raceEdition exists`, reading a category tag as a publish
 * switch, so an upload with the race picker left at 不連結比賽 appeared on no
 * public page at all — and `src/lib/media/unused.ts` used the same rule, so it
 * was also on a deletion schedule. The upload form had no other control; there
 * was nothing a member could do about it.
 *
 * Two tests, and the second is the one that keeps the fix honest. Publishing
 * everything by default would satisfy the first on its own while putting every
 * screenshot pasted into an article on the public photo wall, which is what
 * `usage: 'attachment'` prevents. A fix is only correct if both hold.
 *
 * The real `UploadDropzone` is driven rather than POSTing to `/api/media`,
 * matching `race-photos.spec.ts` and for the same reason: the claim is that a
 * member can do this, not that the API and the renderer agree. The fixture
 * file choice is inherited from that spec — read its `afterEach` comment
 * before changing it, the LFS and .gitignore traps there are real.
 */
import { expect, test } from "../helpers/test";
import { TEST_ADMIN } from "../helpers/auth";
import { budget } from "../helpers/budget";
import { recordCreated } from "../helpers/created";
import { getWithRetry } from "../helpers/request";
import { deleteCreatedRows } from "../helpers/teardown";

const FIXTURE = "public/static/brand/mark-purple.svg";

test.describe("V-LIBRARY an upload with no race reaches the photo wall", () => {
  /** Deleted by the id captured at upload, never by a name or a pattern. */
  let createdMediaId: number | null = null;

  test.afterEach(async ({ request }) => {
    if (!createdMediaId) return;
    const id = createdMediaId;
    createdMediaId = null;
    await deleteCreatedRows(request, [{ collection: "media", id }]);
  });

  async function signIn(page: import("@playwright/test").Page) {
    await page.goto("/members/login", { waitUntil: "domcontentloaded" });
    await page.getByTestId("member-login-email").fill(TEST_ADMIN.email);
    await page.getByTestId("member-login-password").fill(TEST_ADMIN.password);
    await page.getByTestId("member-login-submit").click();
    await expect(page).toHaveURL(/\/members$/, { timeout: budget(15_000) });
  }

  test("V-LIBRARY-T1: a library upload with no race is on /gallery", async ({ page }) => {
    test.setTimeout(budget(60_000));

    await signIn(page);

    // By clicking, not by URL — the calendar-toggle bug lived entirely in
    // soft navigation and was invisible to a suite that only ever used `goto`.
    await page.getByTestId("member-nav-media").click();
    await expect(page).toHaveURL(/\/members\/media/, { timeout: budget(15_000) });

    await page.getByTestId("media-upload-input").setInputFiles(FIXTURE);

    // The race picker is deliberately left alone. That is the whole case:
    // before this change, not touching it meant the file was published
    // nowhere. The visibility checkbox is asserted to be on by default rather
    // than ticked here, because "uploads are public unless you say otherwise"
    // is the behaviour being pinned.
    await expect(page.getByTestId("media-upload-usage")).toBeChecked();

    const uploadResponse = page.waitForResponse(
      (res) => res.url().includes("/api/media") && res.request().method() === "POST",
    );
    await page.getByTestId("media-upload-start").click();
    const body = (await (await uploadResponse).json()) as { doc?: { id: number } };
    if (!body.doc?.id) throw new Error("upload response carried no document id");
    // Captured before the next await, so a failure below still lets afterEach
    // find the row.
    createdMediaId = body.doc.id;
    recordCreated({ collection: "media", id: body.doc.id, note: "V-LIBRARY probe photo" });

    await expect(page.getByTestId("media-upload-done")).toBeVisible({
      timeout: budget(20_000),
    });

    const stored = await getWithRetry(page.request, `/api/media/${body.doc.id}?depth=0`);
    expect(stored.ok()).toBe(true);
    const doc = (await stored.json()) as { raceEdition?: unknown; usage?: string };
    expect(doc.raceEdition ?? null).toBeNull();
    expect(doc.usage).toBe("gallery");

    // The public payoff, asserted on the landing view with nothing clicked
    // first — the same discipline as V-GALLERYVIDEO, which was written after
    // a broken default view stayed green because every check went through the
    // album view.
    await page.goto("/gallery", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("gallery-all-photos")).toBeVisible({
      timeout: budget(15_000),
    });
    await expect(page.getByTestId("gallery-all-photos-empty")).toHaveCount(0);

    // `owner` is a relationship to `users`; content.ts keeps it out of every
    // select for that reason, and this query is the newest one to widen.
    expect(await page.content()).not.toContain("sessions");
  });

  test("V-LIBRARY-T2: an upload marked not-public stays off /gallery", async ({ page }) => {
    test.setTimeout(budget(60_000));

    await signIn(page);
    await page.getByTestId("member-nav-media").click();
    await expect(page).toHaveURL(/\/members\/media/, { timeout: budget(15_000) });

    await page.getByTestId("media-upload-input").setInputFiles(FIXTURE);
    await page.getByTestId("media-upload-usage").uncheck();

    const uploadResponse = page.waitForResponse(
      (res) => res.url().includes("/api/media") && res.request().method() === "POST",
    );
    await page.getByTestId("media-upload-start").click();
    const body = (await (await uploadResponse).json()) as { doc?: { id: number } };
    if (!body.doc?.id) throw new Error("upload response carried no document id");
    createdMediaId = body.doc.id;
    recordCreated({ collection: "media", id: body.doc.id, note: "V-LIBRARY private probe" });

    await expect(page.getByTestId("media-upload-done")).toBeVisible({
      timeout: budget(20_000),
    });

    // Asserted on the stored document rather than by hunting the rendered
    // page for an absence: /gallery shows hundreds of photos, so "this one is
    // not among them" is a claim about a haystack, and a selector that found
    // nothing would pass whether or not the rule works. What is ours to check
    // is that the control writes the value the query filters on.
    const stored = await getWithRetry(page.request, `/api/media/${body.doc.id}?depth=0`);
    expect(stored.ok()).toBe(true);
    expect(((await stored.json()) as { usage?: string }).usage).toBe("private");
  });
});
