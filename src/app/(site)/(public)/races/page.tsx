import PageHeader from "@/components/page-header";
import { RaceCalendar } from "@/components/race-schedule/RaceCalendar";
import { RaceList } from "@/components/race-schedule/RaceList";
import {
  RaceScheduleFilters,
  type RaceFilters,
  type RaceView,
} from "@/components/race-schedule/RaceScheduleFilters";
import { siteConfig } from "@/config/site";
import { getUpcomingRaces } from "@/lib/content";
import { RACE_SERIES } from "@/lib/races/catalogue";
import type { RaceSeries } from "@/lib/races/catalogue";
import { isRegistrationOpen } from "@/lib/races/registration";

export const dynamic = "force-dynamic";

const TITLE = "賽事日程";

export async function generateMetadata() {
  const baseURL = siteConfig.baseURL;
  const title = `${TITLE} | Race Schedule | ${siteConfig.title}`;
  const description = "未來一年的越野賽事日程，含報名開放與截止時間。";
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

function parseFilters(params: Record<string, string | string[] | undefined>): RaceFilters {
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
  const filters = parseFilters(await searchParams);

  // One clock for the whole render. Calling `new Date()` inside each row
  // would let a race straddling midnight be evaluated against two different
  // days within the same page.
  const now = new Date();
  const all = await getUpcomingRaces({ now });

  const entries = all.filter((entry) => {
    if (filters.series && entry.series !== filters.series) return false;
    if (filters.registration === "open" && !isRegistrationOpen(entry, now)) {
      return false;
    }
    return true;
  });

  return (
    <div className="container max-w-4xl py-6 lg:py-10" data-testid="race-schedule">
      <PageHeader
        title={TITLE}
        description="未來一年的越野賽事，含 UTMB 世界系列賽、World Trail Majors 與其他獨立賽事。"
      />
      <hr className="my-8 h-0 border-t-2 border-border" />

      <RaceScheduleFilters filters={filters} />

      <div className="mt-8">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="race-schedule-empty">
            還沒有公布的賽事日程。
          </p>
        ) : filters.view === "calendar" ? (
          <RaceCalendar entries={entries} now={now} />
        ) : (
          <RaceList entries={entries} now={now} />
        )}
      </div>

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
