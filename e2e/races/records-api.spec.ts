import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "@playwright/test";

import { expectOkJson } from "../helpers/api";
import {
  TEST_MEMBER,
  TEST_MEMBER_TWO,
  adminContext,
  anonContext,
  ensureMemberUser,
  loginContext,
} from "../helpers/members";
import { RACE_EVENTS } from "@/lib/races/catalogue";

/**
 * Phase B — the race-records collection.
 *
 * Access control is the whole point of this file. A race badge is meant to
 * be seen, so read is public; everything that writes is owner-scoped.
 */

const EVENT = RACE_EVENTS[0];
const OTHER = RACE_EVENTS[1];

type Record = { distanceId: string; eventId: string; id: number; year: number };

test.describe("B race records API", () => {
  let admin: APIRequestContext;
  let memberOne: APIRequestContext;
  let memberTwo: APIRequestContext;
  let anon: APIRequestContext;

  const created: number[] = [];

  async function addRecord(
    context: APIRequestContext,
    overrides: Partial<Record> = {},
  ) {
    const response = await context.post("/api/race-records", {
      data: {
        distanceId: EVENT.distances[0].id,
        eventId: EVENT.id,
        year: 2019,
        ...overrides,
      },
    });
    return response;
  }

  test.beforeAll(async ({ baseURL }) => {
    admin = await adminContext(baseURL);
    await ensureMemberUser(admin, TEST_MEMBER);
    await ensureMemberUser(admin, TEST_MEMBER_TWO);

    memberOne = await loginContext(baseURL, TEST_MEMBER);
    memberTwo = await loginContext(baseURL, TEST_MEMBER_TWO);
    anon = await anonContext(baseURL);
  });

  test.afterAll(async () => {
    for (const id of created) await admin?.delete(`/api/race-records/${id}`);
    await Promise.all([
      admin?.dispose(),
      memberOne?.dispose(),
      memberTwo?.dispose(),
      anon?.dispose(),
    ]);
  });

  test("B-T2: anonymous can read but cannot write", async () => {
    const list = await anon.get("/api/race-records?limit=1");
    expect(list.ok(), "anonymous read must work — badges are public").toBeTruthy();

    const write = await addRecord(anon);
    expect(write.ok()).toBeFalsy();
    expect([401, 403]).toContain(write.status());
  });

  test("B-T3: a member cannot touch another member's record", async () => {
    const mine = await expectOkJson<{ doc: Record }>(
      await addRecord(memberOne, { year: 2018 }),
    );
    created.push(mine.doc.id);

    const patched = await memberTwo.patch(`/api/race-records/${mine.doc.id}`, {
      data: { year: 1999 },
    });
    expect(patched.ok()).toBeFalsy();

    const deleted = await memberTwo.delete(`/api/race-records/${mine.doc.id}`);
    expect(deleted.ok()).toBeFalsy();

    // Still intact and still the original year.
    const after = await expectOkJson<Record>(
      await admin.get(`/api/race-records/${mine.doc.id}?depth=0`),
    );
    expect(after.year).toBe(2018);
  });

  test("B-T4: a signed-in member sees other members' records", async () => {
    // The trap this pins: `ownedOnlyPublicRead` would return true for
    // anonymous but narrow to `{ owner: me }` for a signed-in member, so
    // every other profile would look empty to everyone who is logged in —
    // public, but invisible to the community it exists for. Same bug R-T8
    // guards for the directory itself.
    const theirs = await expectOkJson<{ doc: Record }>(
      await addRecord(memberTwo, { year: 2017 }),
    );
    created.push(theirs.doc.id);

    const seen = await expectOkJson<Record>(
      await memberOne.get(`/api/race-records/${theirs.doc.id}?depth=0`),
    );
    expect(seen.id).toBe(theirs.doc.id);
  });

  test("B-T5: a duplicate is a field error, not a 500", async () => {
    const first = await expectOkJson<{ doc: Record }>(
      await addRecord(memberOne, { year: 2016 }),
    );
    created.push(first.doc.id);

    const again = await addRecord(memberOne, { year: 2016 });
    expect(again.ok()).toBeFalsy();
    // The point of the guard: a bare 500 tells the member nothing and is
    // indistinguishable from a real fault.
    expect(again.status()).toBe(400);
    expect(again.status()).not.toBe(500);

    // Same race, different year, is a different record and must succeed.
    const differentYear = await expectOkJson<{ doc: Record }>(
      await addRecord(memberOne, { year: 2015 }),
    );
    created.push(differentYear.doc.id);

    // And the same year on a different event, likewise.
    const differentEvent = await expectOkJson<{ doc: Record }>(
      await addRecord(memberOne, {
        distanceId: OTHER.distances[0].id,
        eventId: OTHER.id,
        year: 2016,
      }),
    );
    created.push(differentEvent.doc.id);
  });

  test("B-T6: the owner is stamped and cannot be forged", async () => {
    const me = await expectOkJson<{ user: { id: number } }>(
      await memberOne.get("/api/users/me"),
    );
    const them = await expectOkJson<{ user: { id: number } }>(
      await memberTwo.get("/api/users/me"),
    );

    const forged = await expectOkJson<{ doc: Record & { owner?: unknown } }>(
      await memberOne.post("/api/race-records", {
        data: {
          distanceId: EVENT.distances[0].id,
          eventId: EVENT.id,
          owner: them.user.id,
          year: 2014,
        },
      }),
    );
    created.push(forged.doc.id);

    const stored = await expectOkJson<{ owner?: number | { id: number } }>(
      await admin.get(`/api/race-records/${forged.doc.id}?depth=0`),
    );
    const ownerId =
      typeof stored.owner === "object" && stored.owner
        ? stored.owner.id
        : stored.owner;
    // Field-level access strips a submitted `owner` before `setOwner` fills
    // in the real one, so the forgery is silently ignored rather than honoured.
    expect(ownerId).toBe(me.user.id);
  });

  test("B-T7: an unknown event or distance is rejected at write time", async () => {
    const badEvent = await addRecord(memberOne, { eventId: "utmb-not-real" });
    expect(badEvent.ok()).toBeFalsy();
    expect(badEvent.status()).toBe(400);

    // A real event, but a distance it does not run.
    const badDistance = await addRecord(memberOne, { distanceId: "999k" });
    expect(badDistance.ok()).toBeFalsy();
    expect(badDistance.status()).toBe(400);

    const badYear = await addRecord(memberOne, { year: 1900 });
    expect(badYear.ok()).toBeFalsy();
    expect(badYear.status()).toBe(400);
  });
});
