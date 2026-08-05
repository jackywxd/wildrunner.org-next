import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "../helpers/test";

import {
  TEST_MEMBER,
  adminContext,
  ensureMemberUser,
  loginContext,
} from "../helpers/members";
import { RACE_EVENTS, findRaceEvent } from "@/lib/races/catalogue";

/**
 * Phase C — the member's race-record screen.
 *
 * Also the browser-side half of the badge contract: the Phase A specs cannot
 * render the component (Playwright's JSX pragma, see badge-contract.spec.ts),
 * so this is where the assembled SVG is actually asserted to exist and to
 * carry the right event, distance and year.
 */

// Mont-Blanc's named races make the distance-filtering assertion meaningful:
// its line-up shares nothing with the standard 20K/50K/100K/100M.
const MONT_BLANC = findRaceEvent("utmb-mont-blanc")!;
const STANDARD = RACE_EVENTS.find(
  (event) => event.series === "utmb" && event.distances.some((d) => d.id === "100k"),
)!;

async function signIn(page: import("@playwright/test").Page) {
  const login = await page.context().request.post("/api/users/login", {
    data: TEST_MEMBER,
  });
  expect(login.ok()).toBeTruthy();
}

test.describe("C member race records", () => {
  let admin: APIRequestContext;
  let member: APIRequestContext;

  test.beforeAll(async ({ baseURL }) => {
    admin = await adminContext(baseURL);
    await ensureMemberUser(admin, TEST_MEMBER);
    member = await loginContext(baseURL, TEST_MEMBER);
  });

  test.beforeEach(async () => {
    // Each test starts from a known-empty list. The suite shares one
    // database, and a leftover row would make "the row I just added" and
    // "the only row" different things.
    const existing = await member.get("/api/race-records?limit=200&depth=0");
    if (existing.ok()) {
      const body = (await existing.json()) as { docs: { id: number }[] };
      for (const doc of body.docs) await member.delete(`/api/race-records/${doc.id}`);
    }
  });

  test.afterAll(async () => {
    const existing = await member.get("/api/race-records?limit=200&depth=0");
    if (existing.ok()) {
      const body = (await existing.json()) as { docs: { id: number }[] };
      for (const doc of body.docs) await member.delete(`/api/race-records/${doc.id}`);
    }
    await Promise.all([admin?.dispose(), member?.dispose()]);
  });

  test("C-T5: anonymous is sent to the login form", async ({ page }) => {
    await page.goto("/members/races");
    await page.waitForURL("**/members/login", { timeout: 30_000 });
    await expect(page.getByTestId("race-record-list")).toHaveCount(0);
  });

  test("C-T4: the distance list follows the chosen event", async ({ page }) => {
    await signIn(page);
    await page.goto("/members/races");

    const distances = page.getByTestId("race-distance-select").locator("option");

    await page.getByTestId("race-event-select").selectOption(MONT_BLANC.id);
    const named = await distances.evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value).filter(Boolean),
    );
    expect(named.sort()).toEqual(MONT_BLANC.distances.map((d) => d.id).sort());

    // Switching events must replace the list, not append to it.
    await page.getByTestId("race-event-select").selectOption(STANDARD.id);
    const standard = await distances.evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value).filter(Boolean),
    );
    expect(standard.sort()).toEqual(STANDARD.distances.map((d) => d.id).sort());
    expect(standard).not.toContain("ccc");
  });

  test("C-T1/C-T2: adding a record shows a badge, and it survives a reload", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/members/races");
    await expect(page.getByTestId("race-record-empty")).toBeVisible();

    await page.getByTestId("race-event-select").selectOption(MONT_BLANC.id);
    await page.getByTestId("race-distance-select").selectOption("ccc");
    await page.getByTestId("race-year-select").selectOption("2024");
    await page.getByTestId("race-record-add").click();

    const row = page.getByTestId("race-record-row");
    await expect(row).toHaveCount(1);

    // The badge contract, asserted where it actually renders.
    const badge = row.getByTestId("race-badge");
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute("data-event-id", MONT_BLANC.id);
    await expect(badge).toHaveAttribute("data-distance-id", "ccc");
    await expect(badge).toHaveAttribute("data-year", "2024");

    await page.reload();
    await expect(page.getByTestId("race-record-row")).toHaveCount(1);
    await expect(page.getByTestId("race-badge")).toHaveAttribute(
      "data-distance-id",
      "ccc",
    );
  });

  test("C-T3: a record can be removed", async ({ page }) => {
    await signIn(page);
    await page.goto("/members/races");

    await page.getByTestId("race-event-select").selectOption(MONT_BLANC.id);
    await page.getByTestId("race-distance-select").selectOption("occ");
    await page.getByTestId("race-year-select").selectOption("2023");
    await page.getByTestId("race-record-add").click();
    await expect(page.getByTestId("race-record-row")).toHaveCount(1);

    await page.getByTestId("race-record-delete").click();
    await expect(page.getByTestId("race-record-row")).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId("race-record-empty")).toBeVisible();
  });

  test("C-T6: a duplicate is reported in the form, not swallowed", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/members/races");

    await page.getByTestId("race-event-select").selectOption(MONT_BLANC.id);
    await page.getByTestId("race-distance-select").selectOption("tds");
    await page.getByTestId("race-year-select").selectOption("2022");
    await page.getByTestId("race-record-add").click();

    // Wait for the first add to land before submitting the second. `click()`
    // resolves when the click is dispatched, not when the request it starts
    // has finished — pressing on immediately raced the response.
    await expect(page.getByTestId("race-record-row")).toHaveCount(1);

    // Same selection, still in the form, submitted again.
    await page.getByTestId("race-record-add").click();

    // The second attempt has to say something. Silence would read as
    // success and the member would try again.
    await expect(page.getByTestId("race-record-error")).toBeVisible();
    await expect(page.getByTestId("race-record-row")).toHaveCount(1);
  });
});
