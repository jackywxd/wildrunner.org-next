import { apiTest as test, expect } from "../helpers/api-test";
import { anonContext } from "../helpers/members";
import { TEST_ADMIN } from "../helpers/auth";
import { budget } from "../helpers/budget";

/**
 * M-ULTRA-API — the two refusals `/api/members/ultrasignup-results` makes
 * before it fetches anything.
 *
 * The browser journeys (M-ULTRA) fulfil this route themselves, so nothing
 * there would notice the endpoint answering a visitor or fetching with an
 * empty name. Contract level because both are visible to a POST.
 *
 * Neither case reaches UltraSignup, which is the point: the endpoint must
 * refuse before the outbound request, and a test that let it through would
 * depend on a site that is not ours. The successful path is U-ULTRA (the
 * pure pipeline, against a recorded answer and the seeded catalogue).
 */
test.describe("M-ULTRA-API the UltraSignup results endpoint", () => {
  test("M-ULTRA-API-1: a visitor, and a member with no saved name, are refused", async ({
    baseURL,
    request,
  }) => {
    test.setTimeout(budget(30_000));

    const anon = await anonContext(baseURL);
    const visitor = await anon.post("/api/members/ultrasignup-results");
    expect(visitor.status()).toBe(401);
    await anon.dispose();

    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();
    const { user } = (await login.json()) as {
      user: { id: number; ultrasignupName?: string | null };
    };
    const original = user.ultrasignupName ?? "";

    try {
      const cleared = await request.patch(`/api/users/${user.id}`, {
        data: { ultrasignupName: "" },
      });
      expect(cleared.ok(), await cleared.text()).toBeTruthy();

      const unnamed = await request.post("/api/members/ultrasignup-results");
      expect(unnamed.status()).toBe(400);
    } finally {
      await request.patch(`/api/users/${user.id}`, {
        data: { ultrasignupName: original },
      });
    }
  });

  // `/members/ultrasignup-import` writes `race-categories`, so its refusals
  // matter more than the list's. A body without the row's identity is
  // refused before UltraSignup is asked, which is also why this needs no
  // network: the successful path re-reads a site that is not ours.
  test("M-ULTRA-API-2: the import endpoint refuses a visitor, no saved name, and a bare body", async ({
    baseURL,
    request,
  }) => {
    test.setTimeout(budget(30_000));

    const anon = await anonContext(baseURL);
    const visitor = await anon.post("/api/members/ultrasignup-import", {
      data: { date: "2024-07-06", personId: 1, rawName: "x" },
    });
    expect(visitor.status()).toBe(401);
    await anon.dispose();

    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();
    const { user } = (await login.json()) as {
      user: { id: number; ultrasignupName?: string | null };
    };
    const original = user.ultrasignupName ?? "";

    try {
      await request.patch(`/api/users/${user.id}`, { data: { ultrasignupName: "" } });
      const unnamed = await request.post("/api/members/ultrasignup-import", {
        data: { date: "2024-07-06", personId: 1, rawName: "x" },
      });
      expect(unnamed.status()).toBe(400);

      const named = await request.patch(`/api/users/${user.id}`, {
        data: { ultrasignupName: "Xu Dong Wu" },
      });
      expect(named.ok(), await named.text()).toBeTruthy();
      for (const data of [{}, { date: "2024-07-06", personId: "1", rawName: "x" }, { personId: 1 }]) {
        const bare = await request.post("/api/members/ultrasignup-import", { data });
        expect(bare.status(), JSON.stringify(data)).toBe(400);
      }
    } finally {
      await request.patch(`/api/users/${user.id}`, {
        data: { ultrasignupName: original },
      });
    }
  });
});
