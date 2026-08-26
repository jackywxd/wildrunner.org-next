import type { APIRequestContext } from "@playwright/test";

import { adminContext } from "../helpers/members";
import { expect, test } from "../helpers/test";

/**
 * Q — filtering the schedule down to Western States / Hardrock qualifiers.
 *
 * ARRIVES BY CLICKING, not by `goto`. The filters are links on a
 * `force-dynamic` route, so a chip that renders the right href but whose
 * page ignores the parameter looks identical in the HTML — and a soft
 * navigation is exactly where the calendar-toggle regression lived,
 * invisible to a suite that only ever used `goto`
 * (docs/testing-incidents.md).
 *
 * CREATES ITS OWN FIXTURE, which is why it is not in visitor.spec.ts: that
 * file reads the site as it is, because a visitor cannot do otherwise.
 * Here, leaning on ambient data would make the test worthless in both
 * directions. Locally the database is e2e residue; in CI it starts empty
 * and is seeded from `data/race-categories.csv`, whose qualifier flags are
 * a snapshot of two lists that get re-cut every year — and the window this
 * page shows is the next twelve months from *now*, so a corpus that
 * qualifies today can legitimately hold no qualifying race a year from now.
 * A test asserting "every visible row carries the tag" would then pass over
 * an empty list and prove nothing. Flagging one category up front means the
 * assertion always has something to be wrong about.
 *
 * RESTORES WHAT IT FOUND, rather than clearing. Once the real lists are
 * imported the category it picks may legitimately be a qualifier already,
 * and blanking it would corrupt the corpus for whatever runs next. Restore
 * is by captured id and captured value — never by pattern (AGENTS.md).
 */

type Category = {
  id: number;
  label: string;
  qualifiesWser?: boolean | null;
  wserVerifiedAt?: string | null;
};

/** The first race the schedule lists, and a category of its event. */
async function pickCategory(
  admin: APIRequestContext,
  editionId: string,
): Promise<Category> {
  const edition = await admin.get(`/api/race-editions/${editionId}?depth=0`);
  expect(edition.ok(), await edition.text()).toBeTruthy();
  const eventId = (await edition.json()).event as number;

  const found = await admin.get(
    `/api/race-categories?where[event][equals]=${eventId}&limit=1&depth=0`,
  );
  expect(found.ok(), await found.text()).toBeTruthy();
  const docs = (await found.json()).docs as Category[];
  // Every event has at least one category — validate-catalogue.ts fails the
  // CSV otherwise — so an empty list here is a broken seed, not a skip.
  expect(docs.length, "the first scheduled race has no categories").toBeGreaterThan(0);
  return docs[0];
}

test.describe("Q race qualifier filters", () => {
  test("Q1: filters the schedule to Western States qualifiers by clicking", async ({
    baseURL,
    page,
  }) => {
    const admin = await adminContext(baseURL);

    await page.goto("/races", { waitUntil: "domcontentloaded" });
    const rows = page.getByTestId("race-list-item");
    await expect(rows.first()).toBeVisible();

    const editionId = await rows.first().getAttribute("data-race-id");
    expect(editionId).toBeTruthy();
    const category = await pickCategory(admin, editionId as string);

    // Captured before anything is written, so the restore below puts back
    // what was actually there rather than a guess at what it should be.
    const previous = {
      qualifiesWser: category.qualifiesWser ?? false,
      wserVerifiedAt: category.wserVerifiedAt ?? null,
    };

    try {
      const patched = await admin.patch(`/api/race-categories/${category.id}`, {
        data: { qualifiesWser: true, wserVerifiedAt: "2026-08-26T00:00:00.000Z" },
      });
      expect(patched.ok(), await patched.text()).toBeTruthy();

      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByTestId("race-filter-wser").click();

      // The URL moved...
      await expect(page).toHaveURL(/[?&]qualifier=wser/, { timeout: 15_000 });

      // ...and so did the list. The race whose category was just flagged is
      // still here, which is what stops the next assertion being vacuous.
      await expect(
        page.locator(`[data-testid="race-list-item"][data-race-id="${editionId}"]`),
      ).toBeVisible();

      // THE ASSERTION THIS TEST EXISTS FOR: nothing without a Western
      // States tag survived the filter. A filter that let a non-qualifier
      // through would render a perfectly normal-looking schedule.
      //
      // One auto-retrying locator rather than counting the rows and looping
      // over the count. The count is read during a soft navigation, so it
      // can be the *previous* list's length while the assertions run
      // against the new one — which is how the first version of this test
      // walked off the end of a shorter list and reported a missing tag
      // that was never missing.
      await expect(
        page.locator(
          '[data-testid="race-list-item"]:not(:has([data-qualifier="wser"]))',
        ),
      ).toHaveCount(0);
      // fixture-scoped: the PATCH above guarantees at least one row, so the
      // assertion cannot be passing over an empty list.
      const filtered = await rows.count();
      expect(filtered).toBeGreaterThan(0);

      // Clicking the active chip clears it, and the schedule comes back.
      await page.getByTestId("race-filter-wser").click();
      await expect(page).toHaveURL((url) => !url.search.includes("qualifier="), {
        timeout: 15_000,
      });
      // Strictly more rows once the filter is off, which is also the proof
      // that the filter was removing something rather than doing nothing.
      await expect(rows).not.toHaveCount(filtered);
    } finally {
      await admin.patch(`/api/race-categories/${category.id}`, { data: previous });
      await admin.dispose();
    }
  });
});
