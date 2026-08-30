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
 * How far through the six majors somebody is, and every set they finished.
 *
 * ONE FUNCTION BECAUSE THERE IS ONE TRAVERSAL. This replaced a pair —
 * `sixMajorsCompletion` and `sixMajorsMissing` — that each walked the records
 * separately to answer halves of the same question, and needed a test
 * (`U-SIXMAJORS-6`) written for no reason but to pin them together: two loops
 * answering one question is exactly how a page comes to print "5/6" beside a
 * badge claiming six. Returning both from one pass makes disagreement
 * unrepresentable, which is stronger than an assertion about it.
 *
 * PER MAJOR THE *EARLIEST* FINISH COUNTS, and a set is dated by the latest of
 * the six that completed it. Somebody who ran Boston in 2015 and again in
 * 2022, and the other five in 2018, completed the set in 2018 — their second
 * Boston earned nothing. Taking the latest year per event would date the badge
 * 2022 and quietly reward repetition.
 *
 * Generalised, that rule is an index: the k-th set is finished when every
 * major has been run k times, and it is dated by the latest of each major's
 * k-th *earliest* finish. k = 1 is the paragraph above, unchanged.
 */
export type SixMajorsProgress = {
  /**
   * One year per completed set, earliest first. Empty until all six are in.
   *
   * A list rather than a count-and-a-year because each set is its own
   * achievement with its own date — the same model as a race badge, which is
   * how somebody with two Six Stars ends up wearing two of them.
   */
  completions: number[];
  /**
   * Which majors stand between this member and their *next* set.
   *
   * Never empty, by construction: `sets` is the smallest number of finishes
   * any major has, so at least one major sits at exactly that number. For
   * somebody with no majors at all this is all six; for somebody who has just
   * completed a set it is again all six, which is why the page hides the
   * progress line at 0/6 rather than reading it as a gap.
   */
  missing: SixMajorKey[];
};

export function sixMajorsProgress(
  records: readonly { eventId: string; year: number }[],
): SixMajorsProgress {
  // Six passes over a member's own race history, which is tens of rows. The
  // shape is worth more than the pass: `years[i]` lines up with
  // `SIX_MAJORS[i]`, so "the k-th earliest finish of every major" is one
  // index rather than a lookup that can miss.
  const years = SIX_MAJORS.map((key) =>
    records
      .filter((record) => record.eventId === key)
      .map((record) => record.year)
      .sort((a, b) => a - b),
  );

  const sets = Math.min(...years.map((list) => list.length));

  const completions = Array.from({ length: sets }, (_, k) =>
    Math.max(...years.map((list) => list[k])),
  );

  const missing = SIX_MAJORS.filter((_, index) => years[index].length === sets);

  return { completions, missing };
}
