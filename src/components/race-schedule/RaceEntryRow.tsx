import type { SiteRaceScheduleEntry } from "@/lib/content-types";
import { externalHref, isRegistrationOpen } from "@/lib/races/registration";
import { cn } from "@/lib/utils";

import { RaceSeriesTag } from "./RaceSeriesTag";
import { RegistrationStatus } from "./RegistrationStatus";

/**
 * One race, rendered the same way on `/races` and on the homepage teaser.
 *
 * Shared rather than duplicated so a formatting change — how a date range
 * reads, where the registration chip sits — lands in both places at once.
 *
 * NO BADGE. `RaceBadge` needs an event *and a distance*, and a schedule row
 * has no single distance: a race offering 20K through 100M is one row. The
 * options were to invent a distance or leave the badge out, and inventing
 * one would put a claim on the page the data does not support. The series
 * tag carries the same grouping information without the fabrication.
 */

/** "2026-08-28" -> "8月28日". */
function formatDay(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

function formatRange(entry: SiteRaceScheduleEntry): string {
  if (!entry.endDate || entry.endDate === entry.startDate) {
    return formatDay(entry.startDate);
  }
  // Same month reads better without repeating it: 8月28日–30日.
  const sameMonth = entry.endDate.slice(0, 7) === entry.startDate.slice(0, 7);
  const end = sameMonth
    ? `${Number(entry.endDate.slice(8, 10))}日`
    : formatDay(entry.endDate);
  return `${formatDay(entry.startDate)}–${end}`;
}

export function RaceEntryRow({
  entry,
  now,
}: {
  entry: SiteRaceScheduleEntry;
  now: Date;
}) {
  // Highlighting is never colour alone: the row accent below always comes
  // with the "報名中" label inside RegistrationStatus, and with the
  // data-registration-state attribute.
  const open = isRegistrationOpen(entry, now);
  const place = [entry.location, entry.country].filter(Boolean).join(" · ");
  const site = externalHref(entry.url);

  return (
    <li
      className={cn(
        "flex flex-col gap-2 border border-border bg-secondary p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6",
        open && "border-l-4 border-l-primary bg-primary/5",
      )}
      data-race-id={entry.id}
      data-series={entry.series}
      data-start-date={entry.startDate}
      data-testid="race-list-item"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-heading text-sm font-semibold tabular-nums text-foreground/70">
            {formatRange(entry)}
          </span>
          <RaceSeriesTag series={entry.series} />
        </div>

        <h3 className="font-heading text-lg font-semibold leading-snug">
          {site ? (
            <a
              className="hover:text-primary"
              href={site}
              rel="noopener noreferrer"
              target="_blank"
            >
              {entry.nameZh || entry.name}
            </a>
          ) : (
            (entry.nameZh || entry.name)
          )}
        </h3>

        {/* The English name is kept alongside a Chinese one: entry lists,
            results and every search a runner does use the original. */}
        {entry.nameZh && (
          <p className="text-xs text-muted-foreground">{entry.name}</p>
        )}

        <p className="text-sm text-muted-foreground">
          {[place, entry.distanceSummary].filter(Boolean).join("　|　")}
        </p>

        {entry.notes && (
          <p className="text-xs text-muted-foreground">{entry.notes}</p>
        )}
      </div>

      <RegistrationStatus
        className="shrink-0 sm:flex-col sm:items-end"
        entry={entry}
        now={now}
      />
    </li>
  );
}
