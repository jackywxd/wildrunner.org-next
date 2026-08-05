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
 * M2 — invite flow.
 *
 * Invites reuse Payload's own reset-password token, so these tests follow
 * the whole path: create the account, hand back a link, set a password with
 * it, sign in.
 */
test.describe("M2 member invitations", () => {
  const stamp = Date.now();
  const invitedEmail = `m2-invited-${stamp}@wildrunner.test`;
  const invitedPassword = "WildRunnerInvited1!";

  let admin: APIRequestContext;
  let member: APIRequestContext;
  let anon: APIRequestContext;
  let invitedUserId: number | undefined;
  let inviteLink: string | undefined;

  test.beforeAll(async ({ baseURL }) => {
    admin = await adminContext(baseURL);
    anon = await anonContext(baseURL);
    await ensureMemberUser(admin);
    member = await loginContext(baseURL, TEST_MEMBER);
  });

  test.afterAll(async () => {
    if (invitedUserId) await admin?.delete(`/api/users/${invitedUserId}`);
    await Promise.all([admin?.dispose(), member?.dispose(), anon?.dispose()]);
  });

  test("M2-T1: anonymous cannot invite", async () => {
    const response = await anon.post("/api/members/invite", {
      data: { email: `nope-${stamp}@wildrunner.test` },
    });
    expect(response.status()).toBe(401);
  });

  test("M2-T2: a member cannot invite", async () => {
    const response = await member.post("/api/members/invite", {
      data: { email: `nope-member-${stamp}@wildrunner.test` },
    });
    expect(response.status()).toBe(403);
  });

  test("M2-T3: admin invites and receives a usable link", async () => {
    const response = await admin.post("/api/members/invite", {
      data: { email: invitedEmail, displayName: "受邀作者" },
    });
    expect(
      response.status(),
      `invite failed: ${await response.text()}`,
    ).toBe(201);

    const body = await response.json();
    invitedUserId = body.userId;
    inviteLink = body.inviteLink;

    expect(body.email).toBe(invitedEmail);
    // Without Resend configured the link is handed back instead.
    expect(body.sent === true || typeof body.inviteLink === "string").toBe(true);

    const created = await admin.get(`/api/users/${invitedUserId}?depth=0`);
    const user = await created.json();
    expect(user.role).toBe("member");
    expect(user.invitePending).toBe(true);
    expect(user.displayName).toBe("受邀作者");
  });

  test("M2-T4: inviting an existing email is rejected", async () => {
    // fixture-scoped: the count is of the address this test invited.
    const response = await admin.post("/api/members/invite", {
      data: { email: invitedEmail },
    });
    expect(response.status()).toBe(409);

    const all = await admin.get(
      `/api/users?where[email][equals]=${encodeURIComponent(invitedEmail)}&limit=10&depth=0`,
    );
    expect((await all.json()).totalDocs).toBe(1);
  });

  test("M2-T5: a bad email is rejected before an account is made", async () => {
    const response = await admin.post("/api/members/invite", {
      data: { email: "not-an-email" },
    });
    expect(response.status()).toBe(400);
  });

  test("M2-T6: the invite token sets a password and grants login", async ({
    baseURL,
  }) => {
    test.skip(!inviteLink, "no invite link returned (email delivery path)");

    const token = inviteLink!.split("/admin/reset/")[1];
    expect(token).toBeTruthy();

    const reset = await anon.post("/api/users/reset-password", {
      data: { token, password: invitedPassword },
    });
    expect(
      reset.ok(),
      `reset failed: ${reset.status()} ${await reset.text()}`,
    ).toBeTruthy();

    const invited = await loginContext(baseURL, {
      email: invitedEmail,
      password: invitedPassword,
    });
    const me = await invited.get("/api/users/me");
    const body = await me.json();
    expect(body.user?.email).toBe(invitedEmail);
    expect(body.user?.role).toBe("member");
    // M2-T7: signing in marks the invitation as accepted.
    expect(body.user?.invitePending).toBe(false);
    await invited.dispose();
  });

  test("M2-T8: a spent or forged token is refused", async () => {
    const reset = await anon.post("/api/users/reset-password", {
      data: { token: "definitely-not-a-real-token", password: "Whatever1!" },
    });
    expect(reset.status()).toBeGreaterThanOrEqual(400);
  });
});
