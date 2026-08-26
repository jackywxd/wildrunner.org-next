import Link from "next/link";

import { RACE_SERIES, RACE_SERIES_LABELS_ZH } from "@/lib/races/catalogue";
import { raceFiltersHref } from "@/lib/races/race-filters";
import type { RaceFilters } from "@/lib/races/race-filters";
import { RACE_QUALIFIERS, RACE_QUALIFIER_LABELS_ZH } from "@/lib/races/qualifiers";
import { cn } from "@/lib/utils";

/**
 * View toggle and filters, as links rather than client state.
 *
 * Every option is a URL, which means: both views are fully server-rendered
 * and present in the initial HTML, a filtered schedule can be shared or
 * bookmarked, nothing hydrates, and an e2e assertion is a plain `goto`. The
 * cost is one round-trip per click, which is nothing on a page that is
 * already `force-dynamic` — and it keeps the whole route a server
 * component, in a codebase whose only vendored shadcn primitive is a button.
 */

const href = (filters: RaceFilters, patch: Partial<RaceFilters>): string =>
  raceFiltersHref({ ...filters, ...patch });

function Chip({
  active,
  children,
  target,
  testId,
}: {
  active: boolean;
  children: React.ReactNode;
  target: string;
  testId?: string;
}) {
  return (
    <Link
      aria-current={active ? "true" : undefined}
      className={cn(
        "border px-3 py-1 text-xs leading-tight transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:text-foreground",
      )}
      data-testid={testId}
      href={target}
    >
      {children}
    </Link>
  );
}

export function RaceScheduleFilters({ filters }: { filters: RaceFilters }) {
  return (
    <div className="flex flex-col gap-3" data-testid="race-schedule-filter">
      <div
        className="flex flex-wrap items-center justify-between gap-2"
        data-testid="race-schedule-toggle"
      >
        <div className="flex flex-wrap gap-2">
          <Chip active={filters.view === "list"} target={href(filters, { view: "list" })}>
            列表
          </Chip>
          <Chip
            active={filters.view === "calendar"}
            target={href(filters, { view: "calendar" })}
          >
            月曆
          </Chip>
        </div>

        <a
          className="border border-primary bg-primary px-3 py-1 text-xs font-medium leading-tight text-primary-foreground transition-colors hover:bg-primary/90"
          data-testid="race-reminder-link"
          href="https://racereminder.run/"
          rel="noopener noreferrer"
          target="_blank"
        >
          預約提醒
        </a>
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip active={!filters.series} target={href(filters, { series: undefined })}>
          全部系列
        </Chip>
        {RACE_SERIES.map((series) => (
          <Chip
            active={filters.series === series}
            key={series}
            target={href(filters, { series })}
          >
            {RACE_SERIES_LABELS_ZH[series]}
          </Chip>
        ))}

        <Chip
          active={filters.registration === "open"}
          target={href(filters, {
            registration: filters.registration === "open" ? undefined : "open",
          })}
        >
          只看報名中
        </Chip>
      </div>

      {/* Single-valued, not combinable. A race on both lists is a handful
          worldwide, and two chips that could be on at once leave "and" vs
          "or" for the visitor to guess — beside chips that plainly mean
          "and". One value per URL keeps each one meaning one thing. */}
      <div className="flex flex-wrap gap-2">
        {RACE_QUALIFIERS.map((qualifier) => (
          <Chip
            active={filters.qualifier === qualifier}
            key={qualifier}
            target={href(filters, {
              qualifier: filters.qualifier === qualifier ? undefined : qualifier,
            })}
            testId={`race-filter-${qualifier}`}
          >
            {RACE_QUALIFIER_LABELS_ZH[qualifier]}
          </Chip>
        ))}
      </div>
    </div>
  );
}
