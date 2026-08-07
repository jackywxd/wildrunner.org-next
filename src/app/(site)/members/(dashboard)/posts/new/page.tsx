import Link from "next/link";

import { StartRaceReport } from "@/components/members/posts/StartRaceReport";
import { requireMember } from "@/lib/auth";
import { getFinishedRaces } from "@/lib/content";
import { catalogueMap, getRaceCatalogueEvents } from "@/lib/races/catalogue-db";
import { reportOptions } from "@/lib/races/report-options";

export const dynamic = "force-dynamic";

/**
 * Where 「紀錄比賽」 on /races lands.
 *
 * It exists because of one gap: the schedule row the member clicked knows
 * the event and the year, but not which distance they ran, and a badge
 * cannot be drawn without it. So this page asks that single question and
 * then creates both things at once — the race record (the badge) and the
 * draft post pointing at it — before handing the member to the editor.
 *
 * Deliberately a page with a button rather than an action taken on
 * navigation. Creating a post as a side effect of a GET means a refresh, a
 * prefetch or a crawler leaves untitled drafts behind, and the member would
 * arrive in the editor with no chance to notice they clicked the wrong
 * race.
 *
 * `?race=&year=` is a hint, not a requirement. Arriving without either — or
 * with a pair that matches nothing — shows the same list the picker in the
 * editor shows, which is the second of the two entry points and the reason
 * this page takes the full set rather than one row.
 */
export default async function NewRaceReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireMember();
  const params = await searchParams;

  const now = new Date();
  const [finishedRaces, catalogueEvents] = await Promise.all([
    getFinishedRaces(now),
    getRaceCatalogueEvents(),
  ]);
  const options = reportOptions(catalogueMap(catalogueEvents), finishedRaces, now);

  // `race` + `year`, not a raw row id: RaceEntryRow.tsx links here from
  // `/races`, which reads `race-editions` — a different table, and a
  // different id space, than `options` below (`getFinishedRaces`, still
  // `race-schedule`, #41). eventId is the identifier both agree on.
  const rawRace = Array.isArray(params.race) ? params.race[0] : params.race;
  const rawYear = Array.isArray(params.year) ? params.year[0] : params.year;
  const requestedYear = rawYear ? Number(rawYear) : NaN;
  // A pair that matches nothing simply preselects nothing. It is a stale
  // bookmark or a deleted row, not an error worth a 404 — the list below
  // still lets the member pick.
  const match = rawRace
    ? options.find(
        (option) => option.eventId === rawRace && option.year === requestedYear,
      )
    : undefined;
  const preselected = match?.scheduleId;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">紀錄比賽</h1>
        <p className="mt-2 text-sm text-foreground/60">
          選一場已經結束的比賽和你跑的組別，我們會建立比賽紀錄和一篇草稿，
          接著就可以開始寫了。
        </p>
      </div>

      {options.length === 0 ? (
        <div className="space-y-3 border border-border p-4">
          <p className="text-sm text-foreground/60" data-testid="race-report-empty">
            目前日程上還沒有結束的比賽。只有已經跑完的比賽可以寫賽記。
          </p>
          <Link
            className="inline-block text-sm text-primary hover:underline"
            href="/races"
          >
            看賽事日程 →
          </Link>
        </div>
      ) : (
        <StartRaceReport
          catalogueEvents={catalogueEvents}
          options={options}
          ownerId={user.id}
          preselected={preselected}
        />
      )}

      <Link
        className="inline-block text-sm text-foreground/50 hover:text-foreground"
        href="/members/posts"
      >
        ← 回到文章列表
      </Link>
    </div>
  );
}
