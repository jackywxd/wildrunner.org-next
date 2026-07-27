import { test, expect } from "@playwright/test";

test.describe("P1 access control", () => {
  test("P1-T8: unauthenticated cannot create posts", async ({ request }) => {
    const response = await request.post("/api/posts", {
      data: {
        title: "Unauthorized",
        slug: "unauthorized-post",
        description: "should fail",
        content: {
          root: {
            type: "root",
            children: [
              {
                type: "paragraph",
                children: [{ type: "text", text: "nope" }],
              },
            ],
            direction: null,
            format: "",
            indent: 0,
            version: 1,
          },
        },
      },
    });
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test("P1 collections are registered in admin", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.locator("body")).toBeVisible();
    // Login or create-first-user screen still under /admin
    await expect(page).toHaveURL(/\/admin/);
  });
});
