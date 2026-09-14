import { expect, test } from "../helpers/test";
import { waitForHydration } from "../helpers/hydration";
import { TEST_ADMIN } from "../helpers/auth";
import { budget } from "../helpers/budget";
import { recordCreated } from "../helpers/created";
import { deleteCreatedRows, leavePostEditor } from "../helpers/teardown";

/**
 * M-AITYPO — the AI proofreader, one decision per 錯別字.
 *
 * The feature this covers is not "the model finds typos" — that is the
 * model's business and it is not testable from here, because locally this
 * runs a stand-in and against staging it runs the real thing. What is ours,
 * and what breaks silently, is the promise around each card: **拒絕 writes
 * nothing, and 接受 changes that word and no others.**
 *
 * Both failures look like success on screen. A 拒絕 that edited the document
 * anyway leaves an article that still reads correctly. An 接受 that rebuilt
 * the document from the model's reply — the shape the improve pane uses, and
 * the obvious way to build this — leaves an article that reads correctly and
 * has had every other sentence quietly rewritten. So the assertions below
 * are about the *rest* of the article: the text either side of the accepted
 * word, counted, before and after.
 *
 * Nothing here asserts which typo is found or what it is corrected to. The
 * card is read off the screen and the assertions are made about whatever it
 * offered, so this holds for the stand-in and for the model.
 */

/**
 * Blatant 錯別字, so there is something to find whoever is looking — and the
 * same one twice, in two paragraphs, which is what makes T2's subtraction
 * mean anything. With one copy in the article, "changed exactly one" and
 * "changed all of them" are the same number.
 */
const TYPO_LINE = "我己經跑完這場比賽，因該可以休息了。";
const CLEAN_LINE = "第二段沒有問題，這一句不應該被動到。";
const SECOND_TYPO_LINE = "回家以後才發現己經很晚了。";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/members/login", { waitUntil: "domcontentloaded" });
  // The login form is a Client Component: `onSubmit` preventDefaults and
  // fetches `/api/users/login`, and the <form> carries no `action`. Submit
  // it before React attaches and nothing is sent at all.
  await waitForHydration(page);
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

/** Non-overlapping occurrences, the unit the promise is counted in. */
const countIn = (haystack: string, needle: string) => haystack.split(needle).length - 1;

test.describe("M-AITYPO the AI fixes the 錯別字 the member accepts, and only those", () => {
  const created: { collection: string; id: number }[] = [];
  let postId = 0;

  test.beforeEach(async ({ request }) => {
    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    const stamp = Date.now();
    const post = await request.post("/api/posts?draft=true", {
      data: {
        title: `AI 改錯字 ${stamp}`,
        slug: `m-aitypo-${stamp}`,
        description: "AI 改錯字測試",
        _status: "draft",
        content: {
          root: {
            type: "root",
            format: "",
            indent: 0,
            version: 1,
            direction: "ltr",
            children: [
              paragraph(TYPO_LINE),
              paragraph(CLEAN_LINE),
              paragraph(SECOND_TYPO_LINE),
            ],
          },
        },
      },
    });
    expect(post.ok(), `post create failed: ${post.status()}`).toBeTruthy();
    postId = (await post.json()).doc.id as number;
    created.push({ collection: "posts", id: postId });
    recordCreated({ collection: "posts", id: postId, note: "M-AITYPO probe post" });
  });

  test.afterEach(async ({ page, request }) => {
    const pending = created.splice(0, created.length).reverse();
    await leavePostEditor(page);
    await deleteCreatedRows(request, pending);
  });

  test("M-AITYPO-T1: 拒絕 leaves the word the member wrote", async ({ page }) => {
    // Two cold routes land in this test: the first visit to
    // /members/posts/<id> pays `next dev`'s on-demand compile, and
    // /api/ai/fix-typos is compiled on the first click. Same shape as
    // M-AIIMPROVE's budget, and against staging the model is doing real work.
    test.setTimeout(budget(60_000));

    await signIn(page);
    await page.goto(`/members/posts/${postId}`);
    const editor = page.getByTestId("editor-content");
    await expect(editor).toContainText(TYPO_LINE, { timeout: budget(20_000) });
    const written = (await editor.innerText()).trim();

    // Nothing is proposed until it is asked for.
    await expect(page.getByTestId("ai-typos-list")).toHaveCount(0);

    await page.getByTestId("ai-typos-run").click();

    const first = page.getByTestId("ai-typos-item").first();
    await expect(first).toBeVisible({ timeout: budget(60_000) });

    // The card says what it would change and what to. Both halves, because
    // a card showing only the correction is one the member cannot judge:
    // 的 → 得 is right in one sentence and wrong in the next.
    const wrong = (await first.getByTestId("ai-typos-wrong").innerText()).trim();
    const right = (await first.getByTestId("ai-typos-right").innerText()).trim();
    expect(wrong.length, "the card offered no original to compare against").toBeGreaterThan(0);
    expect(right).not.toBe(wrong);
    // Shown in its sentence, not as a dictionary entry.
    expect((await first.innerText()).length).toBeGreaterThan(wrong.length + right.length);

    const before = await page.getByTestId("ai-typos-item").count();
    await first.getByTestId("ai-typos-reject").click();
    await expect(page.getByTestId("ai-typos-item")).toHaveCount(before - 1);

    // The article is untouched. Compared as a whole rather than by phrase:
    // only the whole text can tell "never changed" from "changed and put
    // back", and 拒絕 promises the first.
    expect((await editor.innerText()).trim()).toBe(written);
    // And nothing was edited, so there is nothing to save.
    await expect(page.getByTestId("post-dirty")).toHaveCount(0);
  });

  test("M-AITYPO-T2: 接受 changes that one word and leaves the rest of the article alone", async ({
    page,
  }) => {
    test.setTimeout(budget(60_000));

    await signIn(page);
    await page.goto(`/members/posts/${postId}`);
    const editor = page.getByTestId("editor-content");
    await expect(editor).toContainText(TYPO_LINE, { timeout: budget(20_000) });

    await page.getByTestId("ai-typos-run").click();
    const first = page.getByTestId("ai-typos-item").first();
    await expect(first).toBeVisible({ timeout: budget(60_000) });

    // Read off the screen: what the member is agreeing to when they press
    // 接受. The wording is the model's and differs every run.
    const wrong = (await first.getByTestId("ai-typos-wrong").innerText()).trim();
    const right = (await first.getByTestId("ai-typos-right").innerText()).trim();
    const written = (await editor.innerText()).trim();

    await page.getByTestId("ai-typos-accept").first().click();

    await expect(editor).toContainText(right, { timeout: budget(15_000) });
    const after = (await editor.innerText()).trim();

    // The assertion this feature exists for, and it is a subtraction rather
    // than a presence: exactly one of that word was corrected. An accept
    // that rebuilt the document from the model's reply passes "contains
    // 已經" too, having rewritten the paragraph it did not ask about.
    expect(
      countIn(after, wrong),
      `accepting one correction changed ${countIn(written, wrong) - countIn(after, wrong)} copies of 「${wrong}」`,
    ).toBe(countIn(written, wrong) - 1);
    // The paragraph nobody reported anything in, character for character.
    expect(after).toContain(CLEAN_LINE);
    // The lengths agree with a swap of that one word and nothing else.
    expect(after.length).toBe(written.length - wrong.length + right.length);

    // Accepting is an edit, so the work is not silently unsaved.
    await expect(page.getByTestId("post-dirty")).toBeVisible();

    // Then wait for the autosave that edit started, rather than ending the
    // test with a write in flight. On a deployed origin the teardown's own
    // requests take seconds each, so the page is still alive when the timer
    // goes off — and by then teardown has deleted the post the save is
    // addressed to. It is also the better assertion: the corrected version
    // reached the server, not merely the editor.
    await expect(page.getByTestId("post-message")).toContainText("已自動儲存", {
      timeout: budget(30_000),
    });
  });
});
