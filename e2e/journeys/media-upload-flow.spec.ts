import { expect, test } from "../helpers/test";
import { TEST_ADMIN } from "../helpers/auth";
import { budget } from "../helpers/budget";
import { recordCreated } from "../helpers/created";
import { deleteCreatedRows } from "../helpers/teardown";

/**
 * V-UPLOADFLOW — what the upload page says before, during and after.
 *
 * The old control had three of these four states and no fourth: it ended on a
 * list of rows reading 完成, with no total, no way back to an empty screen,
 * and no distinction between "stored", "you already had this" and "refused".
 * A member's only way to answer "did that work?" was to count.
 *
 * WHAT IS PINNED HERE is the half a unit test cannot reach — that the page
 * moves between those states as a member drives it. `U-UPLOADQ` already owns
 * the arithmetic underneath (append-not-replace, the three-way count, what
 * "finished" means); this is the wiring.
 *
 * The fixture is `public/static/brand/mark-purple.svg` for the reasons
 * `race-photos.spec.ts` records at length: tracked, outside Git LFS, and real
 * content the site itself renders. A `.png` would be an LFS pointer in CI.
 */
const FIXTURE = "public/static/brand/mark-purple.svg";

test.describe("V-UPLOADFLOW the upload page's own states", () => {
  const created: { collection: string; id: number }[] = [];

  test.afterEach(async ({ request }) => {
    const pending = created.splice(0, created.length);
    await deleteCreatedRows(request, pending);
  });

  test("V-UPLOADFLOW-T1: settings come first, then a result, then a clean slate", async ({
    page,
    request,
  }) => {
    test.setTimeout(budget(90_000));

    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    await page.goto("/members/login", { waitUntil: "domcontentloaded" });
    await page.getByTestId("member-login-email").fill(TEST_ADMIN.email);
    await page.getByTestId("member-login-password").fill(TEST_ADMIN.password);
    await page.getByTestId("member-login-submit").click();
    await expect(page).toHaveURL(/\/members$/, { timeout: budget(20_000) });

    await page.getByTestId("member-nav-media").click();
    await page.getByTestId("media-upload-link").click();
    await expect(page).toHaveURL(/\/members\/media\/upload/, {
      timeout: budget(20_000),
    });

    // STATE A. Everything a member needs to decide is on screen before they
    // have chosen anything — which is the fix for the old order, where the
    // race picker and the 相片牆 checkbox only appeared *after* a pick and so
    // could not inform it.
    await expect(page.getByTestId("media-upload-dropzone")).toBeVisible();
    await expect(page.getByTestId("media-upload-race")).toBeVisible();
    await expect(page.getByTestId("media-upload-usage")).toBeChecked();
    await expect(
      page.getByTestId("media-upload-start"),
      "nothing to upload yet",
    ).toBeDisabled();
    await expect(page.getByTestId("media-upload-queue")).toHaveCount(0);

    // STATE B.
    const uploaded = page.waitForResponse(
      (res) => res.url().includes("/api/media") && res.request().method() === "POST",
    );
    await page.getByTestId("media-upload-input").setInputFiles(FIXTURE);
    await expect(page.getByTestId("media-upload-queue-item")).toHaveCount(1);
    await expect(page.getByTestId("media-upload-start")).toBeEnabled();

    // STATE C → D.
    await page.getByTestId("media-upload-start").click();
    const response = await uploaded;
    const body = (await response.json()) as { doc?: { id: number } };
    if (!body.doc?.id) throw new Error("upload response carried no document id");
    // Captured before the next await, so a failure below still lets afterEach
    // find it.
    created.push({ collection: "media", id: body.doc.id });
    recordCreated({ collection: "media", id: body.doc.id, note: "V-UPLOADFLOW" });

    // THE STATE THAT DID NOT EXIST. Not "a row now says 完成" — a panel that
    // counts what happened and offers the next move.
    const result = page.getByTestId("media-upload-result");
    await expect(result, "finishing has to say so").toBeVisible({
      timeout: budget(30_000),
    });
    await expect(result).toContainText("1 個檔案已上傳");

    // ...and the reset. The queue empties; the settings do not, because the
    // common next act is another batch of the same thing, and re-answering
    // two questions just answered is the friction this page exists to remove.
    await page.getByTestId("media-upload-again").click();
    await expect(page.getByTestId("media-upload-queue-item")).toHaveCount(0);
    await expect(page.getByTestId("media-upload-result")).toHaveCount(0);
    await expect(
      page.getByTestId("media-upload-usage"),
      "the batch settings survive the reset",
    ).toBeChecked();
    await expect(page.getByTestId("media-upload-start")).toBeDisabled();
  });
});
