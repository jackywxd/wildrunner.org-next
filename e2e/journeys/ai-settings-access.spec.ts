import { apiTest as test, expect } from "../helpers/api-test";
import {
  TEST_MEMBER,
  adminContext,
  anonContext,
  ensureMemberUser,
  loginContext,
} from "../helpers/members";

/**
 * C-AISETTINGS — only an admin can see or change which AI backend runs.
 *
 * Contract level, because the rule is an HTTP answer: `ai-settings` is a
 * global, and Payload enforces a global's access separately from every
 * collection's, so a missing rule here is a hole nothing else covers. The
 * cost of the hole is concrete — a member flipping the site to Claude would
 * spend the club's Anthropic credit, or, with no key set, break every AI
 * button for everyone.
 *
 * The admin read is the positive control. A 403 for the member means nothing
 * unless the same route answers 200 for someone; otherwise a typo in the
 * slug would pass this test by answering 404 to everybody.
 */
test.describe("C-AISETTINGS the AI backend is admin-only", () => {
  test("C-AISETTINGS-T1: a member and a visitor can neither read nor change it", async ({
    baseURL,
  }) => {
    const admin = await adminContext(baseURL);
    await ensureMemberUser(admin, TEST_MEMBER);
    const member = await loginContext(baseURL, TEST_MEMBER);
    const anon = await anonContext(baseURL);

    // Captured before anything can change it, so teardown restores what
    // this run found rather than a value this test assumed.
    const before = await admin.get("/api/globals/ai-settings?depth=0");
    expect(before.status(), "admin read is the positive control").toBe(200);
    const original = ((await before.json()) as { provider?: string }).provider;

    try {
      expect((await member.get("/api/globals/ai-settings")).status()).toBe(403);
      expect((await anon.get("/api/globals/ai-settings")).status()).toBe(403);

      const memberWrite = await member.post("/api/globals/ai-settings", {
        data: { provider: "claude" },
      });
      expect(memberWrite.status()).toBe(403);
      const anonWrite = await anon.post("/api/globals/ai-settings", {
        data: { provider: "claude" },
      });
      expect(anonWrite.status()).toBe(403);

      // The refusals wrote nothing.
      const after = await admin.get("/api/globals/ai-settings?depth=0");
      expect(((await after.json()) as { provider?: string }).provider).toBe(original);
    } finally {
      // Only matters if a refused write was in fact accepted — which is the
      // failure — and then it must not leave the site on Claude.
      await admin.post("/api/globals/ai-settings", {
        data: { provider: original ?? "workers-ai" },
      });
      await Promise.all([admin.dispose(), member.dispose(), anon.dispose()]);
    }
  });
});
