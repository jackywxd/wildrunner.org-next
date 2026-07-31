import type { SiteRaceRecord } from "@/lib/content-types";
import { RaceBadge } from "@/lib/races/badge";
import {
  RACE_SERIES_LABELS,
  findRaceEvent,
} from "@/lib/races/catalogue";
import type { RaceSeries } from "@/lib/races/catalogue";

/**
 * One badge per event, showing the most recent year.
 *
 * A directory card has room for a handful of badges, and somebody who has
 * run the same race eight times would otherwise fill the row with eight
 * near-identical squares and crowd out every other race they have done. The
 * profile page shows the full history.
 */
function latestPerEvent(records: SiteRaceRecord[]): SiteRaceRecord[] {
  const best = new Map<string, SiteRaceRecord>();
  for (const record of records) {
    const current = best.get(record.eventId);
    if (!current || record.year > current.year) best.set(record.eventId, record);
  }
  return [...best.values()].sort(
    (a, b) => b.year - a.year || a.eventId.localeCompare(b.eventId),
  );
}

/** Compact row for a directory card. */
export function RiderBadgeRow({
  limit = 5,
  records,
}: {
  limit?: number;
  records: SiteRaceRecord[];
}) {
  // No empty container when there is nothing to show — an unexplained gap
  // under half the cards reads as a broken layout (D-T6).
  if (records.length === 0) return null;

  const collapsed = latestPerEvent(records);
  const shown = collapsed.slice(0, limit);
  const overflow = collapsed.length - shown.length;

  return (
    <div className="mt-2 flex items-center gap-1" data-testid="rider-badge-row">
      {shown.map((record) => (
        <RaceBadge
          key={record.id}
          distanceId={record.distanceId}
          eventId={record.eventId}
          size={32}
          year={record.year}
        />
      ))}
      {overflow > 0 && (
        <span
          className="ml-1 text-xs text-muted-foreground"
          data-testid="rider-badge-overflow"
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}

const SERIES_ORDER: RaceSeries[] = ["utmb", "wtm"];

/** Full history for a profile page, grouped by series. */
export function RiderBadgeWall({ records }: { records: SiteRaceRecord[] }) {
  if (records.length === 0) return null;

  const groups = SERIES_ORDER.map((series) => ({
    records: records.filter(
      (record) => findRaceEvent(record.eventId)?.series === series,
    ),
    series,
  })).filter((group) => group.records.length > 0);

  // Every record whose event is no longer in the catalogue. They still
  // belong to the member, so they are shown rather than silently dropped —
  // the badge renders a neutral placeholder for them (A-T4).
  const unknown = records.filter((record) => !findRaceEvent(record.eventId));

  return (
    <section className="space-y-6" data-testid="rider-badge-wall">
      {groups.map((group) => (
        <div key={group.series}>
          <h2 className="font-heading text-sm font-semibold text-foreground/70">
            {RACE_SERIES_LABELS[group.series]}
          </h2>
          <div
            className="mt-3 flex flex-wrap gap-3"
            data-series={group.series}
            data-testid="rider-badge-group"
          >
            {group.records.map((record) => (
              <RaceBadge
                key={record.id}
                distanceId={record.distanceId}
                eventId={record.eventId}
                size={72}
                year={record.year}
              />
            ))}
          </div>
        </div>
      ))}

      {unknown.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3" data-testid="rider-badge-unknown">
          {unknown.map((record) => (
            <RaceBadge
              key={record.id}
              distanceId={record.distanceId}
              eventId={record.eventId}
              size={72}
              year={record.year}
            />
          ))}
        </div>
      )}
    </section>
  );
}
