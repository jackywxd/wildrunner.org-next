import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "@playwright/test";

import { expectOkJson } from "../helpers/api";
import { adminContext, anonContext } from "../helpers/members";

/**
 * Phase F — the daily maintenance endpoint.
 *
 * Two things are worth pinning. First that it is not open to the world: it
 * writes, and it is called by a workflow holding a shared secret, so an
 * unauthenticated POST must bounce. Second that the one piece of genuinely
 * stale-able state — a manual `registrationStatusOverride` left on a race
 * that has already run — actually gets cleared, since that is the only
 * reason the job exists at all.
 *
 * Authenticated as an admin rather than with the secret: RACE_MAINTENANCE_SECRET
 * is a Worker secret and is not set in the test environment, and the
 * endpoint deliberately accepts an admin session so it can be triggered by
 * hand.
 */

type Entry = { id: number };

type Report = {
  checkedAt: string;
  total: number;
  clearedOverrides: { id: number }[];
  staleVerification: { id: number }[];
  missingRegistration: { id: number }[];
  closingSoon: { id: number }[];
};

const unique = (label: string) => `E2E maint ${label} ${Date.now()}-${Math.random()}`;

/** Days from today, as the ISO timestamp the REST API expects. */
const shift = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10) +
  "T00:00:00.000Z";

test.describe("F race schedule maintenance", () => {
  let admin: APIRequestContext;
  let anon: APIRequestContext;

  const created: number[] = [];

  async function create(data: Record<string, unknown>): Promise<Entry> {
    const body = await expectOkJson<{ doc: Entry }>(
      await admin.post("/api/race-schedule", { data }),
    );
    created.push(body.doc.id);
    return body.doc;
  }

  test.beforeAll(async ({ baseURL }) => {
    admin = await adminContext(baseURL);
    anon = await anonContext(baseURL);
  });

  test.afterAll(async () => {
    for (const id of created) await admin?.delete(`/api/race-schedule/${id}`);
    await Promise.all([admin?.dispose(), anon?.dispose()]);
  });

  test("F-T1: anonymous cannot run maintenance", async () => {
    const response = await anon.post("/api/races/maintenance");
    expect(response.ok()).toBeFalsy();

    // Two different rejections, and the difference matters more than it
    // looks. 401 means "you are not authorised"; 500 means
    // RACE_MAINTENANCE_SECRET is not configured *at all* — which is the
    // state of any environment that has not opted into the daily job,
    // including this test run and a fresh production deploy.
    //
    // This list originally existed only to make the test pass, and that
    // hid the unconfigured case from view: nothing anywhere asked what
    // happens on day one when the secret is absent. The answer turned out
    // to be a blocked production deploy and a workflow that failed every
    // day. Both are fixed; this comment is here so the 500 is read as a
    // documented configuration state rather than noise to widen the list
    // around.
    expect([401, 500]).toContain(response.status());
  });

  test("F-T2: a wrong secret is rejected", async () => {
    const response = await anon.post("/api/races/maintenance", {
      headers: { "X-Maintenance-Secret": "definitely-not-the-secret" },
    });
    expect(response.ok()).toBeFalsy();
  });

  test("F-T3: an admin gets a report with every section", async () => {
    const report = await expectOkJson<Report>(
      await admin.post("/api/races/maintenance"),
    );
    expect(typeof report.checkedAt).toBe("string");
    expect(Array.isArray(report.clearedOverrides)).toBeTruthy();
    expect(Array.isArray(report.staleVerification)).toBeTruthy();
    expect(Array.isArray(report.missingRegistration)).toBeTruthy();
    expect(Array.isArray(report.closingSoon)).toBeTruthy();
  });

  test("F-T4: a stale override on a past race is cleared", async () => {
    const past = await create({
      name: unique("past"),
      registrationStatusOverride: "full",
      series: "others",
      startDate: shift(-30),
    });

    const report = await expectOkJson<Report>(
      await admin.post("/api/races/maintenance"),
    );
    expect(report.clearedOverrides.map((row) => row.id)).toContain(past.id);

    const after = await expectOkJson<{ registrationStatusOverride: unknown }>(
      await admin.get(`/api/race-schedule/${past.id}?depth=0`),
    );
    expect(after.registrationStatusOverride).toBeFalsy();
  });

  test("F-T5: an override on a future race is left alone", async () => {
    const future = await create({
      name: unique("future"),
      registrationStatusOverride: "full",
      series: "others",
      startDate: shift(30),
    });

    const report = await expectOkJson<Report>(
      await admin.post("/api/races/maintenance"),
    );
    expect(report.clearedOverrides.map((row) => row.id)).not.toContain(future.id);
  });

  test("F-T6: a future race with no registration info is reported", async () => {
    const bare = await create({
      name: unique("bare"),
      series: "others",
      startDate: shift(45),
    });

    const report = await expectOkJson<Report>(
      await admin.post("/api/races/maintenance"),
    );
    expect(report.missingRegistration.map((row) => row.id)).toContain(bare.id);
    // No verifiedAt either, so it belongs in the other list too.
    expect(report.staleVerification.map((row) => row.id)).toContain(bare.id);
  });

  test("F-T7: a registration window closing soon is reported", async () => {
    const closing = await create({
      name: unique("closing"),
      registrationClosesAt: shift(7),
      registrationOpensAt: shift(-7),
      series: "others",
      startDate: shift(60),
    });

    const report = await expectOkJson<Report>(
      await admin.post("/api/races/maintenance"),
    );
    expect(report.closingSoon.map((row) => row.id)).toContain(closing.id);
  });
});
