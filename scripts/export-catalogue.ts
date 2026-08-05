/**
 * Turn the in-code race catalogue into two reviewable CSVs.
 *
 * ONE-SHOT, BY DESIGN. `src/lib/races/catalogue.ts` is about to stop being
 * the source of truth: the races become rows in `race-events` and
 * `race-categories`, editable in the admin panel. But a source of truth
 * cannot be something nobody has read — and 283 category rows are not
 * reviewable as TypeScript literals.
 *
 * So this exports once, a human reviews and corrects the CSVs, the corrected
 * files land in the repo under version control, and the migration imports
 * from *them*. After that this script and catalogue.ts both go away.
 *
 * THE `verified` COLUMN IS THE POINT. 63 of the 89 events carry a default
 * category line-up rather than a researched one — every UTMB World Series
 * event except Mont-Blanc and Western States gets `20K/50K/100K/100M`, and
 * every World Trail Majors event gets `Ultra/Short`. Those defaults were an
 * acceptable shortcut while this was a code constant nothing downstream
 * checked; they are not acceptable as database rows that members pick from
 * and that foreign keys point at. Marking them is what makes the gap
 * visible and fixable in passes rather than all at once.
 *
 *   pnpm tsx scripts/export-catalogue.ts
 */
import fs from "node:fs";
import path from "node:path";

import { RACE_EVENTS, type RaceEvent } from "../src/lib/races/catalogue";

const OUT_DIR = path.resolve(import.meta.dirname, "..", "data");

/**
 * Events whose category line-up came from the event's own site rather than
 * from a default.
 *
 * Derived from the catalogue's own structure and comments: `utmb()` applies
 * UTMB_STANDARD unless a line-up is passed, `wtm()` always applies
 * WTM_SERIES, and `other()` has no default at all — its header says so
 * explicitly ("every caller states the line-up"), and the independent races
 * were each read off their own site on a recorded date.
 *
 * Listed rather than computed because the distinction is about *provenance*,
 * which the data shape cannot express: `utmb-western-states` has one
 * distance because somebody checked, not because a function defaulted it.
 */
const RESEARCHED = new Set<string>([
  "utmb-mont-blanc",
  "utmb-western-states",
]);

const isResearched = (event: RaceEvent): boolean =>
  event.series === "others" || RESEARCHED.has(event.id);

/** Minimal RFC 4180: quote when the value contains a comma, quote or newline. */
function cell(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(file: string, header: string[], rows: (string | number | undefined)[][]) {
  const lines = [header.join(","), ...rows.map((row) => row.map(cell).join(","))];
  const target = path.join(OUT_DIR, file);
  fs.writeFileSync(target, `${lines.join("\n")}\n`, "utf8");
  console.log(`${target}  ${rows.length} rows`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

writeCsv(
  "race-events.csv",
  ["key", "series", "name", "name_zh", "country", "website", "verified", "source"],
  RACE_EVENTS.map((event) => [
    event.id,
    event.series,
    event.name,
    // The catalogue has never carried Chinese names or websites — both are
    // new columns for the reviewer to fill, not data being dropped.
    "",
    event.country,
    "",
    // Identity (id, name, country, series) was read off published calendars
    // for every event; it is the *categories* that were defaulted.
    "yes",
    "",
  ]),
);

writeCsv(
  "race-categories.csv",
  [
    "event_key",
    "key",
    "label",
    "distance_km",
    "elevation_gain_m",
    "order",
    "verified",
    "source",
  ],
  RACE_EVENTS.flatMap((event) =>
    event.distances.map((distance, index) => [
      event.id,
      distance.id,
      distance.label,
      "",
      "",
      index + 1,
      isResearched(event) ? "yes" : "no",
      "",
    ]),
  ),
);

const unverified = RACE_EVENTS.filter((event) => !isResearched(event));
console.log(
  `\n${RACE_EVENTS.length} events, ` +
    `${RACE_EVENTS.reduce((n, e) => n + e.distances.length, 0)} categories.`,
);
console.log(
  `${unverified.length} events carry DEFAULT categories and need checking ` +
    `against the event's own site (verified=no).`,
);
