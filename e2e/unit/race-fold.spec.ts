import { expect, test } from "@playwright/test";

import { foldFinished } from "@/lib/races/race-state";

/**
 * U-RACEFOLD — which races the schedule folds behind 「已結束」.
 *
 * Two failures this rule could produce, neither visible as an error. Folding
 * a window somebody addressed with `?from=` hides the rows they paged back to
 * see — race-report.spec.ts depends on one being visible, and a visitor
 * following a shared link would find a month of races reduced to a
 * disclosure. And folding a month with nothing left to come replaces a list
 * with a heading over one button, the same rows one tap further away.
 *
 * `now` is a parameter, per docs/testing-strategy.md; 2026-09-15 at midday
 * UTC is the same calendar day in every timezone this could run in.
 */

const NOW = new Date("2026-09-15T12:00:00Z");

const race = (id: string, startDate: string, endDate?: string) => ({
  id,
  startDate,
  endDate: endDate ?? null,
});

const past = race("past", "2026-09-05");
const earlier = race("earlier", "2026-09-01", "2026-09-03");
const running = race("running", "2026-09-14", "2026-09-16");
const next = race("next", "2026-09-20");

test.describe("U-RACEFOLD folding finished races", () => {
  test("U-RACEFOLD-1: the default window folds finished races and keeps order", () => {
    const { shown, folded } = foldFinished([next, past, running, earlier], NOW, true);
    expect(shown.map((entry) => entry.id)).toEqual(["next", "running"]);
    expect(folded.map((entry) => entry.id)).toEqual(["past", "earlier"]);
  });

  test("U-RACEFOLD-2: an addressed window folds nothing", () => {
    const entries = [next, past, running];
    const { shown, folded } = foldFinished(entries, NOW, false);
    expect(shown).toEqual(entries);
    expect(folded).toEqual([]);
  });

  test("U-RACEFOLD-3: a month with nothing left to come is shown in full", () => {
    const entries = [past, earlier];
    const { shown, folded } = foldFinished(entries, NOW, true);
    expect(shown).toEqual(entries);
    expect(folded).toEqual([]);
  });

  test("U-RACEFOLD-4: a race running today is not finished, and stays out", () => {
    const { shown, folded } = foldFinished([running, past], NOW, true);
    expect(shown.map((entry) => entry.id)).toEqual(["running"]);
    expect(folded.map((entry) => entry.id)).toEqual(["past"]);
  });
});
