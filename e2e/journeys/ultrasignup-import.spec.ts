/**
 * A member pulling their own finishes off UltraSignup.
 *
 * THE ORDINARY PATH IS M-ULTRA-5: one person, one finish, the catalogue
 * already has that race, and importing it adds a record. The other four are
 * the ways that path goes wrong, and a suite of only those would stay green
 * if the plain import stopped working.
 *
 * A one-word name must be refused before anything is fetched. Two
 * people who share a name must stay two lists, because the member switches
 * between them. A finish UltraSignup printed twice must not import until they
 * pick which row to keep. A race they already logged is marked, and a new
 * finish — including a DNF — lands in the same list as one they typed in.
 *
 * The results POST is fulfilled here rather than fetched from UltraSignup.
 * That site is not ours, its titles do not match the catalogue until an
 * admin writes an alias, and a journey that depended on either would go red
 * for a reason this file does not name. What is real is the rest of the
 * path: the name is saved through the users API, the import is a real
 * `POST /api/race-records`, and the row that appears is the one the member
 * already manages by hand. The parsing and the matching are U-ULTRA; the
 * endpoint's own refusals are M-ULTRA-API.
 */
import { expect, test } from "../helpers/test";
import { waitForHydration } from "../helpers/hydration";
import { TEST_ADMIN } from "../helpers/auth";
import { recordCreated } from "../helpers/created";
import { budget } from "../helpers/budget";
import { deleteCreatedRows } from "../helpers/teardown";

type Ready = {
  distanceId: string;
  distanceLabel: string;
  eventId: string;
  eventName: string;
};

function resultRow(
  key: string,
  year: number,
  status: "finished" | "dnf" | "other",
  race: Ready,
  groupId: string | null,
  rawName: string,
) {
  const ready = status !== "other";
  return {
    date: `${year}-08-01`,
    distanceText: race.distanceLabel,
    eventName: race.eventName,
    existing: null,
    finishSeconds: status === "finished" ? 36_000 : null,
    groupId,
    key,
    match: ready
      ? {
          distanceId: race.distanceId,
          distanceLabel: race.distanceLabel,
          eventId: race.eventId,
          eventName: race.eventName,
          kind: "ready" as const,
        }
      : { kind: "unsupported" as const, reason: "status" as const },
    place: 10,
    rawName,
    status,
    timeText: status === "finished" ? "10:00:00" : null,
    year,
  };
}

test.describe("M-ULTRA a member imports UltraSignup results", () => {
  const created: { collection: string; id: number | string }[] = [];

  test.afterEach(async ({ page, request }) => {
    await deleteCreatedRows(request, created.splice(0));
    // The name is stored on the account. Leaving "Xu Dong Wu" there is not
    // the member's data, and the next run would be asserting against it.
    const me = await page.request.get("/api/users/me");
    if (!me.ok()) return;
    const body = (await me.json()) as { user?: { id?: number } };
    if (!body.user?.id) return;
    await page.request.patch(`/api/users/${body.user.id}`, {
      data: { ultrasignupName: "" },
    });
  });

  async function signIn(page: import("@playwright/test").Page) {
    await page.goto("/members/login", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    await page.getByTestId("member-login-email").fill(TEST_ADMIN.email);
    await page.getByTestId("member-login-password").fill(TEST_ADMIN.password);
    await page.getByTestId("member-login-submit").click();
    await expect(page).toHaveURL(/\/members$/, { timeout: budget(15_000) });
    await page.getByRole("link", { name: /賽事|比賽/ }).first().click();
    await expect(page).toHaveURL(/\/members\/races/, { timeout: budget(15_000) });
    await page.waitForLoadState("load");
    await waitForHydration(page);
  }

  async function cataloguePick(page: import("@playwright/test").Page): Promise<Ready> {
    const eventSelect = page.getByTestId("race-event-select");
    const eventId = await eventSelect
      .locator("option:not([value=''])")
      .first()
      .getAttribute("value");
    const eventName =
      (await eventSelect.locator("option:not([value=''])").first().textContent())?.trim() ?? "";
    if (!eventId) throw new Error("no race event to choose");
    await eventSelect.selectOption(eventId);
    const distanceSelect = page.getByTestId("race-distance-select");
    const distanceOption = distanceSelect.locator("option:not([value=''])").first();
    const distanceId = await distanceOption.getAttribute("value");
    const distanceLabel = (await distanceOption.textContent())?.trim() ?? "";
    if (!distanceId) throw new Error("no distance for the chosen event");
    return { distanceId, distanceLabel, eventId, eventName };
  }

  async function freeYears(page: import("@playwright/test").Page, count: number) {
    const years = await page.getByTestId("race-year-select").locator("option").allTextContents();
    const used = await page.getByTestId("race-record-row").allInnerTexts();
    const free = years.filter((year) => /^\d{4}$/.test(year) && !used.some((row) => row.includes(year)));
    if (free.length < count) throw new Error(`need ${count} free years, found ${free.length}`);
    return free.slice(0, count);
  }

  test("M-ULTRA-5: one person, one matching finish, imports straight through", async ({
    page,
  }) => {
    test.setTimeout(budget(60_000));
    await signIn(page);
    const race = await cataloguePick(page);
    const [year] = await freeYears(page, 1);

    await page.route("**/api/members/ultrasignup-results", (route) =>
      route.fulfill({
        contentType: "application/json",
        json: {
          people: [
            {
              age: 55,
              firstName: "Xu Dong",
              id: 2304249,
              lastName: "Wu",
              rows: [
                resultRow("plain", Number(year), "finished", race, null, "A plain finish"),
              ],
            },
          ],
        },
      }),
    );

    await page.getByTestId("ultrasignup-name").fill("Xu Dong Wu");
    await page.getByTestId("ultrasignup-load").click();
    await expect(page.getByText("A plain finish")).toBeVisible({ timeout: budget(15_000) });
    await expect(page.getByTestId("ultrasignup-person-2304249")).toHaveCount(0);
    await expect(page.getByText("疑似同一場")).toHaveCount(0);
    await expect(page.getByTestId("ultrasignup-existing-plain")).toHaveCount(0);
    await expect(page.getByTestId("ultrasignup-error")).toHaveCount(0);

    await page.getByTestId("ultrasignup-import-plain").click();
    const row = page.getByTestId("race-record-row").filter({ hasText: year });
    await expect(row).toHaveCount(1, { timeout: budget(15_000) });
    const id = await row.first().getAttribute("data-record-id");
    if (id) {
      created.push({ collection: "race-records", id });
      recordCreated({ collection: "race-records", id, note: "M-ULTRA-5" });
    }
  });

  test("M-ULTRA-1: a single word is refused and nothing is fetched", async ({ page }) => {
    test.setTimeout(budget(60_000));
    await signIn(page);

    let fetched = false;
    await page.route("**/api/members/ultrasignup-results", async (route) => {
      fetched = true;
      await route.fulfill({ status: 500, body: "{}" });
    });

    await page.getByTestId("ultrasignup-name").fill("Wu");
    const saved = page.waitForResponse(
      (response) =>
        response.url().includes("/api/users/") && response.request().method() === "PATCH",
    );
    await page.getByTestId("ultrasignup-load").click();
    expect((await saved).status()).toBe(400);
    await expect(page.getByTestId("ultrasignup-error")).toContainText("姓放在最後");
    expect(fetched).toBe(false);
  });

  test("M-ULTRA-2: the member switches between the two people one name maps to", async ({
    page,
  }) => {
    test.setTimeout(budget(60_000));
    await signIn(page);
    const race = await cataloguePick(page);
    const [year] = await freeYears(page, 1);

    await page.route("**/api/members/ultrasignup-results", (route) =>
      route.fulfill({
        contentType: "application/json",
        json: {
          people: [
            {
              age: 55,
              firstName: "Xu Dong",
              id: 2304249,
              lastName: "Wu",
              rows: [
                resultRow("only-first", Number(year), "finished", race, null, "Only the first person"),
              ],
            },
            {
              age: null,
              firstName: "Xu",
              id: 2678040,
              lastName: "Dong Wu",
              rows: [
                resultRow("only-second", Number(year), "finished", race, null, "Only the second person"),
              ],
            },
          ],
        },
      }),
    );

    await page.getByTestId("ultrasignup-name").fill("Xu Dong Wu");
    await page.getByTestId("ultrasignup-load").click();
    await expect(page.getByText("Only the first person")).toBeVisible({
      timeout: budget(15_000),
    });
    await expect(page.getByText("Only the second person")).toHaveCount(0);

    await page.getByTestId("ultrasignup-person-2678040").click();
    await expect(page.getByText("Only the second person")).toBeVisible();
    await expect(page.getByText("Only the first person")).toHaveCount(0);

    await page.getByTestId("ultrasignup-person-2304249").click();
    await expect(page.getByText("Only the first person")).toBeVisible();
    await expect(page.getByText("Only the second person")).toHaveCount(0);
  });

  // Both rows resolve to a catalogue race, as TDS and "Sur les Traces" do
  // once both have an alias. Different years, so the server's uniqueness
  // check cannot be what stops the second import — only the group can.
  test("M-ULTRA-3: a repeated finish imports once, and the other row stays locked after", async ({
    page,
  }) => {
    test.setTimeout(budget(60_000));
    await signIn(page);
    const race = await cataloguePick(page);
    const [keepYear, dropYear] = await freeYears(page, 2);

    await page.route("**/api/members/ultrasignup-results", (route) =>
      route.fulfill({
        contentType: "application/json",
        json: {
          people: [
            {
              age: 55,
              firstName: "Xu Dong",
              id: 2304249,
              lastName: "Wu",
              rows: [
                resultRow("dup-keep", Number(keepYear), "finished", race, "finish:1", "The finish to keep"),
                resultRow("dup-drop", Number(dropYear), "finished", race, "finish:1", "The duplicate to drop"),
              ],
            },
          ],
        },
      }),
    );

    await page.getByTestId("ultrasignup-name").fill("Xu Dong Wu");
    await page.getByTestId("ultrasignup-load").click();
    const group = page.getByTestId("ultrasignup-group");
    await expect(group).toHaveCount(1, { timeout: budget(15_000) });
    await expect(group).toContainText("只能匯入一筆");
    await expect(group.getByRole("radio")).toHaveCount(2);
    await expect(page.getByTestId("ultrasignup-import-dup-keep")).toHaveCount(0);
    await expect(page.getByTestId("ultrasignup-import-dup-drop")).toHaveCount(0);

    await group.getByRole("radio").nth(0).check();
    await expect(page.getByTestId("ultrasignup-import-dup-drop")).toHaveCount(0);
    await page.getByTestId("ultrasignup-import-dup-keep").click();
    const row = page.getByTestId("race-record-row").filter({ hasText: keepYear });
    await expect(row).toHaveCount(1, { timeout: budget(15_000) });
    const id = await row.first().getAttribute("data-record-id");
    if (id) {
      created.push({ collection: "race-records", id });
      recordCreated({ collection: "race-records", id, note: "M-ULTRA-3" });
    }

    await expect(group).toHaveAttribute("data-locked", "true");
    await expect(group).toContainText("已匯入");
    await expect(page.getByTestId("ultrasignup-locked-dup-drop")).toBeVisible();
    await expect(group.getByRole("radio")).toHaveCount(0);
    await expect(page.getByTestId("ultrasignup-import-dup-drop")).toHaveCount(0);
    await expect(page.getByTestId("race-record-row").filter({ hasText: dropYear })).toHaveCount(0);
  });

  test("M-ULTRA-6: a repeated finish with one placeable row imports without a choice", async ({
    page,
  }) => {
    test.setTimeout(budget(60_000));
    await signIn(page);
    const race = await cataloguePick(page);
    const [year] = await freeYears(page, 1);

    await page.route("**/api/members/ultrasignup-results", (route) =>
      route.fulfill({
        contentType: "application/json",
        json: {
          people: [
            {
              age: 55,
              firstName: "Xu Dong",
              id: 2304249,
              lastName: "Wu",
              rows: [
                resultRow("placed", Number(year), "finished", race, "finish:2", "The title the catalogue knows"),
                {
                  ...resultRow("unplaced", Number(year), "finished", race, "finish:2", "A title it does not"),
                  match: { kind: "unsupported", reason: "event" },
                },
              ],
            },
          ],
        },
      }),
    );

    await page.getByTestId("ultrasignup-name").fill("Xu Dong Wu");
    await page.getByTestId("ultrasignup-load").click();
    const group = page.getByTestId("ultrasignup-group");
    await expect(group).toHaveCount(1, { timeout: budget(15_000) });
    await expect(group.getByRole("radio")).toHaveCount(0);
    await expect(page.getByTestId("ultrasignup-import-unplaced")).toHaveCount(0);

    await page.getByTestId("ultrasignup-import-placed").click();
    const row = page.getByTestId("race-record-row").filter({ hasText: year });
    await expect(row).toHaveCount(1, { timeout: budget(15_000) });
    const id = await row.first().getAttribute("data-record-id");
    if (id) {
      created.push({ collection: "race-records", id });
      recordCreated({ collection: "race-records", id, note: "M-ULTRA-6" });
    }
    await expect(group).toHaveAttribute("data-locked", "true");
  });

  // UltraSignup being down entirely is a 502 from our endpoint, and the
  // console guard in helpers/test.ts fails any 5xx by design — so that branch
  // is not driven here. Its substance, an unrecognised answer counting as a
  // failure rather than as "no results", is U-ULTRA-20.
  test("M-ULTRA-7: a split that did not answer is said, and re-reading clears it", async ({
    page,
  }) => {
    test.setTimeout(budget(60_000));
    await signIn(page);
    const race = await cataloguePick(page);
    const [year] = await freeYears(page, 1);

    const answers = [
      {
        json: {
          failedSplits: [{ fname: "Xu", lname: "Dong Wu" }],
          people: [
            {
              age: 55,
              firstName: "Xu Dong",
              id: 2304249,
              lastName: "Wu",
              rows: [resultRow("half", Number(year), "finished", race, null, "From the split that answered")],
            },
          ],
        },
        status: 200,
      },
      { json: { failedSplits: [], people: [] }, status: 200 },
    ];
    let calls = 0;
    await page.route("**/api/members/ultrasignup-results", (route) => {
      const answer = answers[Math.min(calls, answers.length - 1)];
      calls += 1;
      return route.fulfill({ contentType: "application/json", ...answer });
    });

    await page.getByTestId("ultrasignup-name").fill("Xu Dong Wu");
    await page.getByTestId("ultrasignup-load").click();
    await expect(page.getByText("From the split that answered")).toBeVisible({
      timeout: budget(15_000),
    });
    const partial = page.getByTestId("ultrasignup-partial");
    await expect(partial).toContainText("名 Xu、姓 Dong Wu");

    await partial.getByRole("button", { name: "重新讀取" }).click();
    await expect(page.getByText("這個姓名在 UltraSignup 沒有成績")).toBeVisible({
      timeout: budget(15_000),
    });
    await expect(partial).toHaveCount(0);
    expect(calls).toBe(2);
  });

  test("M-ULTRA-4: an existing record is marked, a new finish is added, a DNF stays a DNF", async ({
    page,
  }) => {
    test.setTimeout(budget(90_000));
    await signIn(page);
    const race = await cataloguePick(page);
    const [loggedYear, freshYear, dnfYear] = await freeYears(page, 3);

    await page.getByTestId("race-event-select").selectOption(race.eventId);
    await page.getByTestId("race-distance-select").selectOption(race.distanceId);
    await page.getByTestId("race-year-select").selectOption(loggedYear);
    await page.getByTestId("race-record-add").click();
    const logged = page.getByTestId("race-record-row").filter({ hasText: loggedYear });
    await expect(logged).toHaveCount(1, { timeout: budget(15_000) });
    const loggedId = await logged.first().getAttribute("data-record-id");
    if (loggedId) {
      created.push({ collection: "race-records", id: loggedId });
      recordCreated({ collection: "race-records", id: loggedId, note: "M-ULTRA-4 existing" });
    }

    await page.route("**/api/members/ultrasignup-results", (route) =>
      route.fulfill({
        contentType: "application/json",
        json: {
          people: [
            {
              age: 55,
              firstName: "Xu Dong",
              id: 2304249,
              lastName: "Wu",
              rows: [
                resultRow("already", Number(loggedYear), "finished", race, null, "Already logged"),
                resultRow("fresh", Number(freshYear), "finished", race, null, "A new finish"),
                resultRow("dnf", Number(dnfYear), "dnf", race, null, "A did not finish"),
              ],
            },
          ],
        },
      }),
    );

    await page.getByTestId("ultrasignup-name").fill("Xu Dong Wu");
    await page.getByTestId("ultrasignup-load").click();
    await expect(page.getByTestId("ultrasignup-existing-already")).toBeVisible({
      timeout: budget(15_000),
    });
    await expect(page.getByTestId("ultrasignup-import-already")).toHaveCount(0);

    await page.getByTestId("ultrasignup-import-fresh").click();
    const fresh = page.getByTestId("race-record-row").filter({ hasText: freshYear });
    await expect(fresh).toHaveCount(1, { timeout: budget(15_000) });
    const freshId = await fresh.first().getAttribute("data-record-id");
    if (freshId) {
      created.push({ collection: "race-records", id: freshId });
      recordCreated({ collection: "race-records", id: freshId, note: "M-ULTRA-4 finish" });
    }
    await expect(page.getByTestId("ultrasignup-existing-fresh")).toBeVisible();

    await page.getByTestId("ultrasignup-import-dnf").click();
    const dnf = page.getByTestId("race-record-row").filter({ hasText: dnfYear });
    await expect(dnf).toHaveCount(1, { timeout: budget(15_000) });
    await expect(dnf.getByTestId("race-record-dnf")).toBeVisible();
    const dnfId = await dnf.first().getAttribute("data-record-id");
    if (dnfId) {
      created.push({ collection: "race-records", id: dnfId });
      recordCreated({ collection: "race-records", id: dnfId, note: "M-ULTRA-4 dnf" });
    }
  });

  // The import endpoint is fulfilled too: for real it re-reads UltraSignup,
  // which is the network this file stays off. What this pins is the half the
  // browser owns — the row says it will add a distance, and the request
  // names the row and nothing about the distance, because what lands in
  // `race-categories` must come from UltraSignup and not from the client.
  test("M-ULTRA-8: a distance the catalogue does not list imports through the server", async ({
    page,
  }) => {
    test.setTimeout(budget(60_000));
    await signIn(page);
    const race = await cataloguePick(page);
    const [year] = await freeYears(page, 1);

    await page.route("**/api/members/ultrasignup-results", (route) =>
      route.fulfill({
        contentType: "application/json",
        json: {
          people: [
            {
              age: 55,
              firstName: "Xu Dong",
              id: 2304249,
              lastName: "Wu",
              rows: [
                {
                  ...resultRow("new", Number(year), "finished", race, null, "A distance it never listed"),
                  distanceText: "110K",
                  match: {
                    distanceLabel: "110K",
                    eventId: race.eventId,
                    eventName: race.eventName,
                    kind: "new-distance",
                  },
                },
              ],
            },
          ],
        },
      }),
    );
    let sent: unknown = null;
    await page.route("**/api/members/ultrasignup-import", async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({
        contentType: "application/json",
        json: {
          doc: {
            distanceId: "110k",
            eventId: race.eventId,
            finishSeconds: 36_000,
            id: 987_654_321,
            result: "finished",
            year: Number(year),
          },
        },
        status: 201,
      });
    });

    await page.getByTestId("ultrasignup-name").fill("Xu Dong Wu");
    await page.getByTestId("ultrasignup-load").click();
    await expect(page.getByTestId("ultrasignup-new-distance-new")).toBeVisible({
      timeout: budget(15_000),
    });
    await page.getByTestId("ultrasignup-import-new").click();
    await expect(page.getByTestId("ultrasignup-existing-new")).toBeVisible({
      timeout: budget(15_000),
    });
    expect(sent).toEqual({
      date: `${year}-08-01`,
      personId: 2304249,
      rawName: "A distance it never listed",
    });
    await expect(page.getByTestId("ultrasignup-import-new")).toHaveCount(0);
    await expect(page.getByTestId("ultrasignup-new-distance-new")).toHaveCount(0);
  });

  test("M-ULTRA-9: a record that disagrees with UltraSignup is updated to match it", async ({
    page,
  }) => {
    test.setTimeout(budget(90_000));
    await signIn(page);
    const race = await cataloguePick(page);
    const [noTimeYear, dnfYear] = await freeYears(page, 2);

    for (const [year, result] of [
      [noTimeYear, "finished"],
      [dnfYear, "dnf"],
    ] as const) {
      const response = await page.request.post("/api/race-records", {
        data: { distanceId: race.distanceId, eventId: race.eventId, result, year: Number(year) },
      });
      expect(response.ok(), await response.text()).toBeTruthy();
      const { doc } = (await response.json()) as { doc: { id: number } };
      created.push({ collection: "race-records", id: doc.id });
      recordCreated({ collection: "race-records", id: doc.id, note: `M-ULTRA-9 ${result}` });
    }
    await page.reload({ waitUntil: "load" });
    await waitForHydration(page);

    await page.route("**/api/members/ultrasignup-results", (route) =>
      route.fulfill({
        contentType: "application/json",
        json: {
          people: [
            {
              age: 55,
              firstName: "Xu Dong",
              id: 2304249,
              lastName: "Wu",
              rows: [
                resultRow("no-time", Number(noTimeYear), "finished", race, null, "Logged without a time"),
                resultRow("was-dnf", Number(dnfYear), "finished", race, null, "Logged as a DNF"),
              ],
            },
          ],
        },
      }),
    );

    await page.getByTestId("ultrasignup-name").fill("Xu Dong Wu");
    await page.getByTestId("ultrasignup-load").click();
    await expect(page.getByTestId("ultrasignup-existing-no-time")).toContainText("沒有完賽時間", {
      timeout: budget(15_000),
    });
    await expect(page.getByTestId("ultrasignup-existing-was-dnf")).toContainText("和 UltraSignup 不同");

    const noTime = page.getByTestId("race-record-row").filter({ hasText: noTimeYear });
    await expect(noTime.getByTestId("race-record-time")).toHaveCount(0);
    await page.getByTestId("ultrasignup-update-no-time").click();
    await expect(noTime.getByTestId("race-record-time")).toContainText("10:00:00", {
      timeout: budget(15_000),
    });
    await expect(page.getByTestId("ultrasignup-update-no-time")).toHaveCount(0);

    const wasDnf = page.getByTestId("race-record-row").filter({ hasText: dnfYear });
    await expect(wasDnf.getByTestId("race-record-dnf")).toBeVisible();
    await page.getByTestId("ultrasignup-update-was-dnf").click();
    await expect(wasDnf.getByTestId("race-record-dnf")).toHaveCount(0, { timeout: budget(15_000) });
    await expect(wasDnf.getByTestId("race-record-time")).toContainText("10:00:00");
    await expect(page.getByTestId("ultrasignup-update-was-dnf")).toHaveCount(0);

    // What the list shows is what was saved: reload and read it back.
    await page.reload({ waitUntil: "load" });
    await waitForHydration(page);
    await expect(
      page.getByTestId("race-record-row").filter({ hasText: dnfYear }).getByTestId("race-record-time"),
    ).toContainText("10:00:00");
  });

  test("M-ULTRA-10: a historical distance is not offered, but a record on it still edits", async ({
    page,
  }) => {
    test.setTimeout(budget(90_000));
    await signIn(page);
    const race = await cataloguePick(page);
    const [year] = await freeYears(page, 1);

    const events = await page.request.get(
      `/api/race-events?where[key][equals]=${encodeURIComponent(race.eventId)}&depth=0&limit=1`,
    );
    const eventRowId = ((await events.json()) as { docs: { id: number }[] }).docs[0]?.id;
    expect(eventRowId, "the picked event has a row").toBeTruthy();
    const key = `e2e-hist-${Date.now()}`;
    const category = await page.request.post("/api/race-categories", {
      data: { distanceKm: 999, event: eventRowId, historical: true, key, label: "E2E 歷史分項" },
    });
    expect(category.ok(), await category.text()).toBeTruthy();
    const categoryId = ((await category.json()) as { doc: { id: number } }).doc.id;
    created.push({ collection: "race-categories", id: categoryId });
    recordCreated({ collection: "race-categories", id: categoryId, note: "M-ULTRA-10" });

    const record = await page.request.post("/api/race-records", {
      data: { distanceId: key, eventId: race.eventId, result: "finished", year: Number(year) },
    });
    expect(record.ok(), await record.text()).toBeTruthy();
    const recordId = ((await record.json()) as { doc: { id: number } }).doc.id;
    // Before the category: its foreign key would refuse the delete.
    created.unshift({ collection: "race-records", id: recordId });
    recordCreated({ collection: "race-records", id: recordId, note: "M-ULTRA-10" });

    await page.reload({ waitUntil: "load" });
    await waitForHydration(page);
    await page.getByTestId("race-event-select").first().selectOption(race.eventId);
    await expect(
      page.getByTestId("race-distance-select").first().locator(`option[value="${key}"]`),
    ).toHaveCount(0);

    const row = page.getByTestId("race-record-row").filter({ hasText: year });
    await row.getByTestId("race-record-edit").click();
    const editor = page.getByTestId("race-record-editor");
    await expect(editor.getByTestId("race-distance-select")).toHaveValue(key);
  });
});
