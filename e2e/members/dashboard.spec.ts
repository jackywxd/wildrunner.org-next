import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect } from "@playwright/test";

import { lexicalParagraph } from "@/lib/lexical-helpers";
import {
  TEST_MEMBER,
  TEST_MEMBER_TWO,
  adminContext,
  ensureMemberUser,
  loginContext,
} from "../helpers/members";

const relationId = (value: number | { id: number } | null | undefined) =>
  typeof value === "object" && value !== null ? value.id : value;

async function loginViaForm(
  page: Page,
  credentials: { email: string; password: string },
) {
  await page.goto("/members/login");
  await page.getByTestId("member-login-email").fill(credentials.email);
  await page.getByTestId("member-login-password").fill(credentials.password);
  await page.getByTestId("member-login-submit").click();
  await page.waitForURL("**/members");
}

/**
 * D — member area skeleton, auth, Profile.
 *
 * The dashboard itself has no data of its own yet (Media/Posts land in
 * Phase E/F); what's under test here is the gate (auth + the no-store cache
 * override), the Profile read/write round trip, and the ownership
 * isolation between two members' Profile pages.
 */
test.describe("D member area skeleton, auth, profile", () => {
  const stamp = Date.now();
  let admin: APIRequestContext;
  let member: APIRequestContext;
  let memberAuthorId: number;
  const createdPostIds: number[] = [];

  test.beforeAll(async ({ baseURL }) => {
    admin = await adminContext(baseURL);
    await ensureMemberUser(admin, TEST_MEMBER);
    await ensureMemberUser(admin, TEST_MEMBER_TWO);
    member = await loginContext(baseURL, TEST_MEMBER);

    const me = await (await member.get("/api/users/me")).json();
    memberAuthorId = relationId(me.user?.author)!;
  });

  test.afterAll(async () => {
    for (const id of createdPostIds) await admin?.delete(`/api/posts/${id}`);
    await Promise.all([admin?.dispose(), member?.dispose()]);
  });

  test("D-T1: anonymous /members redirects to the login form, no member data leaks", async ({
    page,
  }) => {
    await page.goto("/members");
    await page.waitForURL("**/members/login");
    await expect(page.getByTestId("member-login-form")).toBeVisible();
    await expect(page.getByTestId("member-nav-logout")).toHaveCount(0);
    await expect(page.getByTestId("quota-card")).toHaveCount(0);
  });

  test("D-T2: logging in through the form lands on /members", async ({
    page,
  }) => {
    await loginViaForm(page, TEST_MEMBER);
    await expect(page).toHaveURL(/\/members$/);
    await expect(page.getByTestId("member-welcome")).toBeVisible();
  });

  test("D-T3: /members/profile shows displayName, author alias/bio, and quota matching the usage endpoint", async ({
    page,
  }) => {
    await loginViaForm(page, TEST_MEMBER);
    await page.goto("/members/profile");

    await expect(page.getByTestId("profile-author-name")).not.toHaveValue("");
    await expect(page.getByTestId("profile-display-name")).toBeVisible();

    const usage = await page.evaluate(() =>
      fetch("/api/members/storage-usage", { credentials: "same-origin" }).then(
        (r) => r.json() as Promise<{ quotaBytes: number; usedBytes: number }>,
      ),
    );
    const quotaGb = (usage.quotaBytes / (1024 * 1024 * 1024)).toFixed(2);
    const usedGb = (usage.usedBytes / (1024 * 1024 * 1024)).toFixed(2);
    const detail = page.getByTestId("quota-detail");
    await expect(detail).toContainText(quotaGb);
    await expect(detail).toContainText(usedGb);
  });

  test("D-T4: renaming the alias persists and the published byline updates after revalidate", async ({
    page,
  }) => {
    const alias = `野跑者-${stamp}`;
    await loginViaForm(page, TEST_MEMBER);
    await page.goto("/members/profile");

    await page.getByTestId("profile-author-name").fill(alias);
    await page.getByTestId("profile-save").click();
    await expect(page.getByTestId("profile-save-success")).toBeVisible();

    // Reload proves the write actually persisted, not just optimistic UI.
    await page.reload();
    await expect(page.getByTestId("profile-author-name")).toHaveValue(alias);

    const slug = `d4-byline-${stamp}`;
    const created = await member.post("/api/posts", {
      data: {
        title: slug,
        slug,
        description: "D-T4 byline propagation",
        content: lexicalParagraph("byline propagation body"),
        _status: "published",
        publishedAt: new Date().toISOString(),
      },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const doc = (await created.json()).doc;
    createdPostIds.push(doc.id);

    await page.goto(`/posts/${slug}`);
    await expect(page.locator("p.font-medium", { hasText: alias })).toBeVisible();
  });

  test("D-T5: a member's Profile page only ever shows their own author record", async ({
    page,
  }) => {
    await loginViaForm(page, TEST_MEMBER_TWO);
    await page.goto("/members/profile");

    const admin2 = await (
      await admin.get(`/api/authors/${memberAuthorId}?depth=0`)
    ).json();

    const shown = await page
      .getByTestId("profile-author-name")
      .inputValue();
    expect(shown).not.toBe(admin2.name);
  });

  test("D-T6: /members responses are never publicly cached", async ({
    request,
  }) => {
    const res = await request.get("/members", { maxRedirects: 0 });
    const cacheControl = res.headers()["cache-control"] ?? "";
    expect(cacheControl).toContain("no-store");
    expect(cacheControl).not.toContain("max-age=3600");
  });

  test("D-T7: an admin can open /members", async ({ page }) => {
    await loginViaForm(page, {
      email: process.env.E2E_ADMIN_EMAIL ?? "admin@wildrunner.test",
      password: process.env.E2E_ADMIN_PASSWORD ?? "WildRunnerAdmin1!",
    });
    await expect(page.getByTestId("member-welcome")).toBeVisible();
    await expect(page.getByTestId("member-nav-admin-switch")).toBeVisible();
  });
});
