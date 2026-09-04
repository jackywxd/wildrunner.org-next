import type { SiteRaceScheduleEntry } from "@/lib/content-types";
import {
  entriesByDate,
  monthGrid,
  monthsInWindow,
  toDateString,
} from "@/lib/races/calendar";
import { isFinished } from "@/lib/races/race-state";
import { isRegistrationOpen } from "@/lib/races/registration";
import { cn } from "@/lib/utils";
import { getDictionary } from "@/lib/i18n/dictionary";

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


export async function RaceCalendar({
  anchor,
  entries,
  months = 12,
  now,
}: {
  /** Same anchor the list was queried with, so both show one window. */
  anchor?: string;
  entries: SiteRaceScheduleEntry[];
  months?: number;
  now: Date;
}) {
  const t = await getDictionary();
  const byDate = entriesByDate(entries);
  const today = toDateString(now);

  return (
    <div className="space-y-10" data-testid="race-calendar">
      {monthsInWindow(now, months, anchor).map((month) => {
        const cells = monthGrid(month);

        return (
          <section data-month={month.key} data-testid="race-calendar-month" key={month.key}>
            <h2 className="font-heading text-sm font-semibold tracking-wide text-foreground/70">
              {t.raceSchedule.yearMonth.replace("{year}", String(month.year)).replace("{month}", String(month.month))}
            </h2>

            <div className="mt-3 grid grid-cols-7 border-l border-t border-border">
              {t.raceSchedule.weekdays.map((label) => (
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
                        {/* Phone: a dot per race, filled when entry is open.
                            A continuation day is hollow for the same reason
                            the desktop chip recedes — so a run of dots does
                            not read as one long race when a second one
                            starts partway through it. */}
                        <span className="mt-1 flex flex-wrap gap-0.5 sm:hidden">
                          {dayEntries.map((entry) => (
                            <span
                              className={cn(
                                "block h-1.5 w-1.5",
                                entry.startDate === cell.date
                                  ? isRegistrationOpen(entry, now) &&
                                    !isFinished(entry, now)
                                    ? "bg-primary"
                                    : "bg-muted-foreground"
                                  : "border border-muted-foreground/50",
                              )}
                              key={entry.id}
                            />
                          ))}
                        </span>

                        <span className="mt-1 hidden flex-col gap-0.5 sm:flex">
                          {dayEntries.map((entry) => {
                            // A race that starts today is drawn solid; day
                            // 2..n of a multi-day race is drawn as a
                            // continuation.
                            //
                            // Without this, an eleven-day event repeats an
                            // identical chip in eleven consecutive cells,
                            // and a second race beginning inside that span
                            // is just one more chip in the stack — which is
                            // exactly how Squamish 50 went unnoticed
                            // underneath Ticino Wildlands 500. Receding the
                            // continuation days is what makes the day
                            // something *starts* legible.
                            const starts = entry.startDate === cell.date;
                            const done = isFinished(entry, now);

                            return (
                              <span
                                className={cn(
                                  "block truncate border-l-2 px-1 text-[10px] leading-tight",
                                  isRegistrationOpen(entry, now) && !done
                                    ? "border-l-primary bg-primary text-primary-foreground"
                                    : "border-l-muted-foreground/40 bg-muted-foreground/15 text-foreground",
                                  !starts &&
                                    "border-l-transparent bg-muted-foreground/5 text-muted-foreground",
                                  done && "opacity-60",
                                )}
                                data-continuation={starts ? "false" : "true"}
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
                            );
                          })}
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
