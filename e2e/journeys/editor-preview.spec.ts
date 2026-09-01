import { expect, test } from "../helpers/test";
import { TEST_ADMIN } from "../helpers/auth";
import { budget } from "../helpers/budget";
import { recordCreated } from "../helpers/created";

/**
 * M-PREVIEW — what a member sees before publishing.
 *
 * Two things that were previously invisible: the editor understands
 * markdown shortcuts but never said so, and there was no way to see the
 * document as a reader will get it.
 *
 * The image assertion is the one that matters. The preview renderer came
 * from the import flow, where `upload` nodes were never handled — it
 * rendered every photo as nothing at all. A preview that silently drops the
 * pictures is worse than no preview: it is a member deciding their article
 * looks wrong and rewriting it.
 *
 * The fixture is built over the API. Pasting an image through the editor is
 * covered by race-photos.spec.ts; the subject here is what the preview does
 * with a document that already has one, and driving an upload through the
 * UI to get there would test the upload twice and this once.
 */

/** A 1x1 PNG. The preview only has to resolve and render it, not show detail. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const PARAGRAPH = "預覽測試的段落文字";

/**
 * The browser needs its own session: Playwright's `request` fixture and
 * `page` keep separate cookie jars, so signing in over the API leaves the
 * browser anonymous and the editor route bounces it to /members/login.
 * Same shape as post-cover.spec.ts's helper.
 */
async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/members/login", { waitUntil: "domcontentloaded" });
  await page.getByTestId("member-login-email").fill(TEST_ADMIN.email);
  await page.getByTestId("member-login-password").fill(TEST_ADMIN.password);
  await page.getByTestId("member-login-submit").click();
  await expect(page).toHaveURL(/\/members$/, { timeout: budget(15_000) });
}

test.describe("M-PREVIEW a member previews before publishing", () => {
  const created: { collection: string; id: number }[] = [];

  test.afterEach(async ({ request }) => {
    // Reversed: the post references the media.
    const pending = created.splice(0, created.length).reverse();
    if (pending.length === 0) return;

    // Best effort, and deliberately not asserted on. The `request` fixture
    // still holds the cookies from the sign-in this test already did, so
    // this is a second login for a session that already exists — a failure
    // surface with nothing behind it. One of them answered 500 on a CI
    // shard, with no server-side log and with the deletes right after it
    // fine, and failed a test whose own assertions had all passed.
    //
    // What has to work here is the delete, so that is what fails the test.
    // A session that really had lapsed shows up as a 401 on the line below,
    // which says so.
    await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });

    for (const row of pending) {
      const deleted = await request.delete(`/api/${row.collection}/${row.id}`);
      if (!deleted.ok()) {
        throw new Error(`teardown failed to delete ${row.collection}/${row.id}`);
      }
    }
  });

  test("M-PREVIEW-T1: the preview shows the text and the images", async ({
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
        file: { name: `preview-${stamp}.png`, mimeType: "image/png", buffer: PNG },
        _payload: JSON.stringify({ alt: `M-PREVIEW probe ${stamp}` }),
      },
    });
    expect(uploaded.ok(), `media upload failed: ${uploaded.status()}`).toBeTruthy();
    const mediaId = (await uploaded.json()).doc.id as number;
    created.push({ collection: "media", id: mediaId });
    recordCreated({ collection: "media", id: mediaId, note: "M-PREVIEW probe image" });

    const post = await request.post("/api/posts?draft=true", {
      data: {
        title: `M-PREVIEW ${stamp}`,
        slug: `m-preview-${stamp}`,
        description: "預覽測試",
        _status: "draft",
        content: {
          root: {
            type: "root",
            format: "",
            indent: 0,
            version: 1,
            direction: "ltr",
            children: [
              {
                type: "paragraph",
                format: "",
                indent: 0,
                version: 1,
                direction: "ltr",
                children: [
                  { type: "text", text: PARAGRAPH, format: 0, style: "", mode: "normal", detail: 0, version: 1 },
                ],
              },
              { type: "upload", relationTo: "media", value: mediaId, version: 3, format: "", fields: null },
            ],
          },
        },
      },
    });
    expect(post.ok(), `post create failed: ${post.status()}`).toBeTruthy();
    const postId = (await post.json()).doc.id as number;
    created.push({ collection: "posts", id: postId });
    recordCreated({ collection: "posts", id: postId, note: "M-PREVIEW probe post" });

    await signIn(page);
    await page.goto(`/members/posts/${postId}`);
    await expect(page.getByTestId("editor-content")).toBeVisible({
      timeout: budget(20_000),
    });

    // Nothing is previewing until it is asked for.
    await expect(page.getByTestId("post-preview")).toHaveCount(0);

    await page.getByTestId("post-preview-toggle").click();

    const preview = page.getByTestId("post-preview");
    await expect(preview).toBeVisible({ timeout: budget(15_000) });
    await expect(preview).toContainText(PARAGRAPH, { timeout: budget(15_000) });
    // The upload node resolved to a real picture rather than being skipped.
    await expect(preview.locator("img")).toHaveCount(1, { timeout: budget(15_000) });

    // And it follows the document. A preview that only reflects the state at
    // the moment it opened is a snapshot, and a stale snapshot beside a live
    // editor is worse than no preview — the member trusts the wrong one.
    // Clicking the paragraph rather than the editor box: the box's centre is
    // the image, and a decorator node takes the selection and swallows typing.
    await page.getByTestId("editor-content").locator("p").first().click();
    await page.keyboard.press("End");
    await page.keyboard.type("，追加的句子");
    await expect(preview).toContainText("追加的句子", { timeout: budget(15_000) });
    // The picture survives the re-render rather than flickering out of a
    // document that gets rebuilt on every keystroke.
    await expect(preview.locator("img")).toHaveCount(1);

    // The typing above marks the document dirty and starts the autosave
    // timer. Same staging-only 500 as M-SUMMARY-T2 and M-AIIMPROVE-T2:
    // teardown deletes the post while the PATCH is still in flight.
    await expect(page.getByTestId("post-message")).toContainText("已自動儲存", {
      timeout: budget(30_000),
    });
  });

  test("M-PREVIEW-T2: the markdown shortcuts are discoverable", async ({
    page,
    request,
  }) => {
    test.setTimeout(budget(60_000));

    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    const stamp = Date.now();
    const post = await request.post("/api/posts?draft=true", {
      data: {
        title: `M-PREVIEW hints ${stamp}`,
        slug: `m-preview-hints-${stamp}`,
        description: "語法提示測試",
        _status: "draft",
      },
    });
    expect(post.ok(), `post create failed: ${post.status()}`).toBeTruthy();
    const postId = (await post.json()).doc.id as number;
    created.push({ collection: "posts", id: postId });
    recordCreated({ collection: "posts", id: postId, note: "M-PREVIEW hints probe" });

    await signIn(page);
    await page.goto(`/members/posts/${postId}`);

    // Collapsed by default — the list must not push the writing surface down
    // on every visit for the one visit where somebody reads it.
    await expect(page.getByTestId("markdown-hints-list")).toHaveCount(0);

    await page.getByTestId("markdown-hints-toggle").click();
    const list = page.getByTestId("markdown-hints-list");
    await expect(list).toBeVisible({ timeout: budget(15_000) });
    await expect(list).toContainText("標題");
    await expect(list).toContainText("[文字](網址)");
    // Code blocks are not registered in this editor; advertising them would
    // teach a shortcut that produces literal backticks. U-MDHINT-2 asserts
    // the same thing against the data, this asserts it against the screen.
    await expect(list).not.toContainText("```");
  });
});
