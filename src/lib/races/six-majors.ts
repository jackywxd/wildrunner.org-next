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

export const SIX_MAJORS_ID = "six-majors";

/** The heading on a profile's own section. Site chrome, so Chinese. */
export const SIX_MAJORS_LABEL_ZH = "六大馬拉松";

/**
 * What the badge itself says — Latin, unlike every other label here.
 *
 * A badge is a small square that gets screenshotted, shared and pasted
 * somewhere with no site around it, and "Six Star" is what Abbott calls this
 * and what runners of every language say. 「六大」 needs the page to explain
 * it; `6*` does not.
 *
 * Two characters because the band renders `${label} ${year}` at font-size 11
 * in a 64-wide viewBox — `SIX STAR 2024` runs off the edge, the same reason
 * the majors' own category label is `42K` and not `Marathon`.
 */
export const SIX_MAJORS_BAND = "6★";
export const SIX_MAJORS_TITLE = "Six Star Finisher";

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
 * Which of the six a member has not run.
 *
 * WHY THE PAGE NEEDS THIS AND NOT JUST THE BADGE. The badge wall renders
 * every record, not one per event, so somebody who has run London twice and
 * five majors in all sees SIX badges under 馬拉松 and no Six Star badge — and
 * nothing on the page explains the gap. That is not a hypothetical: it is the
 * first thing a reader asked about. The completion rule is right; what was
 * missing was any way to see it.
 *
 * A separate pass rather than a second return value from
 * `sixMajorsCompletion`, so neither function has to carry the other's
 * concern. `U-SIXMAJORS-5` pins the two together — exactly one of them may be
 * non-empty — because two functions answering the same question from two
 * loops is precisely how a page comes to say "5/6" beside a badge that
 * claims six.
 */
export function sixMajorsMissing(
  records: readonly { eventId: string }[],
): SixMajorKey[] {
  const ran = new Set(records.map((record) => record.eventId));
  return SIX_MAJORS.filter((key) => !ran.has(key));
}

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
