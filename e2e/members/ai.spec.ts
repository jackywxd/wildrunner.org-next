import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "@playwright/test";

import {
  TEST_MEMBER,
  adminContext,
  anonContext,
  ensureMemberUser,
  loginContext,
} from "../helpers/members";

/**
 * M6 — AI access for members.
 *
 * /api/ai/expand-post already only checked `req.user`, so members could
 * already call it (P4 covers the endpoint itself). What changed here is the
 * rate-limit key: it used to be `${user.id}:${ip}`, so switching network or
 * spoofing a header reset a member's budget. These tests are about that
 * boundary specifically, not re-covering P4.
 */
test.describe("M6 member AI access", () => {
  const stamp = Date.now();
  let admin: APIRequestContext;
  let member: APIRequestContext;
  let anon: APIRequestContext;

  test.beforeAll(async ({ baseURL }) => {
    admin = await adminContext(baseURL);
    anon = await anonContext(baseURL);
    await ensureMemberUser(admin, TEST_MEMBER);
    member = await loginContext(baseURL, TEST_MEMBER);
  });

  test.afterAll(async () => {
    await Promise.all([admin?.dispose(), member?.dispose(), anon?.dispose()]);
  });

  test("M6-T1: unauthenticated is rejected", async () => {
    const response = await anon.post("/api/ai/expand-post", {
      data: { outline: "test" },
    });
    expect(response.status()).toBe(401);
  });

  test("M6-T2: a member can call the AI endpoint", async () => {
    const response = await member.post("/api/ai/expand-post", {
      data: { outline: `会员 AI 测试 ${stamp}` },
    });
    expect(
      response.ok(),
      `AI call failed: ${response.status()} ${await response.text()}`,
    ).toBeTruthy();
    const body = await response.json();
    expect(body.content?.root?.children?.length).toBeGreaterThan(0);
  });

  test("M6-T3: switching IP/User-Agent does not reset a member's limit", async ({
    baseURL,
  }) => {
    // Runs against a deployed origin too — see P4-T5 for why it used not to.
    // The endpoint counted after validating, so reaching the limiter required
    // paying for real inference; it counts before parsing now, so an empty
    // body is enough.
    // A fresh member so this test's count starts at zero regardless of
    // M6-T2 or anything else that ran before it.
    const email = `m6-ratelimit-${stamp}@wildrunner.test`;
    const password = "WildRunnerRateLimit1!";
    await ensureMemberUser(admin, { email, password });
    const limited = await loginContext(baseURL, { email, password });

    // Not `cf-connecting-ip`: Cloudflare's edge rejects a client attempting
    // to set that header itself (403, "error code: 1000") before the
    // request ever reaches the Worker — confirmed directly with curl.
    // `x-forwarded-for` and User-Agent are ordinary, unprotected headers,
    // and sufficient to prove the point: the limit no longer reads either.
    const spoofedHeaders: Record<string, string>[] = [
      { "x-forwarded-for": "1.1.1.1", "user-agent": "spoof-1" },
      { "x-forwarded-for": "8.8.8.8", "user-agent": "spoof-2" },
      { "x-forwarded-for": "203.0.113.1", "user-agent": "spoof-3" },
      { "x-forwarded-for": "198.51.100.1", "user-agent": "spoof-4" },
    ];

    const statuses: number[] = [];
    for (let index = 0; index < 11; index += 1) {
      const response = await limited.post("/api/ai/expand-post", {
        headers: spoofedHeaders[index % spoofedHeaders.length],
        // Empty on purpose: refused at validation, counted before it. What
        // this test is about is the *key* the limiter uses, not the payload.
        data: {},
      });
      statuses.push(response.status());
    }

    expect(
      statuses.slice(0, 10).every((status) => status === 400),
      `expected the first 10 refused as invalid, got: ${statuses.join(",")}`,
    ).toBeTruthy();
    expect(
      statuses[10],
      "spoofing IP/UA let an 11th request through — the limit is not keyed on user alone",
    ).toBe(429);

    await limited.dispose();
  });

  test("M6-T4: two members have independent budgets", async ({ baseURL }) => {
    const email = `m6-independent-${stamp}@wildrunner.test`;
    const password = "WildRunnerIndependent1!";
    await ensureMemberUser(admin, { email, password });
    const otherMember = await loginContext(baseURL, { email, password });

    const response = await otherMember.post("/api/ai/expand-post", {
      data: { outline: `独立额度测试 ${stamp}` },
    });
    // Unaffected by M6-T3 having just exhausted a *different* member's
    // budget on the same physical test run.
    expect(response.ok()).toBeTruthy();

    await otherMember.dispose();
  });

  test("M6-T5: AI-drafted content is still owned by the writer", async () => {
    const response = await member.post("/api/posts", {
      data: {
        title: `m6-ai-owner-${stamp}`,
        slug: `m6-ai-owner-${stamp}`,
        description: "AI ownership check",
        content: {
          root: {
            type: "root",
            children: [
              {
                type: "paragraph",
                children: [{ type: "text", text: "AI 辅助内容" }],
                direction: null,
                format: "",
                indent: 0,
                version: 1,
              },
            ],
            direction: null,
            format: "",
            indent: 0,
            version: 1,
          },
        },
        _status: "draft",
      },
    });
    expect(response.ok()).toBeTruthy();
    const doc = (await response.json()).doc;

    const me = await (await member.get("/api/users/me")).json();
    const owner =
      typeof doc.owner === "object" && doc.owner !== null ? doc.owner.id : doc.owner;
    expect(owner).toBe(me.user.id);

    await member.delete(`/api/posts/${doc.id}`);
  });
});
