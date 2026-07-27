import { test, expect } from "@playwright/test";
import { ensureAdminUser, TEST_ADMIN } from "../helpers/auth";
import { expectOkJson } from "../helpers/api";
import { lexicalParagraph } from "@/lib/lexical-helpers";

test.describe("P4 AI expand post", () => {
  test("P4-T1: unauthenticated rejected", async ({ request }) => {
    const response = await request.post("/api/ai/expand-post", {
      data: { outline: "test" },
    });
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test("P4-T2/T3: authenticated expand and empty body 400", async ({
    request,
  }) => {
    await ensureAdminUser(request);

    const empty = await request.post("/api/ai/expand-post", { data: {} });
    expect(empty.status()).toBe(400);

    const outline = "第一周跑量 80km，含两次爬坡。";
    const response = await request.post("/api/ai/expand-post", {
      headers: { "x-forwarded-for": `p4-valid-${Date.now()}` },
      data: {
        title: "UTMB 训练",
        outline,
      },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.content?.root?.children?.length).toBeGreaterThan(0);
    expect(body.expandedLength).toBeGreaterThan(outline.length);
    expect(JSON.stringify(body.content)).toMatch(/[\u3400-\u9fff]/);
  });

  test("P4-T5: rapid requests are rate limited", async ({ request }) => {
    await ensureAdminUser(request);
    const ip = `p4-rate-${Date.now()}`;
    const statuses: number[] = [];
    for (let index = 0; index < 11; index += 1) {
      const response = await request.post("/api/ai/expand-post", {
        headers: { "x-forwarded-for": ip },
        data: { outline: `限流测试 ${index}` },
      });
      statuses.push(response.status());
    }
    expect(statuses.slice(0, 10).every((status) => status === 200)).toBeTruthy();
    expect(statuses[10]).toBe(429);
  });

  test("P4-T4/T7: Admin AI widget writes draft content and keeps text on errors", async ({
    page,
    request,
  }) => {
    await ensureAdminUser(request);
    const state = await request.storageState();
    await page.context().addCookies(state.cookies);

    const slug = `p4-admin-${Date.now()}`;
    const created = await expectOkJson(
      await request.post("/api/posts", {
        data: {
          title: "AI Admin Draft",
          slug,
          description: "AI admin draft test",
          content: lexicalParagraph("原始草稿段落"),
          _status: "draft",
        },
      }),
    );
    const id = created.doc?.id ?? created.id;

    await page.goto(`/admin/collections/posts/${id}`);
    await expect(page.getByTestId("ai-assist")).toBeVisible({ timeout: 20_000 });
    await page
      .getByTestId("ai-assist-outline")
      .fill("训练前先制定目标，然后逐步增加爬升。");
    await page.getByRole("button", { name: "AI 完善文章", exact: true }).click();

    const editor = page.locator('[contenteditable="true"]').last();
    await expect(editor).toContainText("训练前先制定目标", { timeout: 15_000 });

    await page.getByTestId("ai-assist-outline").fill("");
    await page.getByRole("button", { name: "AI 完善文章", exact: true }).click();
    await expect(page.getByTestId("ai-assist-error")).toBeVisible();
    await expect(editor).toContainText("训练前先制定目标");

    await page.getByRole("button", { name: /save draft|保存草稿/i }).click();

    const found = await request.get(
      `/api/posts/${id}?draft=true`,
    );
    expect(found.ok()).toBeTruthy();
    const body = await found.json();
    expect(body.doc?._status ?? body._status).toBe("draft");
    expect(JSON.stringify(body.doc?.content ?? body.content)).toContain(
      "训练前先制定目标",
    );
    expect(TEST_ADMIN.email).toBeTruthy();
  });
});
