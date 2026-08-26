import { expect, test } from "@playwright/test";

import {
  parseRaceFilters,
  raceFiltersHref,
  raceFiltersToParams,
} from "@/lib/races/race-filters";
import { hasQualifier, qualifiersFor } from "@/lib/races/qualifiers";
import type { QualifiableCategory } from "@/lib/races/qualifiers";

/**
 * U-QUALIFIER — the seam between a qualifier flag and what /races claims.
 *
 * THE ASSERTION THIS FILE EXISTS FOR is that the OCC is not a Western
 * States qualifier. Western States and Hardrock publish lists of *entries*,
 * not events: at Mont-Blanc the UTMB and CCC are on the WS list and the OCC
 * is not. Every shortcut that would have been cheaper — a flag on the
 * event, "the longest category qualifies", "a UTMB World Series race
 * qualifies" — gets that one wrong, and gets it wrong invisibly: the page
 * still renders, the tag still looks right, and a runner enters a race that
 * will not count toward the lottery they are training for. That failure
 * cannot be caught by asking whether text is present, so it is asserted
 * here on the function that decides it.
 */

const montBlanc: QualifiableCategory[] = [
  { label: "PTL", qualifiesWser: false, qualifiesHardrock: false },
  { label: "UTMB", qualifiesWser: true, qualifiesHardrock: true },
  { label: "TDS", qualifiesWser: true, qualifiesHardrock: false },
  { label: "CCC", qualifiesWser: true, qualifiesHardrock: false },
  { label: "OCC", qualifiesWser: false, qualifiesHardrock: false },
];

test("U-QUALIFIER-1: names the qualifying entries and leaves the others out", () => {
  const qualifiers = qualifiersFor(montBlanc);

  expect(qualifiers?.wser).toEqual(["UTMB", "TDS", "CCC"]);
  // The point of the whole design: the OCC is on neither list, and a row
  // that claimed otherwise would invite somebody into the wrong race.
  expect(qualifiers?.wser).not.toContain("OCC");
  expect(qualifiers?.wser).not.toContain("PTL");

  // Hardrock's list is much shorter and is not a subset of WS's, so the two
  // must be derived independently rather than one from the other.
  expect(qualifiers?.hardrock).toEqual(["UTMB"]);
});

test("U-QUALIFIER-2: a race on neither list has no qualifiers at all", () => {
  // `null`, not `false` — this is what Payload returns for a checkbox on a
  // row no import has touched, and it is what every category looks like on
  // a database seeded before the qualifier columns were filled.
  const unchecked: QualifiableCategory[] = [
    { label: "50K", qualifiesWser: null, qualifiesHardrock: null },
    { label: "25K", qualifiesWser: null, qualifiesHardrock: null },
  ];

  // `undefined`, not `{}`: `entry.qualifiers` has to be falsy for the
  // common case, or every row would render an empty tag container.
  expect(qualifiersFor(unchecked)).toBeUndefined();
  expect(qualifiersFor([])).toBeUndefined();
  expect(qualifiersFor(undefined)).toBeUndefined();

  expect(hasQualifier({ qualifiers: qualifiersFor(unchecked) }, "wser")).toBe(false);
  expect(hasQualifier({ qualifiers: qualifiersFor(montBlanc) }, "wser")).toBe(true);
  expect(hasQualifier({}, "hardrock")).toBe(false);
});

test("U-QUALIFIER-3: an unrecognised qualifier in the URL falls back to unfiltered", () => {
  // The query string is attacker-controlled, and just as often a stale
  // bookmark. Neither should error; both should render the whole schedule.
  expect(parseRaceFilters({ qualifier: "wser" }).qualifier).toBe("wser");
  expect(parseRaceFilters({ qualifier: "hardrock" }).qualifier).toBe("hardrock");
  expect(parseRaceFilters({ qualifier: "../../etc/passwd" }).qualifier).toBeUndefined();
  expect(parseRaceFilters({ qualifier: "" }).qualifier).toBeUndefined();
  expect(parseRaceFilters({}).qualifier).toBeUndefined();
  // Repeated params arrive as an array; take the first rather than throwing.
  expect(parseRaceFilters({ qualifier: ["hardrock", "wser"] }).qualifier).toBe("hardrock");
});

test("U-QUALIFIER-4: paging keeps the filter the chips set", () => {
  // The regression this prevents: the chip href and the pager href used to
  // be two hand-written copies of the same parameter list, so a filter
  // added to one and missed in the other dropped itself the moment somebody
  // paged — with nothing failing, because the page still rendered.
  const filters = {
    qualifier: "wser",
    registration: "open",
    series: "utmb",
    view: "calendar",
  } as const;

  const chip = raceFiltersToParams(filters);
  const pager = new URLSearchParams(raceFiltersHref(filters, "2026-08").split("?")[1]);
  pager.delete("from");

  expect(pager.toString()).toBe(chip.toString());
  expect(pager.get("qualifier")).toBe("wser");

  // And the canonical URL stays clean when nothing is filtered.
  expect(raceFiltersHref({ view: "list" })).toBe("/races");
});
