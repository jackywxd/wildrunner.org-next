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
  // test did not create. That is not a hypothetical tidy-up: this assertion
  // read 2 where it expected 1 on one CI run and has not done so since, and
  // an under-specified selector is the only part of it that could be true of
  // more rows than the test made.
  //
  // Which is not a claim to have found that cause. It did not reproduce, and
  // there is no mechanism, so it is not closed — see docs/testing-plan.md.
  // This narrows what the assertion can be answered by, so a recurrence says
  // something specific instead of something ambiguous.
  return page
    .locator(
      `[data-event-id="${eventId}"][data-distance-id="${distanceId}"][data-year="${year}"]`,
    )
    .count();
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

  test.afterEach(async ({ request }) => {
    if (!createdRecordId) return;
    const id = createdRecordId;
    createdRecordId = null;

    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    if (!login.ok()) {
      throw new Error(`teardown could not sign in: ${login.status()}`);
    }

    const deleted = await request.delete(`/api/race-records/${id}`);
    // 404 is fine — the test's own step 6 got there first. Anything else
    // means a row is still sitting in the database, and saying so here is
    // cheaper than the next run failing for a reason it cannot explain.
    if (!deleted.ok() && deleted.status() !== 404) {
      throw new Error(
        `teardown failed to delete race record ${id}: ${deleted.status()} ${await deleted.text()}`,
      );
    }
  });

  test("M-RACES: records a race, it reaches the public directory, removes it", async ({
    page,
  }) => {
    // 1. Sign in through the form. This is the only journey that does — the
    //    others would only be re-testing it — and it is here rather than in a
    //    login-only spec because a session that cannot reach a page that
    //    queries the database is not a session. `/members/races` queries.
    await page.goto("/members/login", { waitUntil: "domcontentloaded" });
    await page.getByTestId("member-login-email").fill(TEST_ADMIN.email);
    await page.getByTestId("member-login-password").fill(TEST_ADMIN.password);
    await page.getByTestId("member-login-submit").click();
    await expect(page).toHaveURL(/\/members(\/|$)/, { timeout: 15_000 });

    // 2. Arrive by clicking. The calendar-toggle bug lived entirely in soft
    //    navigation; anything reachable by a link needs one test that uses it.
    await page.getByRole("link", { name: /賽事|比賽/ }).first().click();
    await expect(page).toHaveURL(/\/members\/races/, { timeout: 15_000 });

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
      { timeout: 15_000 },
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
    ).toHaveCount(0, { timeout: 15_000 });

    expect(await badgeCount(page, eventId, distanceId, year)).toBe(before);
  });
});
