import Link from "next/link";

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

export const dynamic = "force-dynamic";

const TITLE = "賽事日程";

export async function generateMetadata() {
  return pageMetadata({
    path: "/races",
    title: TITLE,
    subtitle:
      "世界各地重要的越野賽事日程，含報名開放與截止時間。包含 UTMB 世界系列賽、World Trail Majors 與其他獨立賽事。",
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

function formatWindow(anchor: string): string {
  const [year, month] = anchor.split("-");
  const end = shiftAnchor(anchor, WINDOW_MONTHS - 1).split("-");
  return `${year} 年 ${Number(month)} 月 – ${end[0]} 年 ${Number(end[1])} 月`;
}

export default async function RacesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
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
      <PageHeader
        title={TITLE}
        description="世界各地重要的越野賽事日程，含報名開放與截止時間。包含 UTMB 世界系列賽、World Trail Majors 與其他獨立賽事。"
      />
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
              ? "還沒有公布的賽事日程。"
              : "這個條件下沒有賽事，試試其他條件或看全部。"}
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
            ← 更早的賽事
          </Link>
        ) : (
          <span />
        )}

        <span className="text-xs tabular-nums text-muted-foreground">
          {formatWindow(windowAnchor)}
        </span>

        {pager.newer ? (
          <Link
            className="text-xs text-muted-foreground hover:text-foreground"
            data-testid="race-pager-newer"
            href={pageHref(filters, pager.newer)}
          >
            更晚的賽事 →
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
        賽事日期與報名資訊以主辦單位官方公告為準。發現有誤請告訴我們。
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        資格賽標示依 WSER 與 Hardrock 最近一次公布的名單整理，兩份名單每年更新，且各有自己的資格認定期間；報名前請以官方名單為準。
      </p>
    </div>
  );
}
