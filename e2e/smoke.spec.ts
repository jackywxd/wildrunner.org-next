import { test, expect } from "./helpers/test";

import { TEST_MEMBER, adminContext, ensureMemberUser } from "./helpers/members";

test.describe("P0 smoke", () => {
  test("P0-T2: public home responds", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator("body")).toBeVisible();
  });

  test("P0-T2: admin route is reachable", async ({ page }) => {
    const response = await page.goto("/admin");
    expect(response?.ok()).toBeTruthy();
    // First-run create-user or login form
    await expect(page.locator("body")).toBeVisible();
    await expect(page).toHaveURL(/\/admin/);
  });

  /**
   * P0-T6 — a signed-in page that has to reach the database.
   *
   * WHY THE TWO ABOVE ARE NOT ENOUGH. Both hit pages that render without
   * touching D1: `/` is prerendered, and `/admin` unauthenticated is the
   * static login form. A staging deploy once 500'd every dynamic route in
   * the app while both of these kept returning 200, so the smoke check said
   * the site was up while nothing a logged-in member could do worked.
   *
   * `/members/posts` is the cheapest page that cannot lie: it requires a
   * session, queries `posts` scoped to the member, and renders their own
   * list. If Payload cannot initialise — a bad binding, a half-applied
   * migration, a config that throws in the Worker — this fails and the two
   * tests above still pass.
   *
   * Verify by breaking it, once, deliberately: this assertion is only worth
   * having if it has been seen to fail.
   */
  test("P0-T6: a signed-in member page reaches the database", async ({
    browser,
    baseURL,
  }) => {
    const admin = await adminContext(baseURL);
    await ensureMemberUser(admin);
    await admin.dispose();

    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto("/members/login");
      await page.getByTestId("member-login-email").fill(TEST_MEMBER.email);
      await page.getByTestId("member-login-password").fill(TEST_MEMBER.password);
      await page.getByTestId("member-login-submit").click();
      await page.waitForURL("**/members");

      const response = await page.goto("/members/posts");
      expect(
        response?.status(),
        "a dynamic, authenticated page must render — a 500 here is the outage /admin cannot see",
      ).toBe(200);
      // The list or its empty state. Either proves the query ran; neither
      // renders if Payload failed to start.
      await expect(
        page.getByTestId("posts-list").or(page.getByTestId("posts-empty")),
      ).toBeVisible();
    } finally {
      await context.close();
    }
  });
});

test.describe("P0 admin guard", () => {
  test("P0-T5: unauthenticated cannot list users via API", async ({
    request,
  }) => {
    const response = await request.get("/api/users");
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});
