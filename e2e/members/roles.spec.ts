import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "../helpers/test";

import {
  TEST_MEMBER,
  adminContext,
  ensureMemberUser,
  getAdminUser,
  loginContext,
} from "../helpers/members";

/**
 * M0 — roles and privilege boundaries.
 *
 * Before roles existed every authenticated user could read, edit and delete
 * every other user and rewrite the Site global. These are deliberately
 * negative tests: each one is a hole that must stay closed.
 */
test.describe("M0 roles and privilege boundaries", () => {
  let admin: APIRequestContext;
  let member: APIRequestContext;
  let adminUserId: number | string;
  let memberUserId: number | string;

  test.beforeAll(async ({ baseURL }) => {
    admin = await adminContext(baseURL);
    const adminUser = await getAdminUser(admin);
    adminUserId = adminUser.id;

    const memberDoc = await ensureMemberUser(admin);
    memberUserId = memberDoc.id;
    member = await loginContext(baseURL, TEST_MEMBER);
  });

  test.afterAll(async () => {
    await admin?.dispose();
    await member?.dispose();
  });

  test("M0-T1: the bootstrap account is an admin", async () => {
    const user = await getAdminUser(admin);
    expect(user.role).toBe("admin");
  });

  test("M0-T2: admin can create a member account", async () => {
    const response = await admin.get(`/api/users/${memberUserId}?depth=0`);
    expect(response.ok()).toBeTruthy();
    const user = await response.json();
    expect(user.role).toBe("member");
  });

  test("M0-T3: member cannot promote itself to admin", async () => {
    const response = await member.patch(`/api/users/${memberUserId}`, {
      data: { role: "admin" },
    });

    // Payload strips fields failing field-level access rather than erroring,
    // so a 200 here is fine — what matters is that the role did not change.
    const verify = await member.get("/api/users/me");
    const body = await verify.json();
    expect(
      body.user?.role,
      `role escalated via ${response.status()} response`,
    ).toBe("member");
  });

  test("M0-T4: member only sees its own user record", async () => {
    // fixture-scoped: access control returns exactly the caller's own row,
    // whatever else is in the users table.
    const response = await member.get("/api/users?limit=100&depth=0");
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.totalDocs).toBe(1);
    expect(body.docs[0].email).toBe(TEST_MEMBER.email);
  });

  test("M0-T5: member cannot modify or delete the admin account", async () => {
    const update = await member.patch(`/api/users/${adminUserId}`, {
      data: { email: "hijacked@wildrunner.test" },
    });
    expect(update.status()).toBeGreaterThanOrEqual(400);

    const remove = await member.delete(`/api/users/${adminUserId}`);
    expect(remove.status()).toBeGreaterThanOrEqual(400);

    // The admin account must still be usable.
    const stillThere = await admin.get(`/api/users/${adminUserId}?depth=0`);
    expect(stillThere.ok()).toBeTruthy();
    expect((await stillThere.json()).email).not.toBe("hijacked@wildrunner.test");
  });

  test("M0-T6: member cannot create further accounts", async () => {
    const response = await member.post("/api/users", {
      data: {
        email: `spawned-${Date.now()}@wildrunner.test`,
        password: "WildRunnerSpawn1!",
        role: "admin",
      },
    });
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test("M0-T7: member cannot edit the Site global", async () => {
    const response = await member.post("/api/globals/site", {
      data: { heroTitleZh: "member owned this" },
    });
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test("M0-T9: member admin UI hides admin-only sections", async ({ page }) => {
    // page.context().request shares the page's cookie jar, so logging in
    // here authenticates the browser session too.
    const login = await page.context().request.post("/api/users/login", {
      data: TEST_MEMBER,
    });
    expect(login.ok()).toBeTruthy();

    await page.goto("/admin");
    // Href, not the link text: Posts now renders as "文章" once
    // payload.config.ts's i18n makes zh-TW the account default, and a
    // language-sensitive locator here would just be testing which
    // language happened to be selected.
    await expect(
      page.locator('a[href^="/admin/collections/posts"]').first(),
    ).toBeVisible();

    const hrefs = await page
      .locator('a[href^="/admin"]')
      .evaluateAll((links) =>
        links.map((link) => link.getAttribute("href") ?? ""),
      );

    expect(hrefs.some((href) => href.startsWith("/admin/collections/users"))).toBe(
      false,
    );
    expect(hrefs.some((href) => href.startsWith("/admin/globals/site"))).toBe(
      false,
    );
    // Their own profile stays reachable.
    expect(hrefs).toContain("/admin/account");
  });

  test("M0-T8: admin can still edit the Site global", async () => {
    // Write the existing values straight back: this asserts the write path
    // without mutating real content (an earlier e2e run overwrote the live
    // hero title this way).
    const current = await admin.get("/api/globals/site?depth=0");
    expect(current.ok()).toBeTruthy();
    const site = await current.json();

    const response = await admin.post("/api/globals/site", {
      data: {
        heroTitleEn: site.heroTitleEn,
        heroTitleZh: site.heroTitleZh,
      },
    });
    expect(
      response.ok(),
      `admin site update failed: ${response.status()} ${await response.text()}`,
    ).toBeTruthy();

    const after = await admin.get("/api/globals/site?depth=0");
    expect((await after.json()).heroTitleZh).toBe(site.heroTitleZh);
  });
});
