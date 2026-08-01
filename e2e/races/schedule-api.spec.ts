import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "@playwright/test";

import { expectOkJson } from "../helpers/api";
import {
  TEST_MEMBER,
  adminContext,
  anonContext,
  ensureMemberUser,
  loginContext,
} from "../helpers/members";

/**
 * Phase E — the race-schedule collection.
 *
 * The rule worth pinning here is the one that DIFFERS from race-records: a
 * signed-in member can create their own race record, but the schedule is
 * site-wide reference data and only an admin may touch it. That asymmetry
 * is easy to lose in a refactor and impossible to see from the UI, because
 * members never get shown the collection at all.
 *
 * Read stays public, since the schedule is the point of a public page.
 */

type Entry = { id: number; name: string; startDate: string };

const unique = (label: string) => `E2E ${label} ${Date.now()}-${Math.random()}`;

test.describe("E race schedule API", () => {
  let admin: APIRequestContext;
  let member: APIRequestContext;
  let anon: APIRequestContext;

  const created: number[] = [];

  async function createAs(
    context: APIRequestContext,
    data: Record<string, unknown>,
  ) {
    return context.post("/api/race-schedule", { data });
  }

  test.beforeAll(async ({ baseURL }) => {
    admin = await adminContext(baseURL);
    await ensureMemberUser(admin, TEST_MEMBER);
    member = await loginContext(baseURL, TEST_MEMBER);
    anon = await anonContext(baseURL);
  });

  test.afterAll(async () => {
    // Cleared here as well as in cleanup-staging-test-data.ts: this runs on
    // every green run, and the script covers the runs that failed hard.
    for (const id of created) await admin?.delete(`/api/race-schedule/${id}`);
    await Promise.all([admin?.dispose(), member?.dispose(), anon?.dispose()]);
  });

  test("E-T1: anonymous can read the schedule", async () => {
    const list = await anon.get("/api/race-schedule?limit=1");
    expect(list.ok(), "the schedule is a public page").toBeTruthy();
  });

  test("E-T2: anonymous cannot write", async () => {
    const write = await createAs(anon, {
      name: unique("anon"),
      series: "others",
      startDate: "2027-01-01T00:00:00.000Z",
    });
    expect(write.ok()).toBeFalsy();
    expect([401, 403]).toContain(write.status());
  });

  test("E-T3: a signed-in member cannot write either", async () => {
    const write = await createAs(member, {
      name: unique("member"),
      series: "others",
      startDate: "2027-01-01T00:00:00.000Z",
    });
    expect(
      write.ok(),
      "unlike race-records, the schedule is admin-only",
    ).toBeFalsy();
    expect([401, 403]).toContain(write.status());
  });

  test("E-T4: an admin can create and delete", async () => {
    const name = unique("admin");
    const body = await expectOkJson<{ doc: Entry }>(
      await createAs(admin, {
        name,
        series: "others",
        startDate: "2027-03-01T00:00:00.000Z",
      }),
    );
    expect(body.doc.name).toBe(name);

    const deleted = await admin.delete(`/api/race-schedule/${body.doc.id}`);
    expect(deleted.ok()).toBeTruthy();
  });

  test("E-T5: a member cannot delete an admin's row", async () => {
    const body = await expectOkJson<{ doc: Entry }>(
      await createAs(admin, {
        name: unique("guarded"),
        series: "others",
        startDate: "2027-03-02T00:00:00.000Z",
      }),
    );
    created.push(body.doc.id);

    const deleted = await member.delete(`/api/race-schedule/${body.doc.id}`);
    expect(deleted.ok()).toBeFalsy();
  });

  test("E-T6: the same race on the same day is rejected", async () => {
    const name = unique("dup");
    const first = await expectOkJson<{ doc: Entry }>(
      await createAs(admin, {
        name,
        series: "others",
        startDate: "2027-04-01T00:00:00.000Z",
      }),
    );
    created.push(first.doc.id);

    // Deliberately a different time on the same calendar day: the guard has
    // to compare days, not timestamps, or the REST API can slip a duplicate
    // past the day-only picker.
    const second = await createAs(admin, {
      name,
      series: "others",
      startDate: "2027-04-01T09:30:00.000Z",
    });
    expect(second.ok()).toBeFalsy();
  });

  test("E-T7: an unknown catalogue event is rejected, an empty one is not", async () => {
    const bad = await createAs(admin, {
      eventId: "utmb-not-a-real-race",
      name: unique("badevent"),
      series: "utmb",
      startDate: "2027-05-01T00:00:00.000Z",
    });
    expect(bad.ok()).toBeFalsy();

    const good = await expectOkJson<{ doc: Entry }>(
      await createAs(admin, {
        eventId: "",
        name: unique("noevent"),
        series: "others",
        startDate: "2027-05-02T00:00:00.000Z",
      }),
    );
    created.push(good.doc.id);
  });

  test("E-T8: an others-series catalogue event resolves", async () => {
    // The series added for this feature. If `others` were missing from the
    // catalogue, this create would fail on the eventId validator.
    const body = await expectOkJson<{ doc: Entry }>(
      await createAs(admin, {
        eventId: "other-hardrock",
        name: unique("hardrock"),
        series: "others",
        startDate: "2027-05-03T00:00:00.000Z",
      }),
    );
    created.push(body.doc.id);
  });

  test("E-T9: impossible date ranges are rejected", async () => {
    const backwards = await createAs(admin, {
      endDate: "2027-06-01T00:00:00.000Z",
      name: unique("backwards"),
      series: "others",
      startDate: "2027-06-05T00:00:00.000Z",
    });
    expect(backwards.ok()).toBeFalsy();

    const wrongYear = await createAs(admin, {
      endDate: "2028-06-07T00:00:00.000Z",
      name: unique("wrongyear"),
      series: "others",
      startDate: "2027-06-05T00:00:00.000Z",
    });
    expect(wrongYear.ok(), "a mistyped year must not paint the calendar").toBeFalsy();
  });

  test("E-T10: impossible registration windows are rejected", async () => {
    const backwards = await createAs(admin, {
      name: unique("regbackwards"),
      registrationClosesAt: "2027-01-01T00:00:00.000Z",
      registrationOpensAt: "2027-02-01T00:00:00.000Z",
      series: "others",
      startDate: "2027-07-05T00:00:00.000Z",
    });
    expect(backwards.ok()).toBeFalsy();

    const afterRace = await createAs(admin, {
      name: unique("regafter"),
      registrationClosesAt: "2027-07-10T00:00:00.000Z",
      series: "others",
      startDate: "2027-07-05T00:00:00.000Z",
    });
    expect(afterRace.ok()).toBeFalsy();
  });
});
