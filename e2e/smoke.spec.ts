import { test, expect } from "@playwright/test";

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
});

test.describe("P0 admin guard", () => {
  test("P0-T5: unauthenticated cannot list users via API", async ({
    request,
  }) => {
    const response = await request.get("/api/users");
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});
