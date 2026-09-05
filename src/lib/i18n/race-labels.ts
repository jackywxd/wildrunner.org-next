import type { Dictionary } from "@/lib/i18n/dictionary";
import type { RaceSeries } from "@/lib/races/catalogue";
import type { RaceQualifier } from "@/lib/races/qualifiers";

/**
 * The series and qualifier chips, in the language being read.
 *
 * WHY THESE WORDS MOVED AND `RACE_SERIES_LABELS_ZH` STAYED. That const is
 * read by `collections/RaceSchedule.ts` to label a Payload admin field, and
 * /admin is not under `[lang]` — it has no locale to read. So the constant
 * keeps serving the admin panel and the public chips read the dictionary,
 * which is the same split `KIND_LABELS` ended up with in the previous stage.
 * The duplication is two rows of four words and it ends when the member and
 * admin surfaces get a dictionary of their own.
 *
 * A `type`-only import of `Dictionary`: `dictionary.ts` is `server-only`, and
 * a value import here would put it in the bundle of every Client Component
 * that renders a chip.
 */

const SERIES_KEY = {
  utmb: "seriesUtmb",
  wtm: "seriesWtm",
  marathon: "seriesMarathon",
  others: "seriesOthers",
} as const satisfies Record<RaceSeries, keyof Dictionary["races"]>;

const QUALIFIER_KEY = {
  wser: "qualifierWser",
  hardrock: "qualifierHardrock",
} as const satisfies Record<RaceQualifier, keyof Dictionary["races"]>;

export function seriesLabel(t: Dictionary, series: RaceSeries): string {
  return t.races[SERIES_KEY[series]];
}

export function qualifierLabel(t: Dictionary, qualifier: RaceQualifier): string {
  return t.races[QUALIFIER_KEY[qualifier]];
}
