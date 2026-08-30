import type { SiteRaceRecord } from "@/lib/content-types";
import { RaceBadge, SixMajorsBadge } from "@/lib/races/badge";
import { groupRecordsBySeries, resolveBadge } from "@/lib/races/badge-source";
import { catalogueMap, getRaceCatalogueEvents } from "@/lib/races/catalogue-db";
import type { RaceCatalogueMap } from "@/lib/races/catalogue-shape";
import { RACE_SERIES_LABELS } from "@/lib/races/catalogue";
import {
  SIX_MAJORS,
  SIX_MAJORS_LABEL_ZH,
  sixMajorsCompletion,
  sixMajorsMissing,
} from "@/lib/races/six-majors";

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

/**
 * Async, and deliberately so: it fetches the catalogue itself rather than
 * taking it as a prop. `getRaceCatalogueEvents()` is `React.cache`'d, so a
 * directory page rendering one of these per rider card still issues the
 * query once per request — the same guarantee `React.cache` already gives
 * `getCurrentUser()` elsewhere in this codebase.
 */

/**
 * "六大馬拉松 5/6 · 還差 紐約馬拉松", under the 馬拉松 heading.
 *
 * ONLY ON A PROFILE, not on a directory card. A card has room for a row of
 * badges and nothing else, and somebody else's unfinished set is not what a
 * directory is for.
 *
 * Names come from the catalogue, so a race renamed in /admin renames here
 * too; `nameZh` first, matching every other place the site shows a race to a
 * Chinese-reading visitor. Falling back to the key rather than dropping the
 * entry keeps the count and the list agreeing — a "5/6" listing four races
 * would be a worse bug than an ugly one listing five.
 */
function SixMajorsProgress({
  catalogue,
  missing,
}: {
  catalogue: RaceCatalogueMap;
  missing: readonly string[];
}) {
  const names = missing.map((key) => {
    const event = catalogue.get(key);
    return event?.nameZh ?? event?.name ?? key;
  });

  return (
    <p
      className="mt-1 text-xs text-muted-foreground"
      data-testid="six-majors-progress"
    >
      {SIX_MAJORS_LABEL_ZH} {SIX_MAJORS.length - missing.length}/
      {SIX_MAJORS.length} · 還差 {names.join("、")}
    </p>
  );
}

/** Compact row for a directory card. */
export async function RiderBadgeRow({
  limit = 5,
  records,
}: {
  limit?: number;
  records: SiteRaceRecord[];
}) {
  // No empty container when there is nothing to show — an unexplained gap
  // under half the cards reads as a broken layout (D-T6).
  if (records.length === 0) return null;

  const catalogue = catalogueMap(await getRaceCatalogueEvents());
  const collapsed = latestPerEvent(records);
  const shown = collapsed.slice(0, limit);
  const overflow = collapsed.length - shown.length;
  // Outside `limit` on purpose. Six Star is the rarest thing a card can say,
  // and letting it consume one of five slots would push a race off the row
  // to show it — paying for the headline with the story.
  const sixMajors = sixMajorsCompletion(records);

  return (
    <div className="mt-2 flex items-center gap-1" data-testid="rider-badge-row">
      {sixMajors !== undefined && <SixMajorsBadge size={32} year={sixMajors} />}
      {shown.map((record) => (
        <RaceBadge
          key={record.id}
          {...resolveBadge(catalogue, record.eventId, record.distanceId)}
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

/** Full history for a profile page, grouped by series. */
export async function RiderBadgeWall({ records }: { records: SiteRaceRecord[] }) {
  if (records.length === 0) return null;

  const catalogue = catalogueMap(await getRaceCatalogueEvents());

  // The grouping lives in badge-source.ts so it can be checked without a
  // browser — see U-GROUP in e2e/unit/badge-source.spec.ts.
  const { groups, unknown } = groupRecordsBySeries(catalogue, records);
  const sixMajors = sixMajorsCompletion(records);
  const missingMajors = sixMajorsMissing(records);

  return (
    <section className="space-y-6" data-testid="rider-badge-wall">
      {/* Above the series groups, not inside one. The six majors sit in
          `others` in the catalogue, but the achievement is not a series —
          filing it under 「其他獨立賽事」 would bury the rarest badge on the
          page under the most ordinary heading. */}
      {sixMajors !== undefined && (
        <div data-testid="rider-badge-six-majors">
          <h2 className="font-heading text-sm font-semibold text-foreground/70">
            {SIX_MAJORS_LABEL_ZH}
          </h2>
          <div className="mt-3 flex flex-wrap gap-3">
            <SixMajorsBadge size={72} year={sixMajors} />
          </div>
        </div>
      )}

      {groups.map((group) => (
        <div key={group.series}>
          <h2 className="font-heading text-sm font-semibold text-foreground/70">
            {RACE_SERIES_LABELS[group.series]}
          </h2>
          {/* Under the 馬拉松 heading rather than beside the achievement
              badge, because when it shows there IS no achievement badge —
              that is the whole point of it. */}
          {group.series === "marathon" && missingMajors.length > 0 && (
            <SixMajorsProgress catalogue={catalogue} missing={missingMajors} />
          )}
          <div
            className="mt-3 flex flex-wrap gap-3"
            data-series={group.series}
            data-testid="rider-badge-group"
          >
            {group.records.map((record) => (
              <RaceBadge
                key={record.id}
                {...resolveBadge(catalogue, record.eventId, record.distanceId)}
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
              {...resolveBadge(catalogue, record.eventId, record.distanceId)}
              size={72}
              year={record.year}
            />
          ))}
        </div>
      )}
    </section>
  );
}
