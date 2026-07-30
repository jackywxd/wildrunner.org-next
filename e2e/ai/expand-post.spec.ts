import { test, expect } from "@playwright/test";
import { ensureAdminUser, TEST_ADMIN } from "../helpers/auth";
import { expectOkJson } from "../helpers/api";
import { adminContext, ensureMemberUser, loginContext } from "../helpers/members";
import { lexicalParagraph } from "@/lib/lexical-helpers";

const OUTLINE = "训练前先制定目标，然后逐步增加爬升。";

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

  test("P4-T5: rapid requests are rate limited", async ({ baseURL }) => {
    // The 60s rate-limit window can't be validated against a real deployment:
    // real Workers AI takes ~10s/call, so 11 sequential calls span ~110s —
    // by request 6 or 7 the window has already expired and the limiter
    // resets, so the 11th call never gets a 429 no matter what. This is a
    // property of testing wall-clock rate limiting against real inference
    // latency, not a bug — confirmed by direct measurement (curl, ~10.6s per
    // call) and reproducible every time. Only meaningful against the local
    // dev server's deterministic stub (NEXTJS_ENV=test), where 11 calls
    // complete in milliseconds, safely inside the window.
    test.skip(
      !baseURL || !baseURL.includes("localhost"),
      "60s rate-limit window is shorter than 11 sequential real Workers AI calls",
    );
    // A dedicated throwaway member, not the shared admin fixture: the limit
    // is keyed per-user (M6), so reusing an account other tests in this
    // file already called AI on would make the first-ten-succeed count
    // order-dependent on what ran before it in the same 60s window.
    const admin = await adminContext(baseURL);
    const email = `p4-rate-${Date.now()}@wildrunner.test`;
    await ensureMemberUser(admin, {
      email,
      password: "WildRunnerRateLimit1!",
    });
    const rateLimited = await loginContext(baseURL, {
      email,
      password: "WildRunnerRateLimit1!",
    });

    const statuses: number[] = [];
    for (let index = 0; index < 11; index += 1) {
      const response = await rateLimited.post("/api/ai/expand-post", {
        data: { outline: `限流测试 ${index}` },
      });
      statuses.push(response.status());
    }
    expect(statuses.slice(0, 10).every((status) => status === 200)).toBeTruthy();
    expect(statuses[10]).toBe(429);

    await admin.dispose();
    await rateLimited.dispose();
  });

  test("P4-T4/T7: Admin AI widget writes draft content and keeps text on errors", async ({
    page,
    request,
  }) => {
    // Two real Workers AI round trips against a deployed environment
    // (~10s each observed on staging) plus UI overhead comfortably exceed
    // Playwright's 30s default; the local dev server uses a deterministic
    // stub (NEXTJS_ENV=test) and finishes in milliseconds regardless.
    test.setTimeout(90_000);
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
    await page.getByTestId("ai-assist-outline").fill(OUTLINE);
    await page.getByRole("button", { name: "AI 完善文章", exact: true }).click();

    // Assert the editor received *expanded* content, not that it echoed the
    // outline back. The original assertion looked for the input phrase
    // verbatim, which only held for the old llama-3.1 model that parroted
    // its input; llama-3.3-70b genuinely rewrites ("在开始越野跑或马拉松训
    // 练之前，制定明确的目标..."), so that assertion passed or failed
    // depending on the wording the model happened to pick.
    const editor = page.locator('[contenteditable="true"]').last();
    await expect(editor).not.toContainText("原始草稿段落", { timeout: 30_000 });
    const expanded = (await editor.innerText()).trim();

    // Longer than the outline that produced it, rather than longer than a
    // fixed character count: against a deployed target this is real model
    // output (hundreds of characters), while CI uses the deterministic stub
    // in aiExpandPost.ts, whose result is ~54 characters. A hardcoded
    // threshold made this pass or fail on which backend answered.
    expect(expanded.length).toBeGreaterThan(OUTLINE.length);
    expect(expanded).toMatch(/[\u3400-\u9fff]/);

    // P4-T7: an error must leave the generated text alone rather than
    // clearing the editor.
    await page.getByTestId("ai-assist-outline").fill("");
    await page.getByRole("button", { name: "AI 完善文章", exact: true }).click();
    await expect(page.getByTestId("ai-assist-error")).toBeVisible();
    expect((await editor.innerText()).trim()).toBe(expanded);

    // Wait for the save request itself to land. Clicking and immediately
    // reading the API is a race the test lost every time: the assertion ran
    // against the pre-AI content because the PATCH hadn't been issued yet.
    const saved = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/posts/${id}`) &&
        response.request().method() === "PATCH",
    );
    // The admin's default account language became Traditional Chinese
    // (zh-TW) once payload.config.ts enabled it — @payloadcms/translations
    // renders this button as 儲存草稿, not the Simplified 保存草稿.
    await page.getByRole("button", { name: /save draft|儲存草稿/i }).click();
    const saveResponse = await saved;
    expect(
      saveResponse.ok(),
      `save draft failed: ${saveResponse.status()}`,
    ).toBeTruthy();

    const found = await request.get(
      `/api/posts/${id}?draft=true`,
    );
    expect(found.ok()).toBeTruthy();
    const body = await found.json();
    expect(body.doc?._status ?? body._status).toBe("draft");
    const savedContent = JSON.stringify(body.doc?.content ?? body.content);
    expect(savedContent).not.toContain("原始草稿段落");
    // A prefix of what the editor showed — enough to prove the AI output is
    // what got persisted, without depending on the model's exact wording.
    expect(savedContent).toContain(expanded.slice(0, 12));
    expect(TEST_ADMIN.email).toBeTruthy();
  });
});
