import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { expectOkJson } from "../helpers/api";
import { adminContext } from "../helpers/members";

/**
 * S — the public race schedule.
 *
 * The two things most likely to be wrong, and therefore what this file is
 * really for:
 *
 *   1. THE WINDOW. A race in the past or more than a year out must not
 *      appear. Off-by-one at either boundary is invisible until somebody
 *      notices last year's race on the page.
 *   2. THE CALENDAR CELL. A date stored as UTC midnight must land in the
 *      cell whose data-date equals its startDate. If any component ever
 *      parses the stored value into a `Date`, this is the test that fails —
 *      and it fails on a runner in a negative-offset timezone while passing
 *      in UTC, which is exactly why the assertion is explicit rather than
 *      left to a visual check.
 *
 * Rows are created through the API and deleted afterwards, and every name is
 * unique per run, so a populated staging database does not affect the
 * assertions — they all target rows this spec made.
 */

type Entry = { id: number; name: string };

const stamp = Date.now();
const name = (label: string) => `E2E schedule ${label} ${stamp}`;

/** Days from today as a UTC calendar date, which is what the page keys on. */
function shiftDate(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

const SOON = shiftDate(30);
const PAST = shiftDate(-30);
const FAR = shiftDate(400);

test.describe("S public race schedule", () => {
  let admin: APIRequestContext;
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

    await create({
      distanceSummary: "100M",
      name: name("soon"),
      series: "others",
      startDate: `${SOON}T00:00:00.000Z`,
    });
    await create({
      name: name("past"),
      series: "others",
      startDate: `${PAST}T00:00:00.000Z`,
    });
    await create({
      name: name("far"),
      series: "others",
      startDate: `${FAR}T00:00:00.000Z`,
    });

    // Three registration states, so the derived status can be asserted
    // without waiting for a clock to move.
    await create({
      name: name("open"),
      registrationClosesAt: `${shiftDate(10)}T00:00:00.000Z`,
      registrationOpensAt: `${shiftDate(-10)}T00:00:00.000Z`,
      registrationUrl: "https://example.com/enter",
      series: "utmb",
      startDate: `${shiftDate(60)}T00:00:00.000Z`,
    });
    await create({
      name: name("upcoming"),
      registrationOpensAt: `${shiftDate(20)}T00:00:00.000Z`,
      registrationUrl: "https://example.com/enter",
      series: "wtm",
      startDate: `${shiftDate(90)}T00:00:00.000Z`,
    });
    await create({
      name: name("closed"),
      registrationClosesAt: `${shiftDate(-5)}T00:00:00.000Z`,
      registrationOpensAt: `${shiftDate(-40)}T00:00:00.000Z`,
      registrationUrl: "https://example.com/enter",
      series: "others",
      startDate: `${shiftDate(120)}T00:00:00.000Z`,
    });
  });

  test.afterAll(async () => {
    for (const id of created) await admin?.delete(`/api/race-schedule/${id}`);
    await admin?.dispose();
  });

  test("S-T1: the page renders and shows only the next twelve months", async ({
    page,
  }) => {
    await page.goto("/races");
    await expect(page.getByTestId("race-schedule")).toBeVisible();

    await expect(page.getByText(name("soon"))).toBeVisible();
    await expect(page.getByText(name("past"))).toHaveCount(0);
    await expect(page.getByText(name("far"))).toHaveCount(0);
  });

  test("S-T2: the list view groups by month and carries the date", async ({
    page,
  }) => {
    await page.goto("/races");
    const row = page.locator(
      `[data-testid="race-list-item"]:has-text("${name("soon")}")`,
    );
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute("data-start-date", SOON);
    await expect(page.locator(`[data-month="${SOON.slice(0, 7)}"]`)).toBeVisible();
  });

  test("S-T3: the calendar view puts a race in its own day cell", async ({
    page,
  }) => {
    await page.goto("/races?view=calendar");
    await expect(page.getByTestId("race-calendar")).toBeVisible();
    await expect(page.getByTestId("race-calendar-month")).toHaveCount(12);

    // The timezone regression: the cell is selected by date string, and the
    // race must be inside it.
    const cell = page.locator(`[data-date="${SOON}"]`).first();
    await expect(cell).toHaveAttribute("data-race-count", /[1-9]/);
    await expect(cell.getByText(name("soon"))).toBeVisible();
  });

  test("S-T4: registration state is derived from the dates", async ({ page }) => {
    await page.goto("/races");

    const states: [string, string][] = [
      ["open", "open"],
      ["upcoming", "upcoming"],
      ["closed", "closed"],
    ];

    for (const [label, expected] of states) {
      const row = page.locator(
        `[data-testid="race-list-item"]:has-text("${name(label)}")`,
      );
      await expect(row.getByTestId("race-registration")).toHaveAttribute(
        "data-registration-state",
        expected,
      );
    }

    // A closed entry must not offer a link to a form nobody can use.
    const closedRow = page.locator(
      `[data-testid="race-list-item"]:has-text("${name("closed")}")`,
    );
    await expect(closedRow.getByTestId("race-registration-link")).toHaveCount(0);

    const openRow = page.locator(
      `[data-testid="race-list-item"]:has-text("${name("open")}")`,
    );
    await expect(openRow.getByTestId("race-registration-link")).toBeVisible();
  });

  test("S-T5: the registration filter keeps only what is open", async ({ page }) => {
    await page.goto("/races?registration=open");
    await expect(page.getByText(name("open"))).toBeVisible();
    await expect(page.getByText(name("upcoming"))).toHaveCount(0);
    await expect(page.getByText(name("closed"))).toHaveCount(0);
  });

  test("S-T6: the series filter narrows to one series", async ({ page }) => {
    await page.goto("/races?series=wtm");
    await expect(page.getByText(name("upcoming"))).toBeVisible();
    await expect(page.getByText(name("open"))).toHaveCount(0);
  });

  test("S-T7: an unrecognised filter falls back rather than erroring", async ({
    page,
  }) => {
    const response = await page.goto("/races?view=nonsense&series=nonsense");
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("race-list")).toBeVisible();
  });

  test("S-T8: the homepage links to the schedule", async ({ page }) => {
    await page.goto("/");
    const link = page.getByTestId("home-races-link");
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/races");
  });

  test("S-T9: no account data reaches the page", async ({ page }) => {
    // Same shape as R-T6, and asserted on fields that exist ONLY on
    // `users`: if one of these shows up, the page is populating a
    // relationship it should not be.
    //
    // Deliberately not asserting on "BasePayload" or on `"email"`. The
    // first is the name Next's dev-mode server-IO instrumentation gives a
    // Payload call in the RSC stream — it appears on every page in dev via
    // `getSiteGlobals` in the shared header, and matching it flags the
    // framework rather than a leak. The second is far too common a word to
    // mean anything.
    const response = await page.goto("/races");
    const html = (await response?.text()) ?? "";
    expect(html).not.toContain("invitePending");
    expect(html).not.toContain("storageQuotaMb");
    expect(html).not.toContain('"sessions"');
  });
});
