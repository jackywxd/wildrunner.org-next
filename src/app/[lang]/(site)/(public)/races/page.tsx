import Link from "@/components/i18n/locale-link";

import PageHeader from "@/components/page-header";
import { getCurrentUser } from "@/lib/auth";
import { RaceCalendar } from "@/components/race-schedule/RaceCalendar";
import { RaceList } from "@/components/race-schedule/RaceList";
import { RaceScheduleFilters } from "@/components/race-schedule/RaceScheduleFilters";
import { getRaceScheduleBounds, getUpcomingRaces } from "@/lib/content";
import {
  currentAnchor,
  parseMonthAnchor,
  shiftAnchor,
} from "@/lib/races/calendar";
import { catalogueMap, getRaceCatalogueEvents } from "@/lib/races/catalogue-db";
import { parseRaceFilters, raceFiltersHref } from "@/lib/races/race-filters";
import type { RaceFilters } from "@/lib/races/race-filters";
import { hasQualifier } from "@/lib/races/qualifiers";
import { isRegistrationOpen } from "@/lib/races/registration";
import { pageMetadata } from "@/lib/site-metadata";
import { currentLocale, getDictionary } from "@/lib/i18n/dictionary";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getDictionary();
  return pageMetadata({
    locale: await currentLocale(),
    path: "/races",
    title: t.races.title,
    subtitle: t.races.subtitle,
    card: { kind: "plain" },
  });
}

const WINDOW_MONTHS = 12;

/**
 * Where the prev/next links point, and whether they point anywhere.
 *
 * Clamped to the months the schedule actually covers. Without that a
 * visitor can page back through empty years, and — since every anchor is a
 * distinct URL — a crawler is handed an unbounded space to walk. `bounds`
 * being undefined means the schedule is empty, so neither link is offered.
 */
function buildPager(
  anchor: string,
  bounds: { first: string; last: string } | undefined,
): { newer?: string; older?: string } {
  if (!bounds) return {};
  const windowEnd = shiftAnchor(anchor, WINDOW_MONTHS);
  return {
    newer: bounds.last >= windowEnd ? windowEnd : undefined,
    older: bounds.first < anchor ? shiftAnchor(anchor, -WINDOW_MONTHS) : undefined,
  };
}

/**
 * Preserve the current view and filters when paging.
 *
 * Shares `raceFiltersHref` with the filter chips rather than enumerating
 * the parameters again. The two used to be separate copies of the same
 * list, and a filter added to one and missed here drops itself silently the
 * moment somebody pages — the page still renders, just unfiltered.
 */
const pageHref = (filters: RaceFilters, anchor: string | undefined): string =>
  raceFiltersHref(filters, anchor);

function formatWindow(anchor: string, template: string): string {
  const [year, month] = anchor.split("-");
  const end = shiftAnchor(anchor, WINDOW_MONTHS - 1).split("-");
  return template
    .replace("{from}", year)
    .replace("{fromMonth}", String(Number(month)))
    .replace("{to}", end[0])
    .replace("{toMonth}", String(Number(end[1])));
}

export default async function RacesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getDictionary();
  const params = await searchParams;
  const filters = parseRaceFilters(params);
  const anchor = parseMonthAnchor(
    Array.isArray(params.from) ? params.from[0] : params.from,
  );

  // One clock for the whole render. Calling `new Date()` inside each row
  // would let a race straddling midnight be evaluated against two different
  // days within the same page.
  const now = new Date();
  // Resolved once for the whole page rather than per row. `getCurrentUser`
  // is React-cached, but the intent matters more than the call count: every
  // row must agree about who is looking.
  //
  // 「紀錄比賽」 is for members only. A signed-out visitor gets no button —
  // it leads into the members area, and a control whose only outcome is a
  // login screen does not belong on a public schedule.
  const [all, bounds, user, catalogueEvents] = await Promise.all([
    getUpcomingRaces({ anchor, now }),
    getRaceScheduleBounds(),
    getCurrentUser(),
    getRaceCatalogueEvents(),
  ]);
  const catalogue = catalogueMap(catalogueEvents);

  const windowAnchor = anchor ?? currentAnchor(now);
  const pager = buildPager(windowAnchor, bounds);

  const entries = all.filter((entry) => {
    if (filters.series && entry.series !== filters.series) return false;
    if (filters.registration === "open" && !isRegistrationOpen(entry, now)) {
      return false;
    }
    if (filters.qualifier && !hasQualifier(entry, filters.qualifier)) {
      return false;
    }
    return true;
  });

  return (
    <div
      className="container max-w-4xl py-6 lg:py-10"
      data-testid="race-schedule"
    >
      <PageHeader title={t.races.title} description={t.races.subtitle} />
      <hr className="my-8 h-0 border-t-2 border-border" />

      <RaceScheduleFilters filters={filters} />

      <div className="mt-8">
        {entries.length === 0 ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="race-schedule-empty"
          >
            {/* A filter that matches nothing is a different situation from an
                empty schedule, and telling somebody the schedule is empty
                while they are looking at an active filter is just wrong. */}
            {all.length === 0
              ? t.races.emptyAll
              : t.races.emptyFiltered}
          </p>
        ) : filters.view === "calendar" ? (
          <RaceCalendar anchor={anchor} entries={entries} now={now} />
        ) : (
          <RaceList
            canWriteReport={Boolean(user)}
            catalogue={catalogue}
            entries={entries}
            now={now}
          />
        )}
      </div>

      {/* Links, not buttons, for the same reason every filter is a link:
          each window is an addressable URL that can be shared. The anchor is
          absolute (?from=2025-08) rather than an offset, so the link still
          means the same window next month. */}
      <nav
        className="mt-8 flex items-center justify-between gap-4 border-t-2 border-border pt-4"
        data-testid="race-schedule-pager"
      >
        {pager.older ? (
          <Link
            className="text-xs text-muted-foreground hover:text-foreground"
            data-testid="race-pager-older"
            href={pageHref(filters, pager.older)}
          >
            {t.races.earlier}
          </Link>
        ) : (
          <span />
        )}

        <span className="text-xs tabular-nums text-muted-foreground">
          {formatWindow(windowAnchor, t.races.monthRange)}
        </span>

        {pager.newer ? (
          <Link
            className="text-xs text-muted-foreground hover:text-foreground"
            data-testid="race-pager-newer"
            href={pageHref(filters, pager.newer)}
          >
            {t.races.later}
          </Link>
        ) : (
          <span />
        )}
      </nav>

      {/* Not boilerplate. Race dates and — far more often — registration
          windows move, and this schedule is hand-maintained from published
          calendars with no official API behind it. Every row links out; this
          says plainly which source wins.

          The qualifier sentence is here for a sharper reason than the dates
          one. WSER and Hardrock republish their lists every year and each
          lottery has its own qualifying window, neither of which a flag on
          a category can express — so the site can say "this is a qualifier"
          about a race that has since dropped off the list. Stating which
          document wins is the difference between a useful filter and a
          claim that sends somebody to a race that will not count. */}
      <p className="mt-12 border-t-2 border-border pt-4 text-xs text-muted-foreground">
        {t.races.disclaimerDates}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        {t.races.disclaimerQualifiers}
      </p>
    </div>
  );
}
