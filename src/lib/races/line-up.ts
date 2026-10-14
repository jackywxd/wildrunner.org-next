import type { RaceCategory } from "@/payload-types";

/**
 * "UTMB / CCC / OCC / TDS", in the order `race-categories.order` gives them.
 *
 * Historical entries are left out: the line-up says what a race runs, and a
 * 110K Québec Mega Trail ran once is not on offer (RaceCategories.ts).
 *
 * Its own module so a unit test can reach it without `content.ts`, which
 * imports the whole Payload config.
 */
export function lineUpSummary(
  categories: Pick<RaceCategory, "historical" | "label">[] | undefined,
): string | undefined {
  const current = (categories ?? []).filter((category) => !category.historical);
  if (current.length === 0) return undefined;
  return current.map((category) => category.label).join(" / ");
}
