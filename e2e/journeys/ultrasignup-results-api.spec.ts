import { apiTest as test, expect } from "../helpers/api-test";
import {
  adminContext,
  anonContext,
  ensureMemberUser,
  loginContext,
  TEST_MEMBER,
  TEST_MEMBER_TWO,
} from "../helpers/members";
import { TEST_ADMIN } from "../helpers/auth";
import { budget } from "../helpers/budget";
import { recordCreated } from "../helpers/created";

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

  // A catalogue request names which race a member ran, and its status is
  // what tells them an admin has acted. So: nobody else reads it, and a
  // member cannot file one already approved or approve their own later.
  // Contract level because every one of these is a single request's answer.
  test("M-ULTRA-API-3: a catalogue request is the member's own, and only an admin decides it", async ({
    baseURL,
  }) => {
    test.setTimeout(budget(45_000));

    const admin = await adminContext(baseURL);
    const owner = await ensureMemberUser(admin, TEST_MEMBER);
    await ensureMemberUser(admin, TEST_MEMBER_TWO);
    const member = await loginContext(baseURL, TEST_MEMBER);
    const other = await loginContext(baseURL, TEST_MEMBER_TWO);
    const anon = await anonContext(baseURL);
    let id: number | undefined;
    // Unique per run so a parallel shard's request is never this one.
    const title = `M-ULTRA-API-3 Race ${Date.now()} - 50K`;

    try {
      // depth=0: the default populates `owner` into the whole account.
      const created = await member.post("/api/race-catalogue-requests?depth=0", {
        data: {
          adminNote: "self-approved",
          distanceText: "50K",
          eventName: title.replace(" - 50K", ""),
          raceDate: "2024-03-01",
          reason: "event",
          status: "approved",
          ultrasignupTitle: title,
        },
      });
      expect(created.status(), await created.text()).toBe(201);
      const { doc } = (await created.json()) as {
        doc: { adminNote?: string | null; id: number; owner: number; status: string };
      };
      id = doc.id;
      recordCreated({ collection: "race-catalogue-requests", id, note: "M-ULTRA-API-3" });
      expect(doc.status).toBe("pending");
      expect(doc.adminNote ?? null).toBeNull();
      expect(doc.owner).toBe(owner.id);

      const again = await member.post("/api/race-catalogue-requests", {
        data: {
          eventName: "x",
          raceDate: "2024-03-01",
          reason: "event",
          ultrasignupTitle: title,
        },
      });
      expect(again.status()).toBe(409);

      const selfApprove = await member.patch(`/api/race-catalogue-requests/${id}`, {
        data: { status: "approved" },
      });
      expect(selfApprove.status()).toBe(403);

      const theirs = await other.get(
        `/api/race-catalogue-requests?where[id][equals]=${id}&depth=0`,
      );
      expect(theirs.ok()).toBeTruthy();
      expect(((await theirs.json()) as { docs: unknown[] }).docs).toHaveLength(0);

      const visitor = await anon.get("/api/race-catalogue-requests?depth=0");
      expect(visitor.status()).toBe(403);

      const decided = await admin.patch(`/api/race-catalogue-requests/${id}`, {
        data: { status: "approved" },
      });
      expect(decided.ok(), await decided.text()).toBeTruthy();
      const mine = await member.get(`/api/race-catalogue-requests/${id}?depth=0`);
      expect(((await mine.json()) as { status: string }).status).toBe("approved");
    } finally {
      if (id !== undefined) await admin.delete(`/api/race-catalogue-requests/${id}`);
      await Promise.all([admin.dispose(), member.dispose(), other.dispose(), anon.dispose()]);
    }
  });
});
