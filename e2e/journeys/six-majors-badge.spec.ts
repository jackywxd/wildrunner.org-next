import type { APIRequestContext } from "@playwright/test";

import { budget } from "../helpers/budget";
import { recordCreated } from "../helpers/created";
import { adminContext } from "../helpers/members";
import { expect, test } from "../helpers/test";
import { SIX_MAJORS } from "@/lib/races/six-majors";

/**
 * SM — six marathon records become one badge, dated by the sixth.
 *
 * WHAT THIS COVERS THAT THE UNIT TEST CANNOT. `U-SIXMAJORS` proves the
 * function; this proves the six keys name rows a database will actually
 * accept a record against. Those are different claims and they fail
 * differently: a member logs Boston, `validateRaceCatalogueRef` rejects it
 * because the migration never ran here, and the badge is simply unreachable
 * — with the unit test green, because the seed it reads is a TypeScript
 * file. `X-T9` asserts the rows exist; this asserts they are usable.
 *
 * THE YEAR IS THE ASSERTION, not merely the badge's presence. Five majors
 * in 2011 and the sixth in 2012 must produce 2012, because that is when the
 * set was complete. A badge that appeared with the wrong year would look
 * entirely correct on the page.
 *
 * CREATES RECORDS THROUGH THE API, not the four selects. `member-races.spec`
 * already drives that form for its own sake; here the records are setup, and
 * six passes through a picker would be six chances to fail for a reason this
 * test is not about. What it does assert is read from the page a visitor
 * sees.
 *
 * 2011/2012 ARE CHOSEN, not incidental. `populateRaceRecordRefs`
 * find-or-creates a `(event, year)` edition for every record, so this test
 * makes twelve rows, not six — and it may only delete the editions it
 * actually created. Two years nobody would claim for a road marathon, plus
 * the precondition below, is what makes "created" and "found" distinguishable
 * (AGENTS.md: only ids captured at creation are deleted).
 */

const FIVE_YEAR = 2011;
const SIXTH_YEAR = 2012;
const SIXTH = "major-boston";

type Created = { collection: string; id: number };

test.describe("SM six majors badge", () => {
  let admin: APIRequestContext;
  const created: Created[] = [];

  test.beforeAll(async ({ baseURL }) => {
    admin = await adminContext(baseURL);
  });

  test.afterAll(async () => {
    // Records first, then editions: a record's `edition` is a foreign key,
    // and this order never asks the database to drop a row something still
    // points at.
    //
    // EVERY DELETE IS CHECKED. The first version of this hook did neither —
    // wrong order, and no assertion — so the six editions survived silently
    // and the next run failed on the precondition below instead. That is the
    // good failure, but it points at the wrong line; a delete that is allowed
    // to fail quietly turns a cleanup bug into a mystery two runs later.
    const failures: string[] = [];
    for (const collection of ["race-records", "race-editions"]) {
      for (const row of created.filter((row) => row.collection === collection)) {
        const response = await admin.delete(`/api/${collection}/${row.id}`);
        if (!response.ok()) {
          failures.push(`${collection}/${row.id}: ${response.status()} ${await response.text()}`);
        }
      }
    }
    await admin.dispose();
    expect(failures, "cleanup left rows behind").toEqual([]);
  });

  test("SM-T1: six records raise one badge, dated by the sixth", async ({ page }) => {
    test.setTimeout(budget(60_000));

    const eventsRes = await admin.get(
      `/api/race-events?limit=0&pagination=false&depth=0&where[key][in]=${SIX_MAJORS.join(",")}`,
    );
    expect(eventsRes.ok(), await eventsRes.text()).toBeTruthy();
    const events = ((await eventsRes.json()) as { docs: { id: number; key: string }[] }).docs;
    // Not a skip. An environment without these rows is one where the
    // migration did not run, and that is exactly what should be red here.
    expect(events.map((event) => event.key).sort()).toEqual([...SIX_MAJORS].sort());

    // The precondition that makes cleanup honest: if an edition already
    // exists for one of these years, this test's POST would find it rather
    // than create it, and deleting it afterwards would destroy a row that
    // was not ours.
    const existing = await admin.get(
      `/api/race-editions?limit=0&pagination=false&depth=0` +
        `&where[and][0][event][in]=${events.map((event) => event.id).join(",")}` +
        `&where[and][1][year][in]=${FIVE_YEAR},${SIXTH_YEAR}`,
    );
    expect(existing.ok(), await existing.text()).toBeTruthy();
    const stale = ((await existing.json()) as { docs: { id: number }[] }).docs;
    expect(
      stale.length,
      `editions already exist for ${FIVE_YEAR}/${SIXTH_YEAR} — a previous run did not clean up`,
    ).toBe(0);

    const badge = page.locator(
      `[data-testid="rider-badge-row"] [data-event-id="six-majors"]`,
    );

    await page.goto("/riders", { waitUntil: "domcontentloaded" });
    const before = await badge.count();

    for (const key of SIX_MAJORS) {
      const year = key === SIXTH ? SIXTH_YEAR : FIVE_YEAR;
      const response = await admin.post("/api/race-records?depth=0", {
        data: { distanceId: "marathon", eventId: key, year },
      });
      expect(response.ok(), await response.text()).toBeTruthy();
      const doc = ((await response.json()) as { doc: { edition?: number; id: number } }).doc;

      // Recorded before the next await, so a failure below still leaves
      // afterAll something to delete.
      created.push({ collection: "race-records", id: doc.id });
      recordCreated({ collection: "race-records", id: doc.id, note: `SM-T1 ${key} ${year}` });
      if (doc.edition) {
        created.push({ collection: "race-editions", id: doc.edition });
        recordCreated({
          collection: "race-editions",
          id: doc.edition,
          note: `SM-T1 ${key} ${year}`,
        });
      }
    }

    await page.goto("/riders", { waitUntil: "domcontentloaded" });
    await expect(badge).toHaveCount(before + 1);
    // 2012, not 2011 and not the newest record: the set completed when the
    // sixth race was run.
    await expect(
      page.locator(`[data-event-id="six-majors"][data-year="${SIXTH_YEAR}"]`).first(),
    ).toBeVisible();
  });
});
