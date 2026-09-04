import Link from "next/link";

import { RACE_SERIES_LABELS_ZH, SCHEDULE_SERIES } from "@/lib/races/catalogue";
import { raceFiltersHref } from "@/lib/races/race-filters";
import type { RaceFilters } from "@/lib/races/race-filters";
import { RACE_QUALIFIER_LABELS_ZH } from "@/lib/races/qualifiers";
import { cn } from "@/lib/utils";
import { getDictionary } from "@/lib/i18n/dictionary";

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
  // Named for the attribute rather than something like `testId` so the
  // attribute itself appears literally at each call site, which is what
  // `scripts/assert-schema-screen.mjs` greps for. A renamed prop passes
  // typecheck and fails that check — correctly, since its whole job is to
  // prove a selector a test uses really exists. Optional because the view,
  // series and registration chips below carry none.
  //
  // (Deliberately not spelling the attribute out in this comment: the
  // grep reads every file under src/, comments included, so a comment
  // naming it would keep the check green after the real attribute was
  // deleted.)
  "data-testid": testId,
}: {
  active: boolean;
  children: React.ReactNode;
  target: string;
  "data-testid"?: string;
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

export async function RaceScheduleFilters({
  filters,
}: {
  filters: RaceFilters;
}) {
  const t = await getDictionary();
  return (
    <div className="flex flex-col gap-3" data-testid="race-schedule-filter">
      <div
        className="flex flex-wrap items-center justify-between gap-2"
        data-testid="race-schedule-toggle"
      >
        <div className="flex flex-wrap gap-2">
          <Chip active={filters.view === "list"} target={href(filters, { view: "list" })}>
            {t.raceFilters.list}
          </Chip>
          <Chip
            active={filters.view === "calendar"}
            target={href(filters, { view: "calendar" })}
          >
            {t.raceFilters.calendar}
          </Chip>
        </div>

        <a
          className="border border-primary bg-primary px-3 py-1 text-xs font-medium leading-tight text-primary-foreground transition-colors hover:bg-primary/90"
          data-testid="race-reminder-link"
          href="https://racereminder.run/"
          rel="noopener noreferrer"
          target="_blank"
        >
          {t.raceFilters.remind}
        </a>
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip active={!filters.series} target={href(filters, { series: undefined })}>
          {t.raceFilters.allSeries}
        </Chip>
        {SCHEDULE_SERIES.map((series) => (
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
          {t.raceFilters.openOnly}
        </Chip>
      </div>

      {/* Single-valued, not combinable. A race on both lists is a handful
          worldwide, and two chips that could be on at once leave "and" vs
          "or" for the visitor to guess — beside chips that plainly mean
          "and". One value per URL keeps each one meaning one thing.

          Written out rather than mapped over RACE_QUALIFIERS: there are two
          of them and the const is not going anywhere, and spelling each one
          here is what puts its selector where a reader — and the check that
          verifies selectors — can find it. */}
      <div className="flex flex-wrap gap-2">
        <Chip
          active={filters.qualifier === "wser"}
          data-testid="race-filter-wser"
          target={href(filters, {
            qualifier: filters.qualifier === "wser" ? undefined : "wser",
          })}
        >
          {RACE_QUALIFIER_LABELS_ZH.wser}
        </Chip>
        <Chip
          active={filters.qualifier === "hardrock"}
          data-testid="race-filter-hardrock"
          target={href(filters, {
            qualifier: filters.qualifier === "hardrock" ? undefined : "hardrock",
          })}
        >
          {RACE_QUALIFIER_LABELS_ZH.hardrock}
        </Chip>
      </div>
    </div>
  );
}
