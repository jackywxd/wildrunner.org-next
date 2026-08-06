import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { anonContext } from "../helpers/members";

/**
 * NO SKIP-IF-EMPTY GUARDS, and that is the point of the file.
 *
 * Six `test.skip(x.length === 0, ...)` lines were removed from here. They made
 * every assertion below conditional on the corpus being non-empty — in a file
 * whose entire reason for existing is that an empty or half-populated corpus
 * is the failure nobody notices. On CI it did exactly that: the editions
 * tests skipped, the run reported green, and nothing had been asserted about
 * editions at all.
 *
 * An empty table here is not "this environment does not have that data". It
 * is the migration having produced nothing, or a seed step having been
 * dropped from the workflow. Both should be red.
 *

 * X — the race tables, as they actually are in this environment.
 *
 * A DIFFERENT KIND OF TEST FROM EVERYTHING ELSE HERE. Every other spec
 * creates its own fixture and asserts on that, which is right: it makes
 * them independent of what else has run. The cost is that no test can ever
 * notice the corpus itself is wrong — five schedule rows sat with no
 * eventId for weeks, and a suite of 250 green tests had nothing to say
 * about it.
 *
 * So this asserts about the data that is there. It is the only place that
 * can fail because a migration mapped a category to the wrong event, or
 * because somebody deleted an event a badge points at.
 *
 * SKIPPED WHEN THE TABLES ARE EMPTY, and that is not a loophole: an empty
 * database is a legitimate state for a fresh checkout, while a database
 * with 40 of 100 events is not. The count assertions below are what catch
 * the second case.
 */
type Doc = Record<string, unknown> & { id: number };

async function all<T = Doc>(
  api: APIRequestContext,
  collection: string,
  query = "",
): Promise<T[]> {
  const response = await api.get(
    `/api/${collection}?limit=0&pagination=false&depth=0${query}`,
  );
  expect(response.ok(), `${collection} is not readable`).toBeTruthy();
  return ((await response.json()) as { docs: T[] }).docs;
}

test.describe("X race model corpus", () => {
  let api: APIRequestContext;
  let events: Doc[];
  let categories: Doc[];
  let editions: Doc[];
  let schedule: Doc[];

  test.beforeAll(async ({ baseURL }) => {
    // Anonymous on purpose: these are public reference tables, and reading
    // them as an admin would hide an access regression that makes /races
    // empty for visitors.
    api = await anonContext(baseURL);
    events = await all(api, "race-events");
    categories = await all(api, "race-categories");
    editions = await all(api, "race-editions");
    schedule = await all(api, "race-schedule");
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test("X-T1: every category belongs to an event that exists", () => {
    const ids = new Set(events.map((e) => e.id));
    const orphans = categories.filter((c) => !ids.has(c.event as number));
    expect(orphans.map((c) => `${c.event}/${c.key}`)).toEqual([]);
  });

  test("X-T2: every edition belongs to an event that exists", () => {
    const ids = new Set(events.map((e) => e.id));
    const orphans = editions.filter((d) => !ids.has(d.event as number));
    expect(orphans.map((d) => `${d.event}/${d.year}`)).toEqual([]);
  });

  test("X-T3: no event is left with nothing to enter", () => {
    // An event with no categories cannot appear in any picker and cannot
    // carry a badge, so it is a row that can never be used — invisible
    // unless something asks.
    const withCategories = new Set(categories.map((c) => c.event as number));
    const empty = events
      .filter((e) => !withCategories.has(e.id))
      .map((e) => e.key);
    expect(empty).toEqual([]);
  });

  test("X-T4: an event runs at most one edition per year", () => {
    // The database enforces this, so a failure here means the constraint
    // was dropped rather than that the data drifted.
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const edition of editions) {
      const key = `${edition.event}/${edition.year}`;
      if (seen.has(key)) duplicates.push(key);
      seen.add(key);
    }
    expect(duplicates).toEqual([]);
  });

  test("X-T5: the catalogue is populated, not partially populated", () => {
    // Concrete floors rather than "greater than zero". A migration that
    // imported 40 of 100 events would pass every check above — every row it
    // did write would be perfectly consistent.
    expect(events.length, "events").toBeGreaterThanOrEqual(100);
    expect(categories.length, "categories").toBeGreaterThanOrEqual(394);

    // Editions get a relative floor, because their count is a property of the
    // environment rather than of the catalogue: every scheduled race is an
    // edition, so there cannot be fewer of them than there are schedule rows.
    //
    // Without this line the editions were untested by construction. Removing
    // the skip guards was not enough: X-T2 and X-T4 ask "does every edition
    // resolve" and "does any event run twice in a year", and both are
    // vacuously true of an empty table. Emptying `race_editions` locally left
    // all six tests green — which is exactly what CI had been reporting.
    expect(schedule.length, "schedule rows").toBeGreaterThan(0);
    expect(editions.length, "editions").toBeGreaterThanOrEqual(schedule.length);
  });

  test("X-T6: every category key is unique within its event", () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const category of categories) {
      const key = `${category.event}/${category.key}`;
      if (seen.has(key)) duplicates.push(key);
      seen.add(key);
    }
    expect(duplicates).toEqual([]);
  });
});
