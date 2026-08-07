"use client";

import { useMemo } from "react";

import { RaceBadge } from "@/lib/races/badge";
import { resolveBadge } from "@/lib/races/badge-source";
import { catalogueMap } from "@/lib/races/catalogue-shape";
import type { CatalogueEvent } from "@/lib/races/catalogue-shape";
import type { RaceReportOption } from "@/lib/races/report-options";

const selectClass =
  "block w-full border border-input bg-background px-3 py-2 text-sm";

/**
 * The two selects a race report needs, and the badge they produce.
 *
 * Shared by both entry points — the 「紀錄比賽」 page and the picker inside
 * the editor — because both have to ask exactly the same pair of questions.
 * Which race, and which distance. Neither can be skipped: the schedule row
 * supplies the event and the year, the member supplies the distance, and a
 * badge needs all three.
 *
 * The badge renders live, before anything is saved. It is the whole point
 * of the feature and also the cheapest possible check that the member
 * picked the right row — a wrong year or a wrong distance is obvious in the
 * artwork in a way it is not in two dropdowns.
 */
export function RaceChoice({
  busy = false,
  catalogueEvents,
  distanceId,
  onDistance,
  onRace,
  options,
  scheduleId,
}: {
  busy?: boolean;
  /**
   * Plain and serializable — this crosses the server/client boundary as a
   * prop, so it cannot be the `Map` `resolveBadge` wants. Rebuilt into one
   * with `catalogueMap()` below, same as every server caller does.
   */
  catalogueEvents: CatalogueEvent[];
  distanceId: string;
  onDistance: (value: string) => void;
  onRace: (value: number | null) => void;
  options: RaceReportOption[];
  scheduleId: number | null;
}) {
  const catalogue = useMemo(
    () => catalogueMap(catalogueEvents),
    [catalogueEvents],
  );
  const chosen = options.find((option) => option.scheduleId === scheduleId);

  return (
    <div className="space-y-4" data-testid="race-choice">
      <label className="block space-y-1">
        <span className="text-sm">比賽</span>
        <select
          className={selectClass}
          data-testid="race-report-race"
          disabled={busy}
          onChange={(event) =>
            onRace(event.target.value ? Number(event.target.value) : null)
          }
          value={scheduleId ?? ""}
        >
          <option value="">選擇比賽…</option>
          {options.map((option) => (
            <option key={option.scheduleId} value={option.scheduleId}>
              {option.year}　{option.label}
              {option.sublabel ? `（${option.sublabel}）` : ""}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1">
        <span className="text-sm">組別</span>
        <select
          className={selectClass}
          data-testid="race-report-distance"
          // Disabled rather than hidden until a race is chosen: the field
          // staying in place is what tells the member a second answer is
          // coming, so the form does not appear to grow under them.
          disabled={busy || !chosen}
          onChange={(event) => onDistance(event.target.value)}
          value={distanceId}
        >
          <option value="">選擇組別…</option>
          {(chosen?.distances ?? []).map((distance) => (
            <option key={distance.id} value={distance.id}>
              {distance.label}
            </option>
          ))}
        </select>
      </label>

      {chosen && distanceId && (
        <div
          className="flex items-center gap-3 border border-border bg-secondary p-3"
          data-testid="race-report-preview"
        >
          <RaceBadge
            {...resolveBadge(catalogue, chosen.eventId, distanceId)}
            size={56}
            year={chosen.year}
          />
          <div className="min-w-0 text-sm">
            <p className="truncate font-semibold">{chosen.label}</p>
            <p className="text-xs text-muted-foreground">
              {chosen.year}
              {" · "}
              {chosen.distances.find((d) => d.id === distanceId)?.label}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
