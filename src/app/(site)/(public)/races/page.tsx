import Link from "next/link";

import PageHeader from "@/components/page-header";
import { getCurrentUser } from "@/lib/auth";
import { RaceCalendar } from "@/components/race-schedule/RaceCalendar";
import { RaceList } from "@/components/race-schedule/RaceList";
import {
  RaceScheduleFilters,
  type RaceFilters,
  type RaceView,
} from "@/components/race-schedule/RaceScheduleFilters";
import { siteConfig } from "@/config/site";
import { getRaceScheduleBounds, getUpcomingRaces } from "@/lib/content";
import {
  currentAnchor,
  parseMonthAnchor,
  shiftAnchor,
} from "@/lib/races/calendar";
import { RACE_SERIES } from "@/lib/races/catalogue";
import type { RaceSeries } from "@/lib/races/catalogue";
import { isRegistrationOpen } from "@/lib/races/registration";

export const dynamic = "force-dynamic";

const TITLE = "賽事日程";

export async function generateMetadata() {
  const baseURL = siteConfig.baseURL;
  const title = `${TITLE} | Race Schedule | ${siteConfig.title}`;
  const description =
    "世界各地重要的越野賽事日程，含報名開放與截止時間。包含 UTMB 世界系列賽、World Trail Majors 與其他獨立賽事。";
  const ogImage = `${baseURL}/og?title=${encodeURIComponent(title)}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: `${baseURL}/races`,
      images: [{ url: ogImage, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
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

/** Preserve the current view and filters when paging. */
function pageHref(filters: RaceFilters, anchor: string | undefined): string {
  const params = new URLSearchParams();
  if (filters.view !== "list") params.set("view", filters.view);
  if (filters.series) params.set("series", filters.series);
  if (filters.registration) params.set("registration", filters.registration);
  if (anchor) params.set("from", anchor);
  const query = params.toString();
  return query ? `/races?${query}` : "/races";
}

function formatWindow(anchor: string): string {
  const [year, month] = anchor.split("-");
  const end = shiftAnchor(anchor, WINDOW_MONTHS - 1).split("-");
  return `${year} 年 ${Number(month)} 月 – ${end[0]} 年 ${Number(end[1])} 月`;
}

function parseFilters(
  params: Record<string, string | string[] | undefined>,
): RaceFilters {
  const one = (value: string | string[] | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : value;

  const view = one(params.view);
  const series = one(params.series);

  return {
    registration: one(params.registration) === "open" ? "open" : undefined,
    // Anything unrecognised falls back to the default rather than erroring:
    // these come from the query string, so they are attacker-controlled and
    // also just as often a stale bookmark.
    series: RACE_SERIES.includes(series as RaceSeries)
      ? (series as RaceSeries)
      : undefined,
    view: (view === "calendar" ? "calendar" : "list") as RaceView,
  };
}

export default async function RacesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseFilters(params);
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
  const [all, bounds, user] = await Promise.all([
    getUpcomingRaces({ anchor, now }),
    getRaceScheduleBounds(),
    getCurrentUser(),
  ]);

  const windowAnchor = anchor ?? currentAnchor(now);
  const pager = buildPager(windowAnchor, bounds);

  const entries = all.filter((entry) => {
    if (filters.series && entry.series !== filters.series) return false;
    if (filters.registration === "open" && !isRegistrationOpen(entry, now)) {
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
              : "這個條件下沒有賽事，試試其他系列或看全部。"}
          </p>
        ) : filters.view === "calendar" ? (
          <RaceCalendar anchor={anchor} entries={entries} now={now} />
        ) : (
          <RaceList
            canWriteReport={Boolean(user)}
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
          says plainly which source wins. */}
      <p className="mt-12 border-t-2 border-border pt-4 text-xs text-muted-foreground">
        賽事日期與報名資訊以主辦單位官方公告為準。發現有誤請告訴我們。
      </p>
    </div>
  );
}
