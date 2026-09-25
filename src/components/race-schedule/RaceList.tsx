import { ChevronDown } from "lucide-react";

import type { SiteRaceScheduleEntry } from "@/lib/content-types";
import type { RaceCatalogueMap } from "@/lib/races/catalogue-db";
import { getDictionary } from "@/lib/i18n/dictionary";
import { foldFinished } from "@/lib/races/race-state";
import { isRegistrationOpen } from "@/lib/races/registration";

import { RaceEntryRow } from "./RaceEntryRow";

/**
 * The schedule as a list, grouped by month.
 *
 * The default view, and the one that answers "what is next". A twelve-month
 * grid does not fit a phone, and most visitors want the next handful of
 * races rather than a year at a glance.
 *
 * Within a month, races that are open for entry float to the top; the
 * months themselves stay in date order. Reordering across months would
 * break the one thing a schedule has to get right.
 *
 * FINISHED RACES FOLD, ON THE DEFAULT WINDOW ONLY. That window starts on the
 * first of this month, so late in a month a phone opened on a screen of
 * 「已結束」 rows and had to scroll past up to a dozen of them to reach what
 * is next. In a month that still has races to come, the finished ones go
 * behind one `<details>` at the foot of the month — server-rendered, no
 * script, one tap to open. A month with nothing left to come is shown in
 * full, and so is every window addressed with `?from=`: somebody who paged
 * or linked to a month asked for all of it, and race-report.spec.ts relies
 * on exactly that to find a finished row.
 */
export async function RaceList({
  canWriteReport = false,
  catalogue,
  collapseFinished = false,
  entries,
  now,
}: {
  canWriteReport?: boolean;
  collapseFinished?: boolean;
  catalogue: RaceCatalogueMap;
  entries: SiteRaceScheduleEntry[];
  now: Date;
}) {
  const t = await getDictionary();
  const months = new Map<string, SiteRaceScheduleEntry[]>();
  for (const entry of entries) {
    const key = entry.startDate.slice(0, 7);
    const bucket = months.get(key);
    if (bucket) bucket.push(entry);
    else months.set(key, [entry]);
  }

  return (
    <div className="space-y-10" data-testid="race-list">
      {Array.from(months.entries()).map(([key, monthEntries]) => {
        const [year, month] = key.split("-");
        const sorted = [...monthEntries].sort((a, b) => {
          const openDelta =
            Number(isRegistrationOpen(b, now)) - Number(isRegistrationOpen(a, now));
          return openDelta || a.startDate.localeCompare(b.startDate);
        });

        const { shown, folded } = foldFinished(sorted, now, collapseFinished);
        const row = (entry: SiteRaceScheduleEntry) => (
          <RaceEntryRow
            canWriteReport={canWriteReport}
            catalogue={catalogue}
            entry={entry}
            key={entry.id}
            now={now}
          />
        );

        return (
          <section data-month={key} key={key}>
            <h2 className="font-heading text-sm font-semibold tracking-wide text-foreground/70">
              {t.raceSchedule.yearMonth
                .replace("{year}", year)
                .replace("{month}", String(Number(month)))}
            </h2>
            <ul className="mt-3 space-y-3">{shown.map(row)}</ul>
            {folded.length > 0 && (
              <details className="group mt-3" data-testid="race-list-finished">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 border border-dashed border-border px-4 text-sm text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                  <ChevronDown
                    aria-hidden
                    className="size-4 transition-transform group-open:rotate-180"
                  />
                  {t.raceSchedule.finishedCollapsed.replace(
                    "{count}",
                    String(folded.length),
                  )}
                </summary>
                <ul className="mt-3 space-y-3">{folded.map(row)}</ul>
              </details>
            )}
          </section>
        );
      })}
    </div>
  );
}
