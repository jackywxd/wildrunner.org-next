import type { SiteRaceScheduleEntry } from "@/lib/content-types";
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
 */
export function RaceList({
  canWriteReport = false,
  entries,
  now,
}: {
  canWriteReport?: boolean;
  entries: SiteRaceScheduleEntry[];
  now: Date;
}) {
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

        return (
          <section data-month={key} key={key}>
            <h2 className="font-heading text-sm font-semibold tracking-wide text-foreground/70">
              {year} 年 {Number(month)} 月
            </h2>
            <ul className="mt-3 space-y-3">
              {sorted.map((entry) => (
                <RaceEntryRow
                  canWriteReport={canWriteReport}
                  entry={entry}
                  key={entry.id}
                  now={now}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
