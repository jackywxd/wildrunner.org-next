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
import { EARLIEST_RACE_YEAR } from "@/lib/races/catalogue";

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

  // Importing for someone else writes records they own, so the only person
  // who may name an owner is an admin — and a member who tries is refused,
  // not quietly served their own results (a client that believes it is
  // importing for somebody must not write to its own list). The alias
  // endpoints write the shared catalogue. None of these reach UltraSignup.
  test("M-ULTRA-API-4: only an admin imports for a member or aligns names", async ({ baseURL }) => {
    test.setTimeout(budget(45_000));

    const admin = await adminContext(baseURL);
    const member = await ensureMemberUser(admin, TEST_MEMBER);
    const memberContext = await loginContext(baseURL, TEST_MEMBER);
    const anon = await anonContext(baseURL);
    const forMember = { name: "Xu Dong Wu", ownerId: member.id as number };

    try {
      const results = await memberContext.post("/api/members/ultrasignup-results", { data: forMember });
      expect(results.status()).toBe(403);
      const imported = await memberContext.post("/api/members/ultrasignup-import", {
        data: { ...forMember, date: "2024-07-06", personId: 1, rawName: "x" },
      });
      expect(imported.status()).toBe(403);
      expect((await memberContext.get("/api/members/ultrasignup-aliases")).status()).toBe(403);
      const add = await memberContext.post("/api/members/ultrasignup-aliases", {
        data: { alias: "Anything", eventKey: "anything" },
      });
      expect(add.status()).toBe(403);
      expect((await anon.get("/api/members/ultrasignup-aliases")).status()).toBe(401);

      // An admin is still held to a real member and a usable name.
      const nobody = await admin.post("/api/members/ultrasignup-results", {
        data: { name: "Xu Dong Wu", ownerId: 2_000_000_000 },
      });
      expect(nobody.status()).toBe(404);
      const oneWord = await admin.post("/api/members/ultrasignup-results", {
        data: { name: "Wu", ownerId: member.id },
      });
      expect(oneWord.status()).toBe(400);
    } finally {
      await Promise.all([admin.dispose(), memberContext.dispose(), anon.dispose()]);
    }
  });

  // The evidence is a record an admin imported for a member and placed by
  // hand, carrying an UltraSignup title the catalogue does not know. The
  // failures: the name is never proposed, accepting it does not make it
  // match (it is still proposed after), or a name that already belongs to
  // another event is added anyway and stops both matching.
  test("M-ULTRA-API-5: a hand-placed title is proposed, accepted once, and then matches", async ({
    baseURL,
  }) => {
    test.setTimeout(budget(60_000));

    const admin = await adminContext(baseURL);
    const member = await ensureMemberUser(admin, TEST_MEMBER_TWO);
    const categories = (await (
      await admin.get("/api/race-categories?depth=0&limit=1&sort=id&where[historical][not_equals]=true")
    ).json()) as { docs: { event: number; key: string }[] };
    const [first] = categories.docs;
    const eventOf = async (rowId: number) =>
      (await (await admin.get(`/api/race-events/${rowId}?depth=0`)).json()) as {
        id: number;
        key: string;
        name: string;
        ultrasignupAliases?: string | null;
      };
    const event = await eventOf(first.event);
    const original = event.ultrasignupAliases ?? null;
    // Unique per run: the spelling a parallel shard proposes is never this one.
    const spelling = `M-ULTRA-API-5 Spelling ${Date.now()}`;
    let recordId: number | undefined;

    try {
      // Precondition, not adaptation. fixture-scoped: the one key this test
      // writes under; the seeded corpus gives this member no record there,
      // and residue from an earlier run should fail loudly.
      const clash = await admin.get(
        `/api/race-records?depth=0&limit=1&where[owner][equals]=${member.id}&where[eventId][equals]=${event.key}&where[distanceId][equals]=${first.key}&where[year][equals]=${EARLIEST_RACE_YEAR}`,
      );
      expect(((await clash.json()) as { totalDocs: number }).totalDocs).toBe(0);

      const created = await admin.post("/api/race-records?depth=0", {
        data: {
          distanceId: first.key,
          eventId: event.key,
          owner: member.id,
          result: "finished",
          ultrasignupDate: `${EARLIEST_RACE_YEAR}-06-01`,
          ultrasignupTitle: `${spelling} - 50K`,
          year: EARLIEST_RACE_YEAR,
        },
      });
      expect(created.status(), await created.text()).toBe(201);
      const { doc } = (await created.json()) as { doc: { id: number; owner: number } };
      recordId = doc.id;
      recordCreated({ collection: "race-records", id: recordId, note: "M-ULTRA-API-5" });
      expect(doc.owner).toBe(member.id);

      type Proposal = { alias: string; eventKey: string; records: number };
      const proposals = async () =>
        ((await (await admin.get("/api/members/ultrasignup-aliases")).json()) as {
          proposals: Proposal[];
        }).proposals.filter((proposal) => proposal.alias === spelling);
      expect(await proposals()).toEqual([
        expect.objectContaining({ alias: spelling, eventKey: event.key, records: 1 }),
      ]);

      // Another event's own name cannot become this event's alias.
      const others = (await (
        await admin.get(`/api/race-events?depth=0&limit=1&sort=id&where[id][not_equals]=${event.id}`)
      ).json()) as { docs: { name: string }[] };
      expect(others.docs, "the seeded catalogue has more than one event").toHaveLength(1);
      const taken = await admin.post("/api/members/ultrasignup-aliases", {
        data: { alias: others.docs[0].name, eventKey: event.key },
      });
      expect(taken.status()).toBe(409);

      const add = await admin.post("/api/members/ultrasignup-aliases", {
        data: { alias: spelling, eventKey: event.key },
      });
      expect(add.status(), await add.text()).toBe(200);
      expect(await add.json()).toEqual({ added: true });
      const after = await eventOf(first.event);
      expect(after.ultrasignupAliases?.split("\n")).toContain(spelling);
      expect(await proposals()).toEqual([]);

      const again = await admin.post("/api/members/ultrasignup-aliases", {
        data: { alias: spelling, eventKey: event.key },
      });
      expect(await again.json()).toEqual({ added: false });
    } finally {
      // The event's aliases go back to exactly what was read before.
      await admin.patch(`/api/race-events/${first.event}`, {
        data: { ultrasignupAliases: original },
      });
      if (recordId !== undefined) await admin.delete(`/api/race-records/${recordId}`);
      await admin.dispose();
    }
  });
});
