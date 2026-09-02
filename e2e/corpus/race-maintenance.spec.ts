import type { APIRequestContext } from "@playwright/test";
import { apiTest as test, expect } from "../helpers/api-test";

import { adminContext } from "../helpers/members";

/**
 * The maintenance endpoint's editions-coverage fields, checked against the
 * corpus independently rather than trusted — the same discipline
 * race-model.spec.ts applies to the collections directly. `eventsWithNoEdition`
 * and `dateless` are what scripts/refresh-race-editions.ts and the weekly
 * refresh agent both read to decide what to re-check
 * (docs/race-data-sources.md, "Weekly — the reviewed-CSV refresh"), so a
 * silently wrong count here means the wrong things get re-researched.
 */
type Doc = Record<string, unknown> & { id: number };

async function all<T = Doc>(
  api: APIRequestContext,
  collection: string,
): Promise<T[]> {
  const response = await api.get(`/api/${collection}?limit=0&pagination=false&depth=0`);
  expect(response.ok(), `${collection} is not readable`).toBeTruthy();
  return ((await response.json()) as { docs: T[] }).docs;
}

test.describe("X-MAINT race maintenance endpoint", () => {
  test("X-MAINT-1: eventsWithNoEdition and dateless match the corpus independently", async ({
    baseURL,
  }) => {
    const admin = await adminContext(baseURL);
    const events = await all(admin, "race-events");
    const editions = await all(admin, "race-editions");

    const response = await admin.post("/api/races/maintenance");
    expect(response.ok(), await response.text()).toBeTruthy();
    const report = (await response.json()) as {
      eventsWithNoEdition: { id: number }[];
      dateless: { id: number }[];
    };

    // Computed here from the same two collections, independently of the
    // endpoint's own logic — not by re-deriving from the report.
    const eventIdsWithEdition = new Set(
      editions.map((e) => (typeof e.event === "object" ? (e.event as Doc).id : e.event)),
    );
    const expectedNoEdition = events
      .filter((e) => !eventIdsWithEdition.has(e.id))
      .map((e) => e.id)
      .sort((a, b) => a - b);
    const actualNoEdition = report.eventsWithNoEdition.map((e) => e.id).sort((a, b) => a - b);
    expect(actualNoEdition).toEqual(expectedNoEdition);

    const expectedDateless = editions
      .filter((e) => !e.startDate)
      .map((e) => e.id)
      .sort((a, b) => a - b);
    const actualDateless = report.dateless.map((e) => e.id).sort((a, b) => a - b);
    expect(actualDateless).toEqual(expectedDateless);

    await admin.dispose();
  });

  test("X-MAINT-2: an unauthenticated request never gets the report", async ({
    request,
  }) => {
    // Not a specific status code: whether an unauthenticated, non-admin
    // caller sees 401 ("Unauthorized") or 500 ("RACE_MAINTENANCE_SECRET is
    // not configured") depends on whether this environment happens to have
    // the secret set (raceScheduleMaintenance.ts's own authorise()) — an
    // environment detail this test shouldn't be coupled to. What must hold
    // regardless is that the call never succeeds and never returns a body
    // shaped like the report.
    const response = await request.post("/api/races/maintenance");
    expect(response.ok()).toBeFalsy();
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.eventsWithNoEdition).toBeUndefined();
  });
});
