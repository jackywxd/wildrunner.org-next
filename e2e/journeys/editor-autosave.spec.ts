import { expect, test } from "../helpers/test";
import { waitForHydration } from "../helpers/hydration";
import { TEST_ADMIN } from "../helpers/auth";
import { budget } from "../helpers/budget";
import { recordCreated } from "../helpers/created";
import { deleteCreatedRows, leavePostEditor } from "../helpers/teardown";

/**
 * M-AUTOSAVE — work survives without the member pressing anything.
 *
 * The assertion that matters is the reload. Anything short of it — a status
 * line saying "已自動儲存", a network call in the log — proves the editor
 * *believes* it saved, which is exactly what a member believes too right
 * before losing an afternoon. Only reading the document back from the server
 * answers the question the feature exists for.
 *
 * Nothing is clicked between typing and reloading. A test that pressed a
 * save button first would pass against an editor with no autosave at all.
 */

const TYPED = "自動儲存驗證句";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/members/login", { waitUntil: "domcontentloaded" });
    // The login form is a Client Component: `onSubmit` preventDefaults and
    // fetches `/api/users/login`, and the <form> carries no `action`. Submit
    // it before React attaches and nothing is sent at all — the sign-in just
    // never happens, and the URL assertion below times out blaming the
    // credentials.
    await waitForHydration(page);
  await page.getByTestId("member-login-email").fill(TEST_ADMIN.email);
  await page.getByTestId("member-login-password").fill(TEST_ADMIN.password);
  await page.getByTestId("member-login-submit").click();
  await expect(page).toHaveURL(/\/members$/, { timeout: budget(15_000) });
}

/** A document with one paragraph to click into. */
const withParagraph = (text: string) => ({
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
          { type: "text", text, format: 0, style: "", mode: "normal", detail: 0, version: 1 },
        ],
      },
    ],
  },
});

test.describe("M-AUTOSAVE a draft saves itself", () => {
  const created: { collection: string; id: number }[] = [];

  test.afterEach(async ({ page, request }) => {
    const pending = created.splice(0, created.length).reverse();
    await leavePostEditor(page);
    await deleteCreatedRows(request, pending);
  });

  test("M-AUTOSAVE-T1: typing then reloading keeps the text, with nothing clicked", async ({
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
        title: `M-AUTOSAVE ${stamp}`,
        slug: `m-autosave-${stamp}`,
        description: "自動儲存測試",
        _status: "draft",
        content: withParagraph("原本的段落"),
      },
    });
    expect(post.ok(), `post create failed: ${post.status()}`).toBeTruthy();
    const postId = (await post.json()).doc.id as number;
    created.push({ collection: "posts", id: postId });
    recordCreated({ collection: "posts", id: postId, note: "M-AUTOSAVE probe post" });

    await signIn(page);
    await page.goto(`/members/posts/${postId}`);
    await expect(page.getByTestId("editor-content")).toBeVisible({
      timeout: budget(20_000),
    });

    await page.getByTestId("editor-content").locator("p").first().click();
    await page.keyboard.press("End");
    await page.keyboard.type(TYPED);
    await expect(page.getByTestId("post-dirty")).toBeVisible({ timeout: budget(5_000) });

    // Waiting on the editor's own report rather than a fixed sleep — a sleep
    // long enough to be safe is a sleep long enough to hide a regression that
    // made autosave slow.
    await expect(page.getByTestId("post-message")).toContainText("已自動儲存", {
      timeout: budget(20_000),
    });

    // The only assertion that proves anything: read it back from the server.
    await page.reload();
    await expect(page.getByTestId("editor-content")).toContainText(TYPED, {
      timeout: budget(20_000),
    });
  });

  test("M-AUTOSAVE-T2: a published post says its changes are not live yet", async ({
    page,
    request,
  }) => {
    test.setTimeout(budget(60_000));

    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    const stamp = Date.now();
    // Published, so the draft an autosave writes diverges from what readers
    // get. Created without `?draft=true` — that is what publishing means here.
    const post = await request.post("/api/posts", {
      data: {
        title: `M-AUTOSAVE published ${stamp}`,
        slug: `m-autosave-published-${stamp}`,
        description: "已發布文章的自動儲存",
        _status: "published",
        content: withParagraph("已發布的段落"),
      },
    });
    expect(post.ok(), `post create failed: ${post.status()}`).toBeTruthy();
    const postId = (await post.json()).doc.id as number;
    created.push({ collection: "posts", id: postId });
    recordCreated({ collection: "posts", id: postId, note: "M-AUTOSAVE published probe" });

    await signIn(page);
    await page.goto(`/members/posts/${postId}`);
    await expect(page.getByTestId("post-status")).toHaveAttribute(
      "data-status",
      "published",
      { timeout: budget(20_000) },
    );

    // Nothing has diverged yet.
    await expect(page.getByTestId("post-unpublished")).toHaveCount(0);

    await page.getByTestId("editor-content").locator("p").first().click();
    await page.keyboard.press("End");
    await page.keyboard.type("編輯過但還沒發布");

    // After the autosave the badge still reads 已發布, and on its own that
    // would tell the member their edit is live. It is not.
    await expect(page.getByTestId("post-unpublished")).toBeVisible({
      timeout: budget(20_000),
    });
    await expect(page.getByTestId("post-status")).toHaveAttribute(
      "data-status",
      "published",
    );
  });

  test("M-AUTOSAVE-T3: a published post that has been autosaved is still published everywhere a member looks", async ({
    page,
    request,
  }) => {
    test.setTimeout(budget(90_000));

    // What went wrong on the site: a member published an article, edited it
    // once more, and every screen of the members area then said it was a
    // draft — 0 published and 1 draft on the dashboard, 草稿 in the list, and
    // an editor that offered 發布 and hid 取消發布 — while the article was
    // open to anyone. `?draft=true` reports the newest *version's* status, and
    // an autosave is a draft version. T2 above cannot see it: it checks the
    // badge in the same visit as the edit, and this is what a *later* visit
    // finds, which is why the draft write is made over the API and the pages
    // are then loaded fresh.
    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    const stamp = Date.now();
    const post = await request.post("/api/posts", {
      data: {
        title: `M-AUTOSAVE live ${stamp}`,
        slug: `m-autosave-live-${stamp}`,
        description: "已發布之後又被自動儲存",
        _status: "published",
        content: withParagraph("已發布的段落"),
      },
    });
    expect(post.ok(), `post create failed: ${post.status()}`).toBeTruthy();
    const postId = (await post.json()).doc.id as number;
    created.push({ collection: "posts", id: postId });
    recordCreated({ collection: "posts", id: postId, note: "M-AUTOSAVE live probe" });

    await signIn(page);
    const count = async (id: "published" | "drafts") => {
      await page.goto("/members", { waitUntil: "domcontentloaded" });
      const text = await page.getByTestId(`member-count-${id}`).innerText();
      return Number(text.match(/\d+/)?.[0]);
    };
    // fixture-scoped: only the difference between the two reads is asserted,
    // so whatever else this account owns does not matter.
    const publishedBefore = await count("published");
    const draftsBefore = await count("drafts");

    // The state an autosave leaves: a draft version above a published one.
    const draftWrite = await request.patch(`/api/posts/${postId}?draft=true`, {
      data: { description: "自動儲存之後的描述" },
    });
    expect(draftWrite.ok(), `draft write failed: ${draftWrite.status()}`).toBeTruthy();

    // 1. The dashboard did not move a post from published to draft.
    expect(await count("published"), "the dashboard lost a published post").toBe(publishedBefore);
    expect(await count("drafts"), "the dashboard gained a draft").toBe(draftsBefore);

    // 2. The list says published, and says there is more to publish.
    await page.goto("/members/posts", { waitUntil: "domcontentloaded" });
    const row = page.getByTestId(`post-row-${postId}`);
    await expect(row).toHaveAttribute("data-status", "published", { timeout: budget(20_000) });
    await expect(page.getByTestId(`post-unpublished-${postId}`)).toBeVisible();

    // 3. A fresh visit to the editor knows the same, before anything is typed.
    await page.goto(`/members/posts/${postId}`);
    await expect(page.getByTestId("post-status")).toHaveAttribute("data-status", "published", {
      timeout: budget(20_000),
    });
    await expect(page.getByTestId("post-unpublished")).toBeVisible();
    await expect(page.getByTestId("post-publish")).toHaveText("更新已發布內容");
    await expect(page.getByTestId("post-unpublish")).toBeVisible();
  });
});
