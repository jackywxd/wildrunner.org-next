import { expect, test } from "../helpers/test";
import { TEST_ADMIN } from "../helpers/auth";
import { budget } from "../helpers/budget";
import { recordCreated } from "../helpers/created";
import { deleteCreatedRows, leavePostEditor } from "../helpers/teardown";

/**
 * M-SUMMARY — the AI writes the 摘要, and never writes over one.
 *
 * `description` is required on every post, and it is the field members leave
 * until last: it is not the article, nobody reads it while writing, and it
 * is the one thing between a finished draft and publishing. It is also the
 * most public field there is — the posts index, the page's meta description,
 * and whatever a link preview shows when somebody shares the article.
 *
 * Both of those shape the assertions. What comes back is a suggestion, so
 * the test's subject is the *field*: unchanged while the suggestion is only
 * on screen, changed when 使用 is pressed, unchanged again after 取消.
 *
 * The document deliberately holds an image. A `[[BLOCK-0]]` reaching the
 * summary would be printed on the public site as this article's
 * description — invisible in the editor, obvious to everyone else — so the
 * suggestion is checked for one.
 *
 * Nothing here asserts on the summary's *wording*: against staging this runs
 * the real model. An earlier spec asserted on a stand-in's marker and went
 * red on the staging deploy having proved nothing about what ships.
 */

/** A 1x1 PNG. It only has to exist in the document, not show detail. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const WRITTEN = "會員自己寫的摘要，不可以被蓋掉";
const BODY = "那天清晨五點的起跑線很冷，我在補給站待了太久。";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/members/login", { waitUntil: "domcontentloaded" });
  await page.getByTestId("member-login-email").fill(TEST_ADMIN.email);
  await page.getByTestId("member-login-password").fill(TEST_ADMIN.password);
  await page.getByTestId("member-login-submit").click();
  await expect(page).toHaveURL(/\/members$/, { timeout: budget(15_000) });
}

const paragraph = (text: string) => ({
  type: "paragraph",
  format: "",
  indent: 0,
  version: 1,
  direction: "ltr",
  children: [
    { type: "text", text, format: 0, style: "", mode: "normal", detail: 0, version: 1 },
  ],
});

test.describe("M-SUMMARY the AI writes the 摘要", () => {
  const created: { collection: string; id: number }[] = [];
  let postId = 0;

  test.beforeEach(async ({ request }) => {
    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    const stamp = Date.now();
    const uploaded = await request.post("/api/media", {
      multipart: {
        file: { name: `summary-${stamp}.png`, mimeType: "image/png", buffer: PNG },
        _payload: JSON.stringify({ alt: `M-SUMMARY probe ${stamp}` }),
      },
    });
    expect(uploaded.ok(), `media upload failed: ${uploaded.status()}`).toBeTruthy();
    const mediaId = (await uploaded.json()).doc.id as number;
    created.push({ collection: "media", id: mediaId });
    recordCreated({ collection: "media", id: mediaId, note: "M-SUMMARY probe image" });

    const post = await request.post("/api/posts?draft=true", {
      data: {
        title: `AI 摘要 ${stamp}`,
        slug: `m-summary-${stamp}`,
        description: WRITTEN,
        _status: "draft",
        content: {
          root: {
            type: "root",
            format: "",
            indent: 0,
            version: 1,
            direction: "ltr",
            children: [
              paragraph(BODY),
              {
                type: "upload",
                relationTo: "media",
                value: mediaId,
                version: 3,
                format: "",
                fields: null,
              },
              paragraph("終點前最後兩公里，隊友在路邊等我。"),
            ],
          },
        },
      },
    });
    expect(post.ok(), `post create failed: ${post.status()}`).toBeTruthy();
    postId = (await post.json()).doc.id as number;
    created.push({ collection: "posts", id: postId });
    recordCreated({ collection: "posts", id: postId, note: "M-SUMMARY probe post" });
  });

  test.afterEach(async ({ page, request }) => {
    // Reversed: the post references the media.
    const pending = created.splice(0, created.length).reverse();
    await leavePostEditor(page);
    await deleteCreatedRows(request, pending);
  });

  test("M-SUMMARY-T1: a suggestion appears, and the member's own summary survives it", async ({
    page,
  }) => {
    // Two cold routes land here: the editor route's on-demand compile and
    // /api/ai/summarise-post's. 60s so the scaled figure lands exactly on
    // the deployed default rather than below it — the model does real work
    // there, and anything smaller would *lower* a deployed run's budget.
    test.setTimeout(budget(60_000));

    await signIn(page);
    await page.goto(`/members/posts/${postId}`);
    const field = page.getByTestId("post-description");
    await expect(field).toHaveValue(WRITTEN, { timeout: budget(20_000) });

    // Nothing is suggested until it is asked for.
    await expect(page.getByTestId("ai-summary-suggestion")).toHaveCount(0);

    await page.getByTestId("ai-summary-run").click();

    const suggestion = page.getByTestId("ai-summary-suggestion");
    await expect(suggestion).toBeVisible({ timeout: budget(60_000) });

    // The assertion this design exists for. A member who already wrote their
    // summary must not lose it to a button press, and a suggestion that had
    // been written into the field would look identical on screen to one that
    // had not.
    await expect(field).toHaveValue(WRITTEN);

    // And no marker reached it. This is the failure nobody would see in the
    // editor: `[[BLOCK-0]]` printed on the public site as the description.
    await expect(suggestion).not.toContainText("BLOCK");

    // Dismissing leaves both the field and the article alone.
    await page.getByTestId("ai-summary-dismiss").click();
    await expect(page.getByTestId("ai-summary-suggestion")).toHaveCount(0);
    await expect(field).toHaveValue(WRITTEN);
  });

  test("M-SUMMARY-T2: 使用 puts the suggestion in the field, and counts as an edit", async ({
    page,
  }) => {
    test.setTimeout(budget(60_000));

    await signIn(page);
    await page.goto(`/members/posts/${postId}`);
    const field = page.getByTestId("post-description");
    await expect(field).toHaveValue(WRITTEN, { timeout: budget(20_000) });

    await page.getByTestId("ai-summary-run").click();
    const suggestion = page.getByTestId("ai-summary-suggestion");
    await expect(suggestion).toBeVisible({ timeout: budget(60_000) });

    // Read off the screen rather than assumed: the wording is the model's
    // and differs every run, so what is being asserted is that the field
    // ends up holding the text the member was looking at.
    const offered = (await suggestion.locator("p").nth(1).innerText()).trim();
    expect(offered.length, "the panel suggested nothing to use").toBeGreaterThan(0);

    await page.getByTestId("ai-summary-use").click();
    await expect(field).toHaveValue(offered);
    // The suggestion goes away once taken — leaving it would invite a second
    // press that does nothing.
    await expect(page.getByTestId("ai-summary-suggestion")).toHaveCount(0);
    // And it is an edit, so the work is not silently unsaved.
    await expect(page.getByTestId("post-dirty")).toBeVisible();

    // Then wait for the autosave that edit started. Same mechanism as
    // M-AIIMPROVE-T2, same staging-only 500: teardown deletes the post
    // while the three-second idle timer is still armed, the PATCH lands
    // on a row that is gone, and Payload answers `Something went wrong.`
    // T1 dismisses, so the document stays clean and nothing is written.
    await expect(page.getByTestId("post-message")).toContainText("已自動儲存", {
      timeout: budget(30_000),
    });
  });
});
