import { RACE_QUALIFIER_LABELS_ZH } from "@/lib/races/qualifiers";
import type { RaceQualifier } from "@/lib/races/qualifiers";
import { cn } from "@/lib/utils";

/**
 * Which lottery this race's entries qualify for, and which entries those are.
 *
 * NAMES THE CATEGORIES, and that is the whole point. `RaceEntryRow` refuses
 * to render a `RaceBadge` because a schedule row spanning 20K to 100M has no
 * single distance and inventing one would put a claim on the page the data
 * does not support. The same trap is live here and worse: a bare
 * 「西部100 資格賽」 on a row whose 20K is not on the list would tell somebody
 * they can enter a lottery they cannot. Listing the qualifying categories is
 * what makes the tag true.
 *
 * BOTH LOTTERIES SHARE ONE NEUTRAL TREATMENT, differing only in text. These
 * sit immediately beside `RaceSeriesTag`, whose `utmb` variant is already
 * primary-tinted — a second primary-tinted pill next to it reads as another
 * series rather than as a different kind of fact. Same rule as that file:
 * these are LAYOUT colours and must not come from `design-tokens.ts`, which
 * derives a different hue per event and would make the tag change colour
 * from row to row.
 */
export function RaceQualifierTag({
  categories,
  className,
  qualifier,
}: {
  /** The category labels that qualify, e.g. ["UTMB", "CCC"]. */
  categories: string[];
  className?: string;
  qualifier: RaceQualifier;
}) {
  if (categories.length === 0) return null;

  return (
    <span
      className={cn(
        "inline-block border border-dashed border-foreground/30 px-2 py-0.5",
        "text-[11px] font-medium leading-tight text-muted-foreground",
        className,
      )}
      data-qualifier={qualifier}
      data-testid="race-qualifier-tag"
      title={`${RACE_QUALIFIER_LABELS_ZH[qualifier]}：${categories.join("、")}`}
    >
      {RACE_QUALIFIER_LABELS_ZH[qualifier]} · {categories.join(" / ")}
    </span>
  );
}
