/**
 * What a member does with race records, end to end.
 *
 * WHY THIS EXISTS, AND WHY NOW. The race catalogue is about to move out of
 * `src/lib/races/catalogue.ts` and into the database (docs/plan: race domain
 * model, PR 2). Every step of that is supposed to change how a record is
 * *stored* and nothing about what a member can *do* — and this file is the
 * only thing that will notice if that turns out to be false.
 *
 * Written before the migration rather than after it, deliberately. A test
 * added afterwards only records that the new code does what the new code
 * does; this one was seen passing against the old storage first, so when it
 * passes against the new one that means something.
 *
 * The journey drives the real UI throughout — the sign-in form, the four
 * selects, the add button, the delete button. Creating a record by POSTing
 * to `/api/race-records` and reading the page back would prove the API and
 * the renderer agree, which is not the claim being made.
 */
import { expect, test } from "../helpers/test";
import { TEST_ADMIN } from "../helpers/auth";
import { recordCreated } from "../helpers/created";
import { budget } from "../helpers/budget";
import { deleteCreatedRows } from "../helpers/teardown";

/**
 * The public directory is where a record stops being private bookkeeping and
 * becomes the thing members actually want: a badge other people can see.
 *
 * Counted as a delta rather than asserted absolutely, because a developer's
 * database has records in it already and CI's has whatever the seed made.
 * `+1 then back to 0` is true in both, and it is also the strongest form of
 * the claim: this member's action, and nothing else, changed the page.
 */
async function badgeCount(
  page: import("@playwright/test").Page,
  eventId: string,
  distanceId: string,
  year: string,
) {
  await page.goto("/riders", { waitUntil: "domcontentloaded" });
  // Matched on all three of event, category and year — not event and year.
  //
  // A badge is one (event, category, year). Matching on two of the three
  // counts every category a member entered at that race in that year as the
  // same badge, so "one more than before" could be satisfied by a record this
  // test did not create.
  const locator = page.locator(
    `[data-event-id="${eventId}"][data-distance-id="${distanceId}"][data-year="${year}"]`,
  );

  // Polled rather than read once. This assertion read 2 where it expected 1
  // on CI more than once (docs/testing-plan.md); a trace captured from one
  // of those failures pinned the mechanism — Playwright's own
  // accessibility snapshot, taken moments after `.count()` returned 2,
  // showed exactly one matching badge, and so did the raw network response
  // for that same navigation. The DOM briefly held two matching nodes
  // during hydration and settled back to one before anything else looked.
  // `domcontentloaded` fires before hydration finishes, so a single count
  // taken right after it can land inside that window.
  //
  // Waiting for the count to agree across two checks rides out that window
  // without guessing how long it lasts, which a fixed delay would have to.
  // 10 attempts * 100ms is generous against a hydration settle that should
  // take single-digit milliseconds; it only spends more than one iteration
  // when the race actually fires.
  let value = await locator.count();
  for (let attempt = 0; attempt < 10; attempt++) {
    await page.waitForTimeout(100);
    const next = await locator.count();
    if (next === value) return value;
    value = next;
  }
  return value;
}

test.describe("M what a member does with race records", () => {
  /**
   * Teardown that runs whether the test passed, failed or threw.
   *
   * The happy path deletes the record through the UI, because removing one is
   * itself part of what a member does. This is the other half: when the test
   * fails at step 4 or 5 it never reaches step 6, and the record it created
   * survives into the next run — where it is refused as a duplicate and the
   * failure that follows describes something else entirely. That happened
   * twice while this file was being written, and the second failure cost more
   * to diagnose than the first, because its stated reason was not its cause.
   *
   * Deletes by id, not "everything this member owns". A developer's database
   * has real records in it, and a teardown that clears a collection is a
   * teardown that will eventually clear something somebody wanted.
   *
   * Over the API rather than the UI on purpose: teardown is not the subject
   * of the test, and it has to work even when the page is in whatever state
   * the failure left it in.
   */
  let createdRecordId: string | null = null;
  // Set only by M-CLAIM-EDITION, below — the edition that test's claim
  // auto-created. Without deleting this too, the second run of that test
  // finds `event/2010` already claimed (by the first run) and correctly
  // refuses to proceed, which looks like a test bug but is really a missing
  // teardown: the guard is doing exactly what it is there to do.
  let createdEditionId: string | null = null;

  test.afterEach(async ({ request }) => {
    const pending: { collection: string; id: number | string }[] = [];
    if (createdRecordId) {
      pending.push({ collection: "race-records", id: createdRecordId });
      createdRecordId = null;
    }
    if (createdEditionId) {
      pending.push({ collection: "race-editions", id: createdEditionId });
      createdEditionId = null;
    }
    await deleteCreatedRows(request, pending);
  });

  test("M-RACES: records a race, it reaches the public directory, removes it", async ({
    page,
  }) => {
    // THE BUDGET, and it is the whole reason this went red on CI (#121, run
    // 33598427723). The delete assertion below timed out having polled seven
    // times — nowhere near the 15s it asks for, which at Playwright's
    // backing-off intervals is about five seconds of waiting. What actually
    // ended it was the 20s default from playwright.config.ts, firing while
    // that assertion was still polling. The row may well have gone a second
    // later; nothing here ever found out.
    //
    // This is the longest journey in the suite and the only one still running
    // on that default. It is the only test that signs in through the form
    // (deliberately — see the header), it arrives by clicking rather than by
    // URL, it reads the catalogue out of three selects, and it loads /riders
    // twice, each time polling until two counts agree. Every other journey
    // doing a fraction of this sets 60s: gallery-library-upload,
    // editor-autosave, editor-preview, gallery-album-order and the rest.
    //
    // So the fix is the budget, not a retry around the click. A retry would
    // have made this green while leaving it just as blind to running out of
    // time — and "retries are not a fix, and neither is the first plausible
    // cause" is in AGENTS.md because that has already cost a real diagnosis.
    test.setTimeout(budget(60_000));

    // 1. Sign in through the form. This is the only journey that does — the
    //    others would only be re-testing it — and it is here rather than in a
    //    login-only spec because a session that cannot reach a page that
    //    queries the database is not a session. `/members/races` queries.
    await page.goto("/members/login", { waitUntil: "domcontentloaded" });
    await page.getByTestId("member-login-email").fill(TEST_ADMIN.email);
    await page.getByTestId("member-login-password").fill(TEST_ADMIN.password);
    await page.getByTestId("member-login-submit").click();
    // Anchored to the end. `/\/members(\/|$)/` also matches `/members/login`,
    // so a failed sign-in satisfied it and the next page loaded as an
    // anonymous visitor — which showed up much later as a missing control.
    // Third time a prefix pattern has passed for a page that never moved.
    await expect(page).toHaveURL(/\/members$/, { timeout: budget(15_000) });

    // 2. Arrive by clicking. The calendar-toggle bug lived entirely in soft
    //    navigation; anything reachable by a link needs one test that uses it.
    await page.getByRole("link", { name: /賽事|比賽/ }).first().click();
    await expect(page).toHaveURL(/\/members\/races/, { timeout: budget(15_000) });

    const eventSelect = page.getByTestId("race-event-select");
    const distanceSelect = page.getByTestId("race-distance-select");
    const yearSelect = page.getByTestId("race-year-select");
    await expect(eventSelect).toBeVisible();

    // 3. Choose a combination this member does not already have. The form
    //    refuses duplicates, so picking blind would make the test's own
    //    residue decide whether it passes.
    const existing = await page
      .getByTestId("race-record-row")
      .allInnerTexts();
    const eventId = await eventSelect
      .locator("option:not([value=''])")
      .first()
      .getAttribute("value");
    if (!eventId) throw new Error("no race event to choose");
    await eventSelect.selectOption(eventId);

    const distanceId = await distanceSelect
      .locator("option:not([value=''])")
      .first()
      .getAttribute("value");
    if (!distanceId) throw new Error("no distance for the chosen event");
    await distanceSelect.selectOption(distanceId);

    const years = await yearSelect.locator("option").allTextContents();
    const year = years.find((y) => !existing.some((row) => row.includes(y)));
    if (!year) throw new Error("every selectable year already has a record");
    await yearSelect.selectOption(year);

    const before = await badgeCount(page, eventId, distanceId, year);
    await page.goto("/members/races", { waitUntil: "domcontentloaded" });

    // 4. Record it.
    await eventSelect.selectOption(eventId);
    await distanceSelect.selectOption(distanceId);
    await yearSelect.selectOption(year);
    await page.getByTestId("race-record-add").click();

    // Count, not "a row with this year exists". An earlier version asserted
    // the latter and passed against a row left behind by its own previous
    // failed run — the add had been refused as a duplicate, and the residue
    // answered for it. One more row than before cannot be satisfied by
    // something that was already on the page.
    await expect(page.getByTestId("race-record-row")).toHaveCount(
      existing.length + 1,
      { timeout: budget(15_000) },
    );
    await expect(page.getByTestId("race-record-error")).toHaveCount(0);
    const newRow = page
      .getByTestId("race-record-row")
      .filter({ hasText: year });
    await expect(newRow).toHaveCount(1);
    // Captured the moment it exists, so teardown can find it even if the
    // assertions below are the ones that fail.
    createdRecordId = await newRow.first().getAttribute("data-record-id");
    // Also recorded for the staging cleanup, which now deletes only what a run
    // claims. Against localhost and CI the database is rebuilt per run and
    // nothing reads this file; against staging it is the difference between
    // removing what this test made and removing whatever matches a pattern.
    if (createdRecordId) {
      recordCreated({
        collection: "race-records",
        id: createdRecordId,
        note: `M-RACES ${eventId} ${year}`,
      });
    }

    // 5. The payoff: it is public now.
    expect(await badgeCount(page, eventId, distanceId, year)).toBe(before + 1);

    // 6. And a member can take it back. Also this test's cleanup — a journey
    //    that leaves rows behind becomes the input to the next run of itself,
    //    and to anything asserting over the whole corpus.
    // `goto`, not `goBack`. Back-navigation restores Next's client router
    // cache, which on first writing this returned the list as it was *before*
    // the record was added. Whether a member pressing Back should see their
    // own new record is a real question and a different test's — putting it
    // here would mean this journey failed for a reason other than the one it
    // names. Noted in docs/testing-plan.md rather than silently worked around.
    await page.goto("/members/races", { waitUntil: "domcontentloaded" });
    await page
      .getByTestId("race-record-row")
      .filter({ hasText: year })
      .first()
      .getByTestId("race-record-delete")
      .click();
    await expect(
      page.getByTestId("race-record-row").filter({ hasText: year }),
    ).toHaveCount(0, { timeout: budget(15_000) });

    expect(await badgeCount(page, eventId, distanceId, year)).toBe(before);
  });

  /**
   * S1 (docs/plan): a member's claim can name a race and a year, never
   * dictate what the public schedule says about it. `race-editions.create`
   * is admin-only (RaceEditions.ts) — the only way a member's write reaches
   * it is `populateRaceRecordRefs` (RaceRecords.ts, hooks.beforeChange)
   * find-or-creating one with `overrideAccess`, restricted to exactly
   * `event` and `year`. This is the test that would fail if that
   * restriction were ever loosened — every other field on the created row
   * asserted empty, not just the two that should be set.
   *
   * API-level, not a UI journey: the property under test is what a write
   * persists, not how a page renders it — TESTING.md's "cheapest level
   * that can observe the failure".
   *
   * Year 2010 (`EARLIEST_RACE_YEAR`), deliberately the oldest allowed value:
   * `race_editions` only otherwise holds near-term schedule-derived rows,
   * and `raceYearOptions` (catalogue.ts) offers years newest-first, so
   * M-RACES above — which claims the first available year — can never reach
   * this far down the list and collide with it.
   */
  test("M-CLAIM-EDITION: claiming a race+year with no edition creates one restricted to event+year (S1)", async ({
    request,
  }) => {
    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "sign-in").toBeTruthy();

    // A real event and category this environment's catalogue actually has —
    // not hardcoded, so this does not depend on which rows data/*.csv
    // happens to carry.
    const eventsRes = await request.get("/api/race-events?limit=1&depth=0");
    expect(eventsRes.ok()).toBeTruthy();
    const event = ((await eventsRes.json()) as { docs: { id: number; key: string }[] })
      .docs[0];
    if (!event) throw new Error("no race event in this environment's catalogue");

    const categoriesRes = await request.get(
      `/api/race-categories?limit=1&depth=0&where[event][equals]=${event.id}`,
    );
    expect(categoriesRes.ok()).toBeTruthy();
    const category = ((await categoriesRes.json()) as { docs: { key: string }[] }).docs[0];
    if (!category) throw new Error(`event ${event.key} has no category to claim`);

    const year = 2010;
    const preexisting = await request.get(
      `/api/race-editions?limit=1&depth=0&where[and][0][event][equals]=${event.id}&where[and][1][year][equals]=${year}`,
    );
    expect(preexisting.ok()).toBeTruthy();
    if (((await preexisting.json()) as { docs: unknown[] }).docs.length > 0) {
      throw new Error(
        `${event.key}/${year} already has an edition — this test needs a genuinely unclaimed combination`,
      );
    }

    // depth=0: Payload's default (2) would populate `edition` into a full
    // object, and this needs the raw id to fetch it again below.
    const created = await request.post("/api/race-records?depth=0", {
      data: { eventId: event.key, distanceId: category.key, year },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const record = ((await created.json()) as { doc: { id: number; edition?: number } }).doc;
    createdRecordId = String(record.id);
    recordCreated({
      collection: "race-records",
      id: createdRecordId,
      note: `M-CLAIM-EDITION ${event.key} ${year}`,
    });

    expect(record.edition, "the record should resolve an edition").toBeTruthy();
    // Captured before the next await, so a failure below still lets
    // afterEach find it. Safe to always delete: the precondition check above
    // guarantees no edition existed for this (event, year) before this
    // test's own POST just above, so whatever it resolved to was created by
    // this request, never merely found.
    createdEditionId = String(record.edition);
    recordCreated({
      collection: "race-editions",
      id: createdEditionId,
      note: `M-CLAIM-EDITION ${event.key} ${year}`,
    });

    const editionRes = await request.get(`/api/race-editions/${record.edition}?depth=0`);
    expect(editionRes.ok()).toBeTruthy();
    const edition = (await editionRes.json()) as Record<string, unknown>;

    expect(edition.event).toBe(event.id);
    expect(edition.year).toBe(year);
    // Everything else stays exactly what the schema defaults to — none of
    // it came from this request. `registrationType` has a schema default
    // (`first-come`), so it is asserted present rather than empty like the
    // rest.
    for (const field of [
      "startDate",
      "endDate",
      "nameOverride",
      "location",
      "url",
      "registrationOpensAt",
      "registrationClosesAt",
      "registrationUrl",
      "registrationStatusOverride",
      "sourceUrl",
      "verifiedAt",
      "notes",
    ]) {
      expect(edition[field], `edition.${field} should be empty`).toBeFalsy();
    }
    expect(edition.registrationType).toBe("first-come");
  });
});
