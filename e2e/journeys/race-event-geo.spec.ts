import { apiTest as test, expect } from "../helpers/api-test";
import { TEST_ADMIN } from "../helpers/auth";
import { budget } from "../helpers/budget";
import { recordCreated } from "../helpers/created";
import { deleteCreatedRows } from "../helpers/teardown";

/**
 * M-GEO — an event gets a map status when it is created, and a person's
 * coordinates are theirs.
 *
 * CONTRACT LEVEL, not journey: what is at risk is what Payload does with a
 * save — which hook fires, what it writes back, what it refuses — and none of
 * it is visible in a browser until the footprint page exists. The lookup
 * itself (model + Nominatim) is measured on staging by
 * `pnpm geocode:events:staging`; this lane makes no network call and
 * `realAIAvailable()` is false here, so the "lookup" is the stand-in reading
 * data/race-event-places.csv. The fixture's key is in no CSV, so what it
 * observes is the `no-place` path — which is the useful one: it proves the
 * hook ran and recorded its answer, and that no coordinate is invented.
 *
 * The lookup runs AFTER the response (`afterResponse`), so the status is not
 * on the create's own reply and every assertion polls the end state.
 *
 * Fixture rows are deleted by the id captured at creation, in afterEach, so a
 * failure at step three cannot leave the next run with a duplicate-key
 * refusal that says nothing about the original fault.
 */
test.describe("M-GEO placing a race event", () => {
  const created: { collection: string; id: number }[] = [];

  test.afterEach(async ({ request }) => {
    const pending = created.splice(0, created.length);
    await deleteCreatedRows(request, pending);
  });

  async function createEvent(request: import("@playwright/test").APIRequestContext) {
    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    // Unique per run: the key is immutable and unique, and a leftover from a
    // crashed earlier run must not be what this one collides with.
    const key = `e2e-geo-${Date.now().toString(36)}`;
    const response = await request.post("/api/race-events", {
      data: { key, name: `E2E Geo ${key}`, series: "others" },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    const id = ((await response.json()) as { doc: { id: number } }).doc.id;
    created.push({ collection: "race-events", id });
    recordCreated({ collection: "race-events", id, note: key });
    return { id, key };
  }

  type EventDoc = {
    lat?: number | null;
    lng?: number | null;
    geoSource?: string | null;
    geoStatus?: string | null;
    geocodedAt?: string | null;
    name?: string;
  };

  async function readEvent(
    request: import("@playwright/test").APIRequestContext,
    id: number,
  ): Promise<EventDoc> {
    const response = await request.get(`/api/race-events/${id}?depth=0`);
    expect(response.ok(), await response.text()).toBeTruthy();
    return (await response.json()) as EventDoc;
  }

  test("M-GEO-T1: a new event is looked up after the response, and an unknown one is not given a made-up place", async ({
    request,
  }) => {
    test.setTimeout(budget(30_000));
    const { id } = await createEvent(request);

    // The hook records its answer. Whatever the answer is, "no status" would
    // mean the hook never ran — the failure this test is for.
    await expect
      .poll(async () => (await readEvent(request, id)).geoStatus ?? null, {
        timeout: budget(15_000),
        message: "the event was never looked up (no geoStatus)",
      })
      .not.toBeNull();

    const doc = await readEvent(request, id);
    expect(doc.geocodedAt, "an attempt leaves its time").toBeTruthy();
    // No CSV row, no edition, no model in this lane: nothing to place.
    // A coordinate here would be the stand-in (or a regression) making one up.
    expect(doc.geoStatus).toBe("no-place");
    expect(doc.lat ?? null).toBeNull();
    expect(doc.lng ?? null).toBeNull();
    expect(doc.geoSource ?? null).toBeNull();
  });

  test("M-GEO-T2: coordinates typed by a person become manual, and a later save does not move them", async ({
    request,
  }) => {
    test.setTimeout(budget(30_000));
    const { id } = await createEvent(request);
    // Wait for the creation lookup to finish BEFORE editing, so its late
    // write-back cannot be what this test is racing.
    await expect
      .poll(async () => (await readEvent(request, id)).geoStatus ?? null, {
        timeout: budget(15_000),
      })
      .not.toBeNull();

    const edit = await request.patch(`/api/race-events/${id}`, {
      data: { lat: 49.7016, lng: -123.1558 },
    });
    expect(edit.ok(), await edit.text()).toBeTruthy();

    const after = await readEvent(request, id);
    expect(after.geoSource).toBe("manual");
    expect(after.geoStatus).toBe("ok");
    // Stored as typed: the 0.1° rounding is for what automation writes.
    expect(after.lat).toBe(49.7016);
    expect(after.lng).toBe(-123.1558);

    // An unrelated save — what the admin form does on every Save, carrying
    // the coordinates back — must neither unset `manual` nor re-run a lookup
    // over the point.
    const rename = await request.patch(`/api/race-events/${id}`, {
      data: { name: "E2E Geo renamed", lat: 49.7016, lng: -123.1558 },
    });
    expect(rename.ok(), await rename.text()).toBeTruthy();
    const settled = await readEvent(request, id);
    expect(settled.name).toBe("E2E Geo renamed");
    expect(settled.geoSource).toBe("manual");
    expect(settled.lat).toBe(49.7016);
    expect(settled.lng).toBe(-123.1558);
  });

  test("M-GEO-T3: a coordinate off the globe, or a lone latitude, is refused", async ({
    request,
  }) => {
    test.setTimeout(budget(30_000));
    const { id } = await createEvent(request);

    const offGlobe = await request.patch(`/api/race-events/${id}`, {
      data: { lat: 91, lng: 0 },
    });
    expect(offGlobe.status()).toBe(400);

    // One coordinate alone draws nothing but would read as "placed".
    const lone = await request.patch(`/api/race-events/${id}`, {
      data: { lat: 45 },
    });
    expect(lone.status()).toBe(400);

    const doc = await readEvent(request, id);
    expect(doc.lat ?? null).toBeNull();
  });
});
