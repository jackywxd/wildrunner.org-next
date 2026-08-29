import type { BadgeEvent } from "./badge-source";

/**
 * The Abbott World Marathon Majors, and when somebody finished all six.
 *
 * WHY AN EXPLICIT LIST AND NOT JUST THE SERIES. These six sit in the
 * `marathon` series, which is what gives them their own heading in the
 * member picker and on the badge wall — but the series cannot decide the
 * badge. Six records in `marathon` is not a Six Star if two of them are
 * Boston. The badge turns on *which* six, and only a list can say that.
 *
 * The series is kept off `/races` through `SCHEDULE_SERIES`, because these
 * events have no *dated* editions and the schedule shows nothing else. (Not
 * "no editions": `populateRaceRecordRefs` creates one per recorded year, but
 * it writes only event and year, and `getUpcomingRaces` requires a
 * `startDate`.) A chip for a series that can never match anything is a
 * control whose only outcome is an empty page.
 *
 * The keys are duplicated in `data/race-events.csv`, in the generated
 * `seed-data.ts`, and in `20260829_041500_add_marathon_majors` — three files
 * with three different lifetimes, which is why none of them imports from
 * another. `U-SIXMAJORS` asserts this list against the seed, so a typo in
 * one place fails a test rather than quietly awarding nobody a badge.
 */
export const SIX_MAJORS = [
  "major-tokyo",
  "major-boston",
  "major-london",
  "major-berlin",
  "major-chicago",
  "major-new-york",
] as const;

export type SixMajorKey = (typeof SIX_MAJORS)[number];

/** What the badge's band and title say. Not an event in the catalogue. */
export const SIX_MAJORS_ID = "six-majors";
export const SIX_MAJORS_LABEL_ZH = "六大馬拉松";
export const SIX_MAJORS_BAND_ZH = "六大";

/**
 * A synthetic event, so the Six Star badge can go through `badgeToken()`
 * like any other and the artwork track keeps deciding how badges look.
 *
 * `series` is a real value rather than `null` on purpose: `badgeToken` reads
 * `null` as "this id resolves to nothing" and returns the grey placeholder
 * with a `?` on it — right for a renamed race, wrong for an achievement that
 * is exactly what it claims to be. With a real series it gets a colour from
 * `hash("six-majors")`, which is stable across environments for the same
 * reason event keys are.
 */
export const SIX_MAJORS_BADGE_EVENT: BadgeEvent = {
  id: SIX_MAJORS_ID,
  name: SIX_MAJORS_LABEL_ZH,
  series: "marathon",
};

/**
 * The year the sixth major was finished, or `undefined` if fewer than six.
 *
 * PER MAJOR THE *EARLIEST* FINISH COUNTS, and the answer is the latest of
 * those six. Six Star is earned the day the sixth different race is
 * finished, so somebody who ran Boston in 2015 and again in 2022, and the
 * other five in 2018, completed the set in 2018 — their second Boston did
 * not earn anything. Taking the latest year per event instead would date the
 * badge 2022 and quietly reward repetition.
 *
 * Returns `undefined` rather than `0` or `null`, matching `qualifiersFor()`:
 * "has not finished the six" and "finished them in year zero" must not be
 * the same value, because a falsy year renders as an empty band.
 */
export function sixMajorsCompletion(
  records: readonly { eventId: string; year: number }[],
): number | undefined {
  const firstYear = new Map<string, number>();

  for (const record of records) {
    const current = firstYear.get(record.eventId);
    if (current === undefined || record.year < current) {
      firstYear.set(record.eventId, record.year);
    }
  }

  let completedAt = 0;
  for (const key of SIX_MAJORS) {
    const year = firstYear.get(key);
    if (year === undefined) return undefined;
    if (year > completedAt) completedAt = year;
  }
  return completedAt;
}
