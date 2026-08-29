import { expect, test } from "@playwright/test";

import { SEED_CATEGORIES, SEED_EVENTS } from "@/lib/races/seed-data";
import { SIX_MAJORS, sixMajorsCompletion } from "@/lib/races/six-majors";

/**
 * U-SIXMAJORS — when the six majors are done, and in which year.
 *
 * THE ASSERTION THIS FILE EXISTS FOR is that a second Boston does not move
 * the year. Six Star is earned the day the sixth *different* race is
 * finished, so per major the earliest finish counts and the badge is dated
 * by the latest of those six. The cheaper implementation — one year per
 * event, take the most recent — is right for every case except a repeat, and
 * a repeat is common: it would date a 2018 Six Star as 2022 because somebody
 * went back to Boston. Nothing on the page could show that was wrong.
 *
 * The other half is the key list. These six keys are written out in
 * `data/race-events.csv`, in the generated `seed-data.ts`, and again in
 * `20260829_041500_add_marathon_majors` — three files with three different
 * lifetimes, none importing from another, which is the right call and also
 * three chances for a typo. A misspelled key here awards the badge to
 * nobody, forever, with no error anywhere. So it is checked.
 */

const OTHERS = [
  { eventId: "utmb-mont-blanc", year: 2021 },
  { eventId: "other-hardrock", year: 2023 },
];

const allSix = (year: number) =>
  SIX_MAJORS.map((eventId) => ({ eventId, year }));

test("U-SIXMAJORS-1: undefined until all six are there", () => {
  expect(sixMajorsCompletion([])).toBeUndefined();
  expect(sixMajorsCompletion(OTHERS)).toBeUndefined();

  // Five of six — the case that must not round up to a badge.
  const five = allSix(2019).slice(0, 5);
  expect(five).toHaveLength(5);
  expect(sixMajorsCompletion(five)).toBeUndefined();

  expect(sixMajorsCompletion(allSix(2019))).toBe(2019);
});

test("U-SIXMAJORS-2: dated by the sixth race, not the latest record", () => {
  const records = [
    { eventId: "major-boston", year: 2015 },
    { eventId: "major-tokyo", year: 2018 },
    { eventId: "major-london", year: 2018 },
    { eventId: "major-berlin", year: 2018 },
    { eventId: "major-chicago", year: 2018 },
    { eventId: "major-new-york", year: 2018 },
    // Back to Boston four years after the set was complete. This earns
    // nothing, and must not redate the badge.
    { eventId: "major-boston", year: 2022 },
    ...OTHERS,
  ];

  expect(sixMajorsCompletion(records)).toBe(2018);
});

test("U-SIXMAJORS-3: trail records neither complete nor disturb the set", () => {
  expect(sixMajorsCompletion([...allSix(2020), ...OTHERS])).toBe(2020);

  // Swap one major for a trail race: still five majors, still no badge.
  const short = [...allSix(2020).slice(1), ...OTHERS];
  expect(sixMajorsCompletion(short)).toBeUndefined();
});

test("U-SIXMAJORS-4: every key names a race somebody can actually record", () => {
  const eventKeys = new Set(SEED_EVENTS.map((event) => event.key));
  const withCategory = new Set(SEED_CATEGORIES.map((category) => category.eventKey));

  for (const key of SIX_MAJORS) {
    expect(eventKeys, `${key} is missing from the seeded catalogue`).toContain(key);
    // An event with no category cannot be recorded — `race-records` needs a
    // distanceId — so the badge would be unreachable rather than merely
    // hard to earn.
    expect(withCategory, `${key} has no category to record`).toContain(key);
  }

  expect(new Set(SIX_MAJORS).size).toBe(6);
});
