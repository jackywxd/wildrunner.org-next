import Link from "@/components/i18n/locale-link";

import { SCHEDULE_SERIES } from "@/lib/races/catalogue";
import { raceFiltersHref } from "@/lib/races/race-filters";
import type { RaceFilters } from "@/lib/races/race-filters";
import { cn } from "@/lib/utils";
import { getDictionary } from "@/lib/i18n/dictionary";
import { qualifierLabel, seriesLabel } from "@/lib/i18n/race-labels";

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
        "border hit-area inline-flex min-h-9 items-center px-3 text-tag transition-colors",
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

/**
 * ON A PHONE THE FILTERS FOLD BEHIND ONE CONTROL. Three wrapping rows of
 * chips took half of a 375px first screen before a single race appeared.
 * Below `md` only the view toggle, 「篩選」 and the reminder link show; the
 * rest opens under them.
 *
 * A checkbox and `peer-checked`, not state: this stays a server component
 * with nothing to hydrate, the fold works with no script at all — the same
 * reason every option here is a link — and the chips exist once in the DOM,
 * so nothing that selects one by its test id finds two. From `md` the rows
 * are always shown and the toggle is not rendered visibly.
 */
const FOLD_ID = "race-filters-open";

export async function RaceScheduleFilters({
  filters,
}: {
  filters: RaceFilters;
}) {
  const t = await getDictionary();
  const active =
    Number(Boolean(filters.series)) +
    Number(Boolean(filters.registration)) +
    Number(Boolean(filters.qualifier));
  return (
    <div className="flex flex-col gap-3" data-testid="race-schedule-filter">
      <input
        aria-controls="race-filter-rows"
        className="peer sr-only md:hidden"
        id={FOLD_ID}
        type="checkbox"
      />
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
          <label
            className={cn(
              "hit-area inline-flex min-h-9 cursor-pointer items-center border px-3 text-tag md:hidden",
              // The checkbox is visually hidden, so its focus is drawn here.
              "[.peer:focus-visible~div_&]:outline [.peer:focus-visible~div_&]:outline-2 [.peer:focus-visible~div_&]:outline-primary",
              active
                ? "border-primary text-primary"
                : "border-border bg-background text-muted-foreground",
            )}
            data-testid="race-filter-fold"
            htmlFor={FOLD_ID}
          >
            {active
              ? t.raceFilters.filterCount.replace("{count}", String(active))
              : t.raceFilters.filter}
          </label>
        </div>

        <a
          className="border border-primary bg-primary hit-area inline-flex min-h-9 items-center px-3 text-tag font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          data-testid="race-reminder-link"
          href="https://racereminder.run/"
          rel="noopener noreferrer"
          target="_blank"
        >
          {t.raceFilters.remind}
        </a>
      </div>

      <div
        className="hidden flex-col gap-3 peer-checked:flex md:flex"
        id="race-filter-rows"
      >
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
              {seriesLabel(t, series)}
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
            {qualifierLabel(t, "wser")}
          </Chip>
          <Chip
            active={filters.qualifier === "hardrock"}
            data-testid="race-filter-hardrock"
            target={href(filters, {
              qualifier: filters.qualifier === "hardrock" ? undefined : "hardrock",
            })}
          >
            {qualifierLabel(t, "hardrock")}
          </Chip>
        </div>
      </div>
    </div>
  );
}
