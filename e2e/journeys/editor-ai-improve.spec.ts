import { expect, test } from "../helpers/test";
import { TEST_ADMIN } from "../helpers/auth";
import { budget } from "../helpers/budget";
import { recordCreated } from "../helpers/created";

/**
 * M-AIIMPROVE — the AI improves the article, and gives it back with the
 * photographs still in it.
 *
 * The document under test is deliberately paragraph-image-paragraph, which
 * is the only shape that can tell the two failures apart: an image dropped
 * on the way through, and an image that survived but was pushed to the end.
 * Both leave a pane that looks like a finished article, so neither is
 * visible to a member about to press 接受 — asserting the *order* is what
 * separates them.
 *
 * Where there is no Workers AI binding — CI, and `pnpm dev` without
 * AI_IN_DEV — the endpoint answers with a stand-in that obeys the one rule
 * the model is given: marker lines through untouched, every other line
 * marked 「（已潤飾）」. That is what makes an assertion possible at all;
 * asserting on real generated prose would be asserting on something nobody
 * controls.
 */

/** A 1x1 PNG. It only has to resolve and render, not show detail. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const BEFORE = "圖片前面的段落";
const AFTER = "圖片後面的段落";
const IMPROVED = "（已潤飾）";

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

/**
 * Tag names of the rendered blocks, in order.
 *
 * Takes the pane's locator rather than building a selector from a testid
 * string: `scripts/assert-schema-screen.mjs` greps specs for the literal
 * attribute to prove every selector a test uses really exists, and an
 * interpolated one reads to it as a testid nothing renders.
 */
const blockTags = (pane: import("@playwright/test").Locator) =>
  pane
    .locator(".article-body")
    .evaluate((body) => [...body.children].map((child) => child.tagName));

test.describe("M-AIIMPROVE the AI improves an article in place", () => {
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
        file: { name: `improve-${stamp}.png`, mimeType: "image/png", buffer: PNG },
        _payload: JSON.stringify({ alt: `M-AIIMPROVE probe ${stamp}` }),
      },
    });
    expect(uploaded.ok(), `media upload failed: ${uploaded.status()}`).toBeTruthy();
    const mediaId = (await uploaded.json()).doc.id as number;
    created.push({ collection: "media", id: mediaId });
    recordCreated({ collection: "media", id: mediaId, note: "M-AIIMPROVE probe image" });

    const post = await request.post("/api/posts?draft=true", {
      data: {
        title: `AI 完善 ${stamp}`,
        slug: `m-aiimprove-${stamp}`,
        description: "AI 完善測試",
        _status: "draft",
        content: {
          root: {
            type: "root",
            format: "",
            indent: 0,
            version: 1,
            direction: "ltr",
            children: [
              paragraph(BEFORE),
              {
                type: "upload",
                relationTo: "media",
                value: mediaId,
                version: 3,
                format: "",
                fields: null,
              },
              paragraph(AFTER),
            ],
          },
        },
      },
    });
    expect(post.ok(), `post create failed: ${post.status()}`).toBeTruthy();
    postId = (await post.json()).doc.id as number;
    created.push({ collection: "posts", id: postId });
    recordCreated({ collection: "posts", id: postId, note: "M-AIIMPROVE probe post" });
  });

  test.afterEach(async ({ request }) => {
    // Reversed: the post references the media.
    const pending = created.splice(0, created.length).reverse();
    if (pending.length === 0) return;

    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    if (!login.ok()) throw new Error(`teardown could not sign in: ${login.status()}`);

    for (const doomed of pending) {
      const deleted = await request.delete(`/api/${doomed.collection}/${doomed.id}`);
      if (!deleted.ok()) {
        throw new Error(`teardown failed to delete ${doomed.collection}/${doomed.id}`);
      }
    }
  });

  test("M-AIIMPROVE-T1: the AI version sits beside the original with the picture still in the middle", async ({
    page,
  }) => {
    // Longer than the 20s default, declared rather than inherited. Two cold
    // routes land in this one test: the first visit to /members/posts/<id>
    // in a run pays `next dev`'s on-demand compile — this spec sorts before
    // the other two specs that open the editor, so the cost lands here — and
    // /api/ai/improve-post is compiled on the first click. Measured at 16.9s
    // locally against a 20s budget, which is the shape of the N-T5 flake
    // playwright.config.ts warns about.
    test.setTimeout(budget(45_000));

    await signIn(page);
    await page.goto(`/members/posts/${postId}`);
    await expect(page.getByTestId("editor-content")).toContainText(BEFORE, {
      timeout: budget(20_000),
    });

    // Nothing is compared until it is asked for.
    await expect(page.getByTestId("ai-improve-compare")).toHaveCount(0);

    await page.getByTestId("ai-improve-run").click();

    const proposal = page.getByTestId("ai-improve-proposal");
    await expect(proposal).toBeVisible({ timeout: budget(30_000) });
    // Both versions, so the member can see what changed rather than being
    // asked to trust it.
    await expect(page.getByTestId("ai-improve-original")).toContainText(BEFORE);
    await expect(proposal).toContainText(IMPROVED, { timeout: budget(15_000) });

    // The assertion this feature exists for. Not "an image is present" —
    // an image appended at the end is present too, and is the wrong article.
    await expect(proposal.locator("img")).toHaveCount(1, {
      timeout: budget(15_000),
    });
    expect(await blockTags(proposal)).toEqual(["P", "IMG", "P"]);

    // Rejecting leaves the document alone. Not restores it — it was never
    // changed, which is why the editor stayed mounted underneath.
    await page.getByTestId("ai-improve-reject").click();
    await expect(page.getByTestId("ai-improve-compare")).toHaveCount(0);
    await expect(page.getByTestId("editor-content")).toContainText(BEFORE);
    await expect(page.getByTestId("editor-content")).not.toContainText(IMPROVED);
  });

  test("M-AIIMPROVE-T2: accepting replaces the document, picture included", async ({
    page,
  }) => {
    // Longer than the 20s default, declared rather than inherited. Two cold
    // routes land in this one test: the first visit to /members/posts/<id>
    // in a run pays `next dev`'s on-demand compile — this spec sorts before
    // the other two specs that open the editor, so the cost lands here — and
    // /api/ai/improve-post is compiled on the first click. Measured at 16.9s
    // locally against a 20s budget, which is the shape of the N-T5 flake
    // playwright.config.ts warns about.
    test.setTimeout(budget(45_000));

    await signIn(page);
    await page.goto(`/members/posts/${postId}`);
    await expect(page.getByTestId("editor-content")).toContainText(BEFORE, {
      timeout: budget(20_000),
    });

    await page.getByTestId("ai-improve-run").click();
    await expect(page.getByTestId("ai-improve-proposal")).toBeVisible({
      timeout: budget(30_000),
    });

    await page.getByTestId("ai-improve-accept").click();
    await expect(page.getByTestId("ai-improve-compare")).toHaveCount(0);

    const editor = page.getByTestId("editor-content");
    await expect(editor).toContainText(IMPROVED, { timeout: budget(15_000) });
    // The picture is in the editor, not only in the pane that offered it.
    // An accept that dropped it would look like a success and lose the file
    // on the next save.
    await expect(editor.locator("img")).toHaveCount(1, { timeout: budget(15_000) });
    // And accepting is an edit, so the work is not silently unsaved.
    await expect(page.getByTestId("post-dirty")).toBeVisible();
  });
});
