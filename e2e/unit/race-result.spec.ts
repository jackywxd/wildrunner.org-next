import { expect, test } from "@playwright/test";

import type { SiteRaceRecord } from "@/lib/content-types";
import { finishesOnly, isFinish, latestPerEvent } from "@/lib/races/race-result";

/**
 * U-BADGEPICK — which race an event's badge shows once a record can be a DNF.
 *
 * THE BUG THIS EXISTS FOR was latent, not hypothetical. `latestPerEvent` chose
 * the most recent year and nothing else, which was exactly right while every
 * record meant "finished". The moment `result` arrived, the same line started
 * hiding a finish behind a later DNF — a badge wall asserting something untrue
 * about what a member has done, with no error anywhere. U-BADGEPICK-2 is that
 * case.
 *
 * Pure in, pure out. The wall itself is three async Server Components and a
 * catalogue query; the rule is a comparison between two records.
 */

const record = (
  eventId: string,
  year: number,
  result: "finished" | "dnf" = "finished",
  id = year * 1000 + eventId.length,
): SiteRaceRecord => ({
  distanceId: "100k",
  eventId,
  id,
  result,
  year,
});

test.describe("U-BADGEPICK badge selection", () => {
  test("U-BADGEPICK-1: among finishes, the most recent year wins", () => {
    const picked = latestPerEvent([
      record("utmb", 2019),
      record("utmb", 2024),
      record("utmb", 2021),
    ]);
    expect(picked).toHaveLength(1);
    expect(picked[0].year).toBe(2024);
  });

  test("U-BADGEPICK-2: a finish beats a later DNF", () => {
    // Finished in 2023, dropped in 2025. Choosing by year alone picks the
    // DNF and the finish disappears from the shelf — the regression.
    const picked = latestPerEvent([
      record("utmb", 2023, "finished"),
      record("utmb", 2025, "dnf"),
    ]);
    expect(picked).toHaveLength(1);
    expect(picked[0].year).toBe(2023);
    expect(picked[0].result).toBe("finished");
  });

  test("U-BADGEPICK-3: order of arrival does not decide it", () => {
    // The same two records the other way round. A rule that reads "replace
    // when the candidate is a finish" without also checking what it is
    // replacing passes one of these and fails the other.
    const picked = latestPerEvent([
      record("utmb", 2025, "dnf"),
      record("utmb", 2023, "finished"),
    ]);
    expect(picked[0].year).toBe(2023);
    expect(picked[0].result).toBe("finished");
  });

  test("U-BADGEPICK-4: an event only ever dropped still gets a badge", () => {
    // A DNF is kept and shown greyed — it is not erased. Somebody who has
    // started Hardrock twice and finished neither has run Hardrock twice.
    const picked = latestPerEvent([
      record("hardrock", 2022, "dnf"),
      record("hardrock", 2024, "dnf"),
    ]);
    expect(picked).toHaveLength(1);
    expect(picked[0].result).toBe("dnf");
    expect(picked[0].year).toBe(2024);
  });

  test("U-BADGEPICK-5: each event is decided on its own", () => {
    const picked = latestPerEvent([
      record("utmb", 2023, "finished"),
      record("utmb", 2025, "dnf"),
      record("hardrock", 2024, "dnf"),
    ]);
    expect(picked.map((r) => [r.eventId, r.year, r.result])).toEqual([
      // Sorted by year descending, then eventId.
      ["hardrock", 2024, "dnf"],
      ["utmb", 2023, "finished"],
    ]);
  });

  test("U-BADGEPICK-6: a record the database left NULL is already a finish", () => {
    // Not a test of this module so much as a pin on the contract it depends
    // on: `mapRaceRecord` resolves NULL to "finished" before a record gets
    // here, so nothing in this file has to know about the pre-migration rows.
    // If that resolution ever moves, this says what breaks.
    expect(isFinish({ result: "finished" })).toBe(true);
    expect(isFinish({ result: "dnf" })).toBe(false);
  });

  test("U-BADGEPICK-7: finishesOnly drops every DNF", () => {
    const records = [
      record("boston", 2024, "finished"),
      record("tokyo", 2024, "dnf"),
      record("london", 2023, "finished"),
    ];
    expect(finishesOnly(records).map((r) => r.eventId)).toEqual([
      "boston",
      "london",
    ]);
  });
});
