import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect } from "../helpers/test";

import { lexicalParagraph } from "@/lib/lexical-helpers";
import {
  TEST_ADMIN,
  TEST_MEMBER,
  adminContext,
  ensureMemberUser,
  loginContext,
} from "../helpers/members";

async function signIn(
  page: Page,
  credentials: { email: string; password: string },
) {
  const login = await page.context().request.post("/api/users/login", {
    data: credentials,
  });
  expect(login.ok()).toBeTruthy();
}

/**
 * G — moving between the two interfaces, and AI drafting in the member editor.
 *
 * The admin panel and the member area are two views of the same content, so
 * both directions have to work: an admin can drop into the member UI, and
 * get back out again.
 */
test.describe("G interface switch and AI assist", () => {
  const stamp = Date.now();
  let admin: APIRequestContext;
  let member: APIRequestContext;
  const createdPostIds: number[] = [];

  test.beforeAll(async ({ baseURL }) => {
    admin = await adminContext(baseURL);
    await ensureMemberUser(admin, TEST_MEMBER);
    member = await loginContext(baseURL, TEST_MEMBER);
  });

  test.afterAll(async () => {
    for (const id of createdPostIds) await admin?.delete(`/api/posts/${id}`);
    await Promise.all([admin?.dispose(), member?.dispose()]);
  });

  async function seedPost() {
    const slug = `g-${stamp}-${Math.random().toString(36).slice(2, 8)}`;
    const response = await member.post("/api/posts?draft=true", {
      data: {
        title: `標題 ${slug}`,
        slug,
        description: "G fixture",
        content: lexicalParagraph("original body"),
        _status: "draft",
      },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    const doc = (await response.json()).doc;
    createdPostIds.push(doc.id);
    return doc as { id: number };
  }

  test("G-T1: the admin sidebar links to the member area", async ({ page }) => {
    await signIn(page, TEST_ADMIN);
    await page.goto("/admin/collections/posts");

    const link = page.getByTestId("admin-member-area-link");
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/members");
  });

  test("G-T2: following it lands in the member area, with a way back", async ({
    page,
  }) => {
    // Payload's sidebar is a drawer on a narrow window and permanently open
    // on a wide one, and Playwright's Desktop Chrome default is 1280 — narrow.
    // The previous version opened the drawer with `.nav-toggler` and then
    // clicked the link, which failed roughly half the time: Playwright retried
    // the click for the full 30s while `<h1 class="list-header__title">` sat
    // on top of a link that was technically "visible", because the toggler
    // click had landed before the panel was interactive and did nothing.
    //
    // Measured on this build — element at the link's own centre point:
    //   1280 → <h1 class="list-header__title">   (blocked)
    //   1440 → <h1 class="list-header__title">   (blocked)
    //   1600 → the link itself
    //
    // So the window is sized past the breakpoint instead. Nothing about this
    // test is about the hamburger; that was an accident of the default device
    // profile, and retrying a lost click is not a fix for one.
    await page.setViewportSize({ width: 1600, height: 900 });
    await signIn(page, TEST_ADMIN);
    await page.goto("/admin/collections/posts");

    await page.getByTestId("admin-member-area-link").click();

    await page.waitForURL("**/members");
    await expect(page.getByTestId("member-welcome")).toBeVisible();

    const back = page.getByTestId("member-nav-admin-switch");
    await expect(back).toBeVisible();
    await expect(back).toHaveAttribute("href", "/admin");
  });

  test("G-T3: the reverse link is admin-only", async ({ page }) => {
    await signIn(page, TEST_MEMBER);
    await page.goto("/members");
    await expect(page.getByTestId("member-welcome")).toBeVisible();
    await expect(page.getByTestId("member-nav-admin-switch")).toHaveCount(0);
  });

  test("G-T4: the member's sidebar link does not affect the /admin audit", async ({
    page,
  }) => {
    // M0-T9 enumerates a[href^="/admin"] to check what a member sees in the
    // Payload sidebar. /members deliberately doesn't match that prefix, so
    // adding beforeNavLinks can't widen what that test considers visible.
    await signIn(page, TEST_MEMBER);
    await page.goto("/admin");
    const link = page.getByTestId("admin-member-area-link");
    await expect(link).toBeVisible();
    await expect(link).not.toHaveAttribute("href", /^\/admin/);
  });

  test("G-T5: AI drafting replaces the editor content and marks it unsaved", async ({
    page,
  }) => {
    const post = await seedPost();
    await signIn(page, TEST_MEMBER);
    await page.goto(`/members/posts/${post.id}`);
    await page.waitForSelector('[data-testid="editor-content"]');
    await expect(page.getByTestId("editor-content")).toContainText(
      "original body",
    );

    await page.getByTestId("ai-assist-open").click();
    await page
      .getByTestId("ai-assist-outline")
      .fill("野馬營十週年：起源、成長、未來");
    await page.getByTestId("ai-assist-run").click();

    // The endpoint returns a placeholder when Workers AI isn't bound (dev
    // and CI), so this asserts the plumbing — that whatever comes back
    // reaches the editor — not the quality of the generation.
    await expect(page.getByTestId("editor-content")).not.toContainText(
      "original body",
      { timeout: 30_000 },
    );
    await expect(page.getByTestId("editor-content")).toContainText(
      "野馬營十週年",
    );
    await expect(page.getByTestId("post-dirty")).toBeVisible();

    // Nothing is written until the author saves.
    const before = await (
      await member.get(`/api/posts/${post.id}?draft=true&depth=0`)
    ).json();
    expect(JSON.stringify(before.content)).toContain("original body");

    await page.getByTestId("post-save-draft").click();
    await expect(page.getByTestId("post-message")).toBeVisible();

    const after = await (
      await member.get(`/api/posts/${post.id}?draft=true&depth=0`)
    ).json();
    expect(JSON.stringify(after.content)).toContain("野馬營十週年");
    expect(JSON.stringify(after.content)).not.toContain("original body");
  });

  test("G-T6: an empty outline is refused before any request", async ({
    page,
  }) => {
    const post = await seedPost();
    await signIn(page, TEST_MEMBER);
    await page.goto(`/members/posts/${post.id}`);
    await page.waitForSelector('[data-testid="editor-content"]');

    let calls = 0;
    await page.route("**/api/ai/expand-post", (route) => {
      calls += 1;
      return route.continue();
    });

    await page.getByTestId("ai-assist-open").click();
    await page.getByTestId("ai-assist-run").click();

    await expect(page.getByTestId("ai-assist-error")).toBeVisible();
    expect(calls).toBe(0);
    await expect(page.getByTestId("editor-content")).toContainText(
      "original body",
    );
  });
});
