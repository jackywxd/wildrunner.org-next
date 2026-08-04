import type { SiteRaceScheduleEntry } from "@/lib/content-types";
import {
  entriesByDate,
  monthGrid,
  monthsInWindow,
  toDateString,
} from "@/lib/races/calendar";
import { isRegistrationOpen } from "@/lib/races/registration";
import { cn } from "@/lib/utils";

/**
 * Twelve month blocks, built from Tailwind and the pure helpers in
 * calendar.ts — no calendar dependency was added for this.
 *
 * A server component: the whole grid is in the initial HTML, there is
 * nothing to hydrate, and the view toggle is a link rather than state.
 *
 * MOBILE. Seven columns on a phone leaves each cell about 45px wide, which
 * fits no race name at a legible size. Below `sm` the cells show a count
 * dot instead; the list view is the real answer on a small screen and the
 * toggle is right above.
 */

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export function RaceCalendar({
  entries,
  months = 12,
  now,
}: {
  entries: SiteRaceScheduleEntry[];
  months?: number;
  now: Date;
}) {
  const byDate = entriesByDate(entries);
  const today = toDateString(now);

  return (
    <div className="space-y-10" data-testid="race-calendar">
      {monthsInWindow(now, months).map((month) => {
        const cells = monthGrid(month);

        return (
          <section data-month={month.key} data-testid="race-calendar-month" key={month.key}>
            <h2 className="font-heading text-sm font-semibold tracking-wide text-foreground/70">
              {month.year} 年 {month.month} 月
            </h2>

            <div className="mt-3 grid grid-cols-7 border-l border-t border-border">
              {WEEKDAYS.map((label) => (
                <div
                  className="border-b border-r border-border bg-secondary px-1 py-1 text-center text-[11px] text-muted-foreground"
                  key={label}
                >
                  {label}
                </div>
              ))}

              {cells.map((cell) => {
                // Only days belonging to this month carry their races.
                //
                // A 42-cell grid borrows the first and last few days from
                // the adjacent months to square itself off. In a
                // single-month widget, drawing events in those borrowed
                // cells is a nicety; here twelve month blocks are stacked
                // on one page, so the borrowed cells are always *also*
                // rendered in their own month — and the race appeared
                // twice. Hardrock on 2027-07-09 showed up under June.
                const dayEntries = cell.inMonth ? (byDate.get(cell.date) ?? []) : [];
                const hasOpen = dayEntries.some((entry) =>
                  isRegistrationOpen(entry, now),
                );

                return (
                  <div
                    className={cn(
                      "min-h-[64px] border-b border-r border-border p-1 align-top sm:min-h-[84px]",
                      !cell.inMonth && "bg-muted/30 text-muted-foreground/50",
                      cell.date === today && "bg-primary/10",
                      hasOpen && "ring-1 ring-inset ring-primary/40",
                    )}
                    data-date={cell.date}
                    data-in-month={cell.inMonth ? "true" : "false"}
                    data-race-count={dayEntries.length}
                    data-testid="race-calendar-day"
                    key={cell.date}
                  >
                    <span
                      className={cn(
                        "block text-[11px] tabular-nums",
                        cell.date === today && "font-bold text-primary",
                      )}
                    >
                      {Number(cell.date.slice(8, 10))}
                    </span>

                    {dayEntries.length > 0 && (
                      <>
                        {/* Phone: a dot per race, filled when entry is open. */}
                        <span className="mt-1 flex flex-wrap gap-0.5 sm:hidden">
                          {dayEntries.map((entry) => (
                            <span
                              className={cn(
                                "block h-1.5 w-1.5",
                                isRegistrationOpen(entry, now)
                                  ? "bg-primary"
                                  : "bg-muted-foreground",
                              )}
                              key={entry.id}
                            />
                          ))}
                        </span>

                        <span className="mt-1 hidden flex-col gap-0.5 sm:flex">
                          {dayEntries.map((entry) => (
                            <span
                              className={cn(
                                "block truncate px-1 text-[10px] leading-tight",
                                isRegistrationOpen(entry, now)
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted-foreground/15 text-foreground",
                              )}
                              data-race-id={entry.id}
                              data-testid="race-calendar-event"
                              key={entry.id}
                              title={`${entry.nameZh || entry.name}${
                                entry.distanceSummary
                                  ? ` · ${entry.distanceSummary}`
                                  : ""
                              }`}
                            >
                              {entry.nameZh || entry.name}
                            </span>
                          ))}
                        </span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
