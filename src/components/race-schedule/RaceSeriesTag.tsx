import type { RaceSeries } from "@/lib/races/catalogue";
import { cn } from "@/lib/utils";

/**
 * Which series a scheduled race belongs to.
 *
 * These are LAYOUT colours, chosen so three categories stay apart in a
 * dense list — they are not badge colours and must not be sourced from
 * `design-tokens.ts`, which the artwork track owns and which derives a
 * different hue per event. Mixing the two would make the series tag change
 * colour from row to row within the same series.
 */
const SERIES_CLASS: Record<RaceSeries, string> = {
  // Present because the type requires every series, not because the
  // schedule renders it: `marathon` events carry no editions, so no row on
  // /races can be one. Styled anyway rather than cast away — the day one is
  // scheduled, it should look like the others, not like a crash.
  marathon: "border-border bg-secondary text-secondary-foreground",
  others: "border-border bg-secondary text-secondary-foreground",
  utmb: "border-primary/40 bg-primary/10 text-primary",
  wtm: "border-foreground/30 bg-foreground/5 text-foreground",
};

export function RaceSeriesTag({
  className,
  label,
  series,
}: {
  className?: string;
  label: string;
  series: RaceSeries;
}) {
  return (
    <span
      className={cn(
        "inline-block border px-2 py-0.5 text-[11px] font-medium leading-tight",
        SERIES_CLASS[series],
        className,
      )}
      data-series={series}
      data-testid="race-series-tag"
    >
      {label}
    </span>
  );
}
