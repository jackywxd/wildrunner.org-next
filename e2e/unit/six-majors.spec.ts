import { expect, test } from "@playwright/test";

import { SEED_CATEGORIES, SEED_EVENTS } from "@/lib/races/seed-data";
import { SIX_MAJORS, sixMajorsProgress } from "@/lib/races/six-majors";

/**
 * U-SIXMAJORS — how many sets of the six somebody has, and in which years.
 *
 * THE ASSERTION THIS FILE EXISTS FOR is that a second Boston does not move
 * the year. Six Star is earned the day the sixth *different* race is
 * finished, so per major the earliest finish counts and the badge is dated
 * by the latest of those six. The cheaper implementation — one year per
 * event, take the most recent — is right for every case except a repeat, and
 * a repeat is common: it would date a 2018 Six Star as 2022 because somebody
 * went back to Boston. Nothing on the page could show that was wrong.
 *
 * A repeat is not only common, it is the point: people go round twice. So
 * that rule generalises to an index — the k-th set needs every major run k
 * times, and is dated by the latest of each major's k-th *earliest* finish —
 * and the paragraph above is k = 1, unchanged. T2 is the old assertion, and
 * it still reads the same because the generalisation did not disturb it.
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

test("U-SIXMAJORS-1: no set until all six are there", () => {
  expect(sixMajorsProgress([]).completions).toEqual([]);
  expect(sixMajorsProgress(OTHERS).completions).toEqual([]);

  // Five of six — the case that must not round up to a badge.
  const five = allSix(2019).slice(0, 5);
  expect(five).toHaveLength(5);
  expect(sixMajorsProgress(five).completions).toEqual([]);

  expect(sixMajorsProgress(allSix(2019)).completions).toEqual([2019]);
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

  // One set, in 2018. Not 2022, and not a second set either: seven majors is
  // not twelve.
  expect(sixMajorsProgress(records).completions).toEqual([2018]);
});

test("U-SIXMAJORS-3: trail records neither complete nor disturb the set", () => {
  expect(sixMajorsProgress([...allSix(2020), ...OTHERS]).completions).toEqual([
    2020,
  ]);

  // Swap one major for a trail race: still five majors, still no badge.
  const short = [...allSix(2020).slice(1), ...OTHERS];
  expect(sixMajorsProgress(short).completions).toEqual([]);
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

test("U-SIXMAJORS-5: names what is missing from the next set", () => {
  // The case the profile page exists to explain: London twice, no New York.
  // Six records, five majors — which is what a reader saw as six badges and
  // no Six Star, with nothing on the page accounting for the difference.
  const londonTwiceNoNewYork = [
    { eventId: "major-tokyo", year: 2026 },
    { eventId: "major-chicago", year: 2024 },
    { eventId: "major-london", year: 2024 },
    { eventId: "major-berlin", year: 2023 },
    { eventId: "major-boston", year: 2023 },
    { eventId: "major-london", year: 2019 },
  ];

  expect(sixMajorsProgress(londonTwiceNoNewYork)).toEqual({
    completions: [],
    missing: ["major-new-york"],
  });

  expect(sixMajorsProgress([]).missing).toEqual([...SIX_MAJORS]);
  // Every major run exactly once: the set is complete, and the *next* one
  // needs all six again. Never empty, which is why the page decides on
  // 6 - missing.length rather than on this being non-empty.
  expect(sixMajorsProgress(allSix(2020)).missing).toEqual([...SIX_MAJORS]);
});

test("U-SIXMAJORS-6: two sets, each dated by the round that finished it", () => {
  // Years interleaved on purpose. Every wrong shape this could have gives a
  // different answer here: taking the latest per major would date the first
  // set 2023; sorting descending would return the two years swapped; and
  // chunking the twelve records in date order into two sixes dates the first
  // set 2018, because 2018 and 2018 both fall in the first chunk while
  // Chicago and New York have not been run at all yet.
  const records = [
    { eventId: "major-tokyo", year: 2015 },
    { eventId: "major-tokyo", year: 2016 },
    { eventId: "major-boston", year: 2015 },
    { eventId: "major-boston", year: 2017 },
    { eventId: "major-london", year: 2018 },
    { eventId: "major-london", year: 2019 },
    { eventId: "major-berlin", year: 2018 },
    { eventId: "major-berlin", year: 2020 },
    { eventId: "major-chicago", year: 2021 },
    { eventId: "major-chicago", year: 2022 },
    { eventId: "major-new-york", year: 2021 },
    { eventId: "major-new-york", year: 2023 },
    ...OTHERS,
  ];

  expect(sixMajorsProgress(records)).toEqual({
    completions: [2021, 2023],
    missing: [...SIX_MAJORS],
  });
});

test("U-SIXMAJORS-7: a set and a half is one badge and three to go", () => {
  const records = [
    { eventId: "major-tokyo", year: 2018 },
    { eventId: "major-boston", year: 2019 },
    { eventId: "major-london", year: 2017 },
    { eventId: "major-berlin", year: 2020 },
    { eventId: "major-chicago", year: 2016 },
    { eventId: "major-new-york", year: 2021 },
    // Round two, three races in.
    { eventId: "major-tokyo", year: 2022 },
    { eventId: "major-boston", year: 2023 },
    { eventId: "major-london", year: 2024 },
  ];

  expect(sixMajorsProgress(records)).toEqual({
    completions: [2021],
    missing: ["major-berlin", "major-chicago", "major-new-york"],
  });

  // Nine major records is not a set and a half by count: a set is six
  // *different* races, and running Tokyo nine times is still one major.
  const tokyoNineTimes = Array.from({ length: 9 }, (_, index) => ({
    eventId: "major-tokyo",
    year: 2016 + index,
  }));
  expect(sixMajorsProgress(tokyoNineTimes).completions).toEqual([]);
});

test("U-SIXMAJORS-8: the badges and the count can never disagree", () => {
  // One function, one traversal, so the two answers cannot drift — this
  // asserts the relation that makes that true rather than pinning two
  // implementations together. A page printing "5/6" beside a badge claiming
  // six is what the relation forbids.
  const cases = [
    [],
    OTHERS,
    allSix(2019),
    allSix(2019).slice(0, 5),
    [...allSix(2019), ...allSix(2024)],
    [...allSix(2019), ...allSix(2024), ...allSix(2031), ...OTHERS],
    [{ eventId: "major-london", year: 2019 }, { eventId: "major-london", year: 2024 }],
  ];

  for (const records of cases) {
    const label = JSON.stringify(records);
    const { completions, missing } = sixMajorsProgress(records);

    // Never empty: `missing` names the majors still needed for the next set,
    // and there is always a next set.
    expect(missing.length, label).toBeGreaterThan(0);

    // Earliest first, so the page can render newest-first by reversing.
    expect([...completions].sort((a, b) => a - b), label).toEqual(completions);

    for (const key of SIX_MAJORS) {
      const runs = records.filter((record) => record.eventId === key).length;
      // A set needs every major, so nobody can hold more sets than their
      // least-run major has finishes.
      expect(runs, `${key} in ${label}`).toBeGreaterThanOrEqual(completions.length);
      // And `missing` is exactly the majors sitting at that floor.
      expect(missing.includes(key), `${key} in ${label}`).toBe(
        runs === completions.length,
      );
    }
  }
});
