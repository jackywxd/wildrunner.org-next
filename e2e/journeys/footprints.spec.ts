import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "../helpers/test";
import { budget } from "../helpers/budget";
import { waitForHydration } from "../helpers/hydration";
import { TIMING } from "@/lib/footprints/footprints";

/**
 * V-FOOT — 野馬足跡 (/riders/footprints), the club's races flown over a map.
 *
 * WHAT NEEDS A BROWSER HERE is the part that is only true on a screen: that a
 * visitor who clicks 足跡 gets a page whose list is the club's real races in
 * the right order, that it starts moving without being asked, and that a
 * visitor who asked for no motion gets the whole picture and nothing moving.
 * The logic — stop merging, ordering, the date-line curve, `nextStep`, the
 * sound gate — is pure and pinned in `e2e/unit/footprints.spec.ts`; none of
 * it is re-asserted through a browser. The drawing itself (comet, pulse,
 * glow, ring) is not asserted at all: a test that watches an animation
 * frame-by-frame is a test of Chromium's compositor, and its failure would be
 * a flake with a mechanism nobody could name.
 *
 * THE EXPECTED LIST COMES FROM THE API, not from a number written here: the
 * public race-events (with their coordinates) and every page of the public
 * timeline. A hard-coded "4 stops" would go stale the day the seed changed
 * and would pass, wrongly, on a corpus where the page had lost a stop and
 * another had been added. Both lanes read the same data the page reads, by a
 * different route.
 *
 * CORPUS-SCOPED, like `club-timeline.spec.ts`: a visitor creates no races, so
 * the test needs what the seed made. It says what it needs and fails loudly
 * rather than passing over an empty map. PR #200 put `wtm-mt-fuji/fuji100/2025`
 * in the seed so that the trans-Pacific pair exists.
 */

type EventDoc = { key: string; lat?: number | null; lng?: number | null };
type TimelineRow = { key: string; sortDay?: string; year: number; race?: { eventId: string } };
type TimelinePage = { rows: TimelineRow[]; nextCursor: Record<string, string | number> | null };

/** A stop as the test expects it: the (event, year) the page must list. */
type Expected = { key: string; lng: number; sortDay: string; year: number };

async function events(request: APIRequestContext): Promise<Map<string, { lat: number; lng: number }>> {
  const response = await request.get("/api/race-events?limit=0&depth=0&pagination=false");
  expect(response.ok(), await response.text()).toBeTruthy();
  const docs = ((await response.json()) as { docs: EventDoc[] }).docs;
  const placed = new Map<string, { lat: number; lng: number }>();
  for (const doc of docs) {
    // The same refusal the page makes: a coordinate pair that is really there,
    // and not the (0, 0) a declared column default would write.
    if (typeof doc.lat !== "number" || typeof doc.lng !== "number") continue;
    if (doc.lat === 0 && doc.lng === 0) continue;
    placed.set(doc.key, { lat: doc.lat, lng: doc.lng });
  }
  return placed;
}

async function timelineRows(request: APIRequestContext): Promise<TimelineRow[]> {
  const rows: TimelineRow[] = [];
  let cursor: TimelinePage["nextCursor"] = null;
  // Bounded: a cursor that never ends is a bug to report, not a loop to sit in.
  for (let page = 0; page < 200; page++) {
    const query = cursor
      ? `?${new URLSearchParams(Object.entries(cursor).map(([k, v]) => [k, String(v)])).toString()}`
      : "";
    const response = await request.get(`/api/riders/timeline${query}`);
    expect(response.ok(), await response.text()).toBeTruthy();
    const body = (await response.json()) as TimelinePage;
    rows.push(...body.rows);
    cursor = body.nextCursor;
    if (!cursor) return rows;
  }
  throw new Error("the timeline API never reported its last page");
}

async function expectedStops(request: APIRequestContext): Promise<Expected[]> {
  const [placed, rows] = await Promise.all([events(request), timelineRows(request)]);
  const byKey = new Map<string, Expected>();
  for (const row of rows) {
    if (!row.race) continue;
    const position = placed.get(row.race.eventId);
    if (!position) continue;
    const key = `${row.race.eventId}|${row.year}`;
    const known = byKey.get(key);
    // One stop per (event, year); its date is the first row's that has one.
    if (known) {
      if (!known.sortDay && row.sortDay) known.sortDay = row.sortDay;
      continue;
    }
    byKey.set(key, { key, lng: position.lng, sortDay: row.sortDay ?? "", year: row.year });
  }
  return [...byKey.values()];
}

/** What the page lists, in the order it lists it. */
function listed(page: Page) {
  return page.getByTestId("footprint-stop");
}

const stopKeys = (page: Page) =>
  listed(page).evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-stop-key") ?? ""));

const currentIndex = (page: Page) =>
  listed(page).evaluateAll((nodes) => nodes.findIndex((node) => node.getAttribute("data-current") === "true"));

/** Arrive the way a visitor does: from the timeline, by clicking 足跡. */
async function openFootprints(page: Page) {
  await page.goto("/riders/timeline", { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  await page.getByTestId("club-timeline-footprints").click();
  await expect(page).toHaveURL(/\/riders\/footprints$/, { timeout: budget(15_000) });
  await waitForHydration(page);
}

test.describe("V-FOOT 野馬足跡", () => {
  test("V-FOOT-T1: the list is the club's placed races in time order, and the map moves by itself", async ({
    page,
    request,
  }) => {
    test.setTimeout(budget(40_000));

    const expected = await expectedStops(request);
    // The map is only worth testing with a route to fly. Three stops is the
    // least that has a middle, and the corpus must hold the trans-Pacific
    // pair (the Americas and Asia) that the date-line curve exists for.
    expect(
      expected.length,
      "the seed has fewer than 3 races with a placed event; the corpus build (pnpm db:reset:local) did not run",
    ).toBeGreaterThanOrEqual(3);
    expect(
      expected.some((stop) => stop.lng < -60) && expected.some((stop) => stop.lng > 100),
      "the seeded stops do not include one in the Americas and one in Asia",
    ).toBe(true);

    await openFootprints(page);

    // Same stops, once each.
    const keys = await stopKeys(page);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual(expected.map((stop) => stop.key).sort());

    // Oldest first. Each stop is placed by (year, date) from the API, and a
    // stop with no date sorts to the start of its year, as the page does.
    const byKey = new Map(expected.map((stop) => [stop.key, stop]));
    const order = keys.map((key) => byKey.get(key)!);
    for (let i = 1; i < order.length; i++) {
      const [a, b] = [order[i - 1], order[i]];
      const ahead = a.year !== b.year ? a.year - b.year : a.sortDay < b.sortDay ? -1 : a.sortDay > b.sortDay ? 1 : 0;
      expect(ahead, `${a.key} is listed before ${b.key}, but ran after it`).toBeLessThanOrEqual(0);
    }

    // It starts without being asked: no click, no key, and the current stop
    // is first named and then replaced. "Some stop is current" rather than
    // "stop 0 is", so a slow page load that misses the first landing cannot
    // fail this for a reason it does not name.
    await expect
      .poll(() => currentIndex(page), {
        message: "the map never landed on a stop by itself",
        timeout: budget(15_000),
      })
      .toBeGreaterThanOrEqual(0);
    const first = await currentIndex(page);
    await expect
      .poll(() => currentIndex(page), {
        message: `the map landed on stop ${first} and never flew on`,
        timeout: budget(15_000),
      })
      .not.toBe(first);

    // The two ways of saying "current" agree and the card follows the list.
    // One read of the page, so a landing cannot fall between the two halves.
    const snapshot = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('[data-testid="footprint-stop"]')];
      const current = rows.filter((row) => row.getAttribute("data-current") === "true");
      return {
        ariaOnOthers: rows.filter(
          (row) => row.hasAttribute("aria-current") && row.getAttribute("data-current") !== "true",
        ).length,
        card: document.querySelector('[data-testid="footprint-card"]')?.textContent ?? "",
        currentAria: current.map((row) => row.getAttribute("aria-current")),
        name: current[0]?.querySelector("a")?.textContent?.trim() ?? "",
      };
    });
    expect(snapshot.currentAria).toEqual(["true"]);
    expect(snapshot.ariaOnOthers).toBe(0);
    expect(snapshot.name).not.toBe("");
    expect(snapshot.card).toContain(snapshot.name);

    // The card leads to the 交會 row. Which stop it describes may change
    // under the click, so this asserts the shape of where it lands, not which.
    await page.getByTestId("footprint-card-link").click();
    await expect(page).toHaveURL(/\/riders\/timeline\?at=race-[^#]+#row-race-/, {
      timeout: budget(15_000),
    });
    const anchor = new URL(page.url()).hash.slice(1);
    // `.first()`, because the page is in the document twice on arrival: the
    // page transition (src/components/transition/PageTransitionEffect.tsx,
    // whose header measures it) keeps a second copy of the page beside the
    // real one, so any id on it is present twice and a strict locator refuses
    // to pick. race-report.spec.ts works round the same thing the same way.
    await expect(page.locator(`[id="${anchor}"]`).first()).toBeAttached();
  });

  test("V-FOOT-T2: asked for no motion, the whole route is drawn and nothing moves", async ({
    page,
    request,
  }) => {
    test.setTimeout(budget(40_000));
    const expected = await expectedStops(request);
    expect(expected.length, "the seed has fewer than 3 placed races").toBeGreaterThanOrEqual(3);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await openFootprints(page);

    const map = page.getByTestId("footprint-map");
    await expect(map, "the page never settled on the still map").toHaveAttribute("data-mode", "static", {
      timeout: budget(15_000),
    });

    // Every stop pinned, and a curve for every hop between them in the order
    // the list gives: one path per hop, two where it is shorter to cross the
    // edge of the map (more than 180 degrees of longitude apart).
    const stops = expected.length;
    await expect(page.getByTestId("footprint-pin")).toHaveCount(stops);
    const byKey = new Map(expected.map((stop) => [stop.key, stop]));
    const longitudes = (await stopKeys(page)).map((key) => byKey.get(key)!.lng);
    const paths = longitudes
      .slice(1)
      .reduce((total, lng, i) => total + (Math.abs(lng - longitudes[i]) > 180 ? 2 : 1), 0);
    await expect(page.getByTestId("footprint-arc")).toHaveCount(paths);
    const arcs = paths;

    // Nothing is current, there is no card announcing a landing, and the
    // switch for a sound nothing will make is not offered.
    await expect(page.getByTestId("footprint-card")).toHaveCount(0);
    await expect(page.getByTestId("footprint-sound")).toHaveCount(0);
    expect(await currentIndex(page)).toBe(-1);

    // Long enough for the moving map to have landed on its second stop
    // (land, hold, fly) with room to spare. Waiting is the test here: an
    // absence of change cannot be polled into existence.
    await page.waitForTimeout(TIMING.landMs + TIMING.gapMs + TIMING.flyMs + 1_000);
    expect(await currentIndex(page)).toBe(-1);
    await expect(page.getByTestId("footprint-pin")).toHaveCount(stops);
    expect(await page.getByTestId("footprint-arc").count()).toBe(arcs);
  });
});
