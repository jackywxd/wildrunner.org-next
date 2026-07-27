import { test, expect } from "@playwright/test";
import { ensureAdminUser } from "../helpers/auth";
import { lexicalParagraph } from "@/lib/lexical-helpers";

test.describe("P2 public posts from Payload", () => {
  test("P2-T1/T3: published post visible, draft hidden", async ({
    request,
    page,
  }) => {
    await ensureAdminUser(request);
    const slug = `p2-public-${Date.now()}`;
    const title = "P2 Published Title";
    const bodyText = "P2 published body visible on site";

    const create = await request.post("/api/posts", {
      data: {
        title,
        slug,
        description: "P2 description",
        content: lexicalParagraph(bodyText),
        _status: "draft",
      },
    });
    expect(create.ok()).toBeTruthy();
    const created = await create.json();
    const id = created.doc?.id ?? created.id;

    await page.goto(`/posts/${slug}`);
    await expect(page.getByRole("heading", { name: title })).toHaveCount(0);

    await request.patch(`/api/posts/${id}`, {
      data: {
        _status: "published",
        publishedAt: new Date().toISOString(),
      },
    });

    await page.goto(`/posts/${slug}`);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText(bodyText)).toBeVisible();
    await expect(page.locator("body")).not.toContainText('"type":"root"');
  });

  test("P2-T8: /og returns an image", async ({ request }) => {
    const response = await request.get("/og?title=test");
    expect(response.ok()).toBeTruthy();
    const contentType = response.headers()["content-type"] ?? "";
    expect(contentType).toMatch(/image\//);
  });
});

test.describe("P2 home and about", () => {
  test("P2-T4/T6: home and about render", async ({ page }) => {
    const home = await page.goto("/");
    expect(home?.ok()).toBeTruthy();
    await expect(page.locator("body")).toBeVisible();

    const about = await page.goto("/about");
    expect(about?.ok()).toBeTruthy();
    await expect(page.getByText("About", { exact: true }).first()).toBeVisible();
  });

  test("P2-T9: mobile viewport has no page errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/gallery");
    expect(errors).toEqual([]);
  });
});
