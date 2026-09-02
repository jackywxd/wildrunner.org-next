import { expect, test } from "@playwright/test";

import {
  EARLIEST_RACE_YEAR,
  isRaceYearClaimable,
  raceYearOptions,
} from "@/lib/races/catalogue";

/**
 * The year bound the picker renders and the year bound the API enforces are
 * the same bound.
 *
 * `/api/members/race-editions/resolve` refuses a year outside the range the
 * picker offers. It is not the last line of defence — `race-editions.year`
 * validates the same bound (RaceEditions.ts), measured — but it is the one
 * that produces a truthful error instead of a 404 blaming the event key. Two
 * copies of a bound is a bound that drifts, and drift here means an endpoint
 * refusing a year the select happily shows.
 *
 * Unit, not contract, because the failure being guarded is exactly that
 * drift. A contract test exercises one year and proves nothing about the
 * boundary; this asks the whole range at once.
 */
test.describe("U-CLAIMYEAR the claimable year range", () => {
  // Fixed rather than `new Date()`: a test whose expectations move with the
  // calendar cannot be seen to fail for the reason it names.
  const now = new Date("2026-09-02T00:00:00.000Z");

  test("U-CLAIMYEAR-T1: the range is exactly what the picker offers", () => {
    const offered = raceYearOptions(now);

    // Both directions. Only checking the offered years would pass for a
    // predicate that returned `true` for everything — which is the bug that
    // matters here, since it is the one that lets 9999 through.
    for (const year of offered) {
      expect(isRaceYearClaimable(year, now), `${year} is offered`).toBe(true);
    }
    for (const year of [
      EARLIEST_RACE_YEAR - 1,
      1900,
      now.getUTCFullYear() + 2,
      9999,
    ]) {
      expect(isRaceYearClaimable(year, now), `${year} is not offered`).toBe(false);
    }
  });

  test("U-CLAIMYEAR-T2: next year is claimable, and the year after is not", () => {
    // The one boundary somebody would plausibly "tidy up" to the current
    // year. RaceRecords.ts allows next year on purpose — entries open well
    // ahead of the race — and a photo of a race that has not run yet is odd
    // but harmless, where a row on the public calendar for it is not.
    expect(isRaceYearClaimable(2027, now)).toBe(true);
    expect(isRaceYearClaimable(2028, now)).toBe(false);
  });

  test("U-CLAIMYEAR-T3: anything that is not a whole year is refused", () => {
    // The endpoint reaches this with `Number(body.year)`, so these are the
    // shapes a hand-written request actually produces.
    expect(isRaceYearClaimable(Number.NaN, now)).toBe(false);
    expect(isRaceYearClaimable(2020.5, now)).toBe(false);
    expect(isRaceYearClaimable(Number.POSITIVE_INFINITY, now)).toBe(false);
  });
});
