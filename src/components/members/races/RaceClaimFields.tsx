"use client";

import { useMemo } from "react";

import {
  RACE_SERIES,
  RACE_SERIES_LABELS,
  raceYearOptions,
} from "@/lib/races/catalogue";
import type { RaceSeries } from "@/lib/races/catalogue";
import { catalogueMap, eventsBySeries } from "@/lib/races/catalogue-shape";
import type { CatalogueEvent } from "@/lib/races/catalogue-shape";

/**
 * The four answers a race record is made of: series, event, distance, year.
 *
 * ONE DEFINITION, BECAUSE TWO ENTRY POINTS ASKING DIFFERENTLY IS THE BUG THIS
 * FIXES. /members/races has always asked exactly this — the catalogue, plus a
 * year from `raceYearOptions` — while the picker inside the post editor asked
 * a different question entirely: "which *finished schedule row*", built from
 * `race-editions`. Those two are not the same set and were never going to be.
 * Measured on 2026-09-02: every environment's `race_editions` table holds only
 * 2026 and 2027 (39 and 38 rows; production, staging and local agree), of
 * which 14 had started. So a member who ran UTMB in 2019 could log it on
 * /members/races and could not link it from the article they were writing
 * about it — the editor offered 2026 and nothing else, and looked for all the
 * world like a filter somebody had left on.
 *
 * WHAT IS DELIBERATELY NOT ENFORCED HERE: that the race has already been run.
 * The old editor picker took that from `isFinished` on the schedule row, and
 * it was the right rule for a *schedule*. A claim against the catalogue has no
 * schedule row to consult — that is the whole point, since the ones this now
 * reaches were never on it — so the rule that governs is `race-records`' own:
 * `EARLIEST_RACE_YEAR` (2010) through next year, which `raceYearOptions`
 * renders and the collection validates. Next year is allowed there on purpose,
 * and its reason is written down in RaceRecords.ts: entries open well ahead.
 *
 * A MISSING EDITION IS THE EXPECTED PATH, not an error to guard against.
 * `populateRaceRecordRefs` find-or-creates the `race-editions` row for
 * (event, year) on write, using nothing but those two values — see its header,
 * which names "a member claiming a 2015 Hardrock" as the case it exists for.
 */

const selectClass =
  "block w-full border border-input bg-background px-3 py-2 text-sm";

export type RaceClaim = {
  distanceId: string;
  eventId: string;
  series: RaceSeries;
  year: number;
};

/** A blank claim, with the year defaulted to now — the answer that is right
 *  far more often than any other, and the only one of the four that has a
 *  sensible default at all. */
export function emptyRaceClaim(now: Date): RaceClaim {
  return {
    distanceId: "",
    eventId: "",
    series: "utmb",
    year: now.getUTCFullYear(),
  };
}

/** Whether the claim names a real race a record could be written from. */
export function raceClaimComplete(claim: RaceClaim): boolean {
  return Boolean(claim.eventId && claim.distanceId);
}

/**
 * Whether the claim names a race at all, distance aside.
 *
 * What a `withDistance={false}` caller needs, and it is a genuinely weaker
 * question rather than a convenience: a photo is *of* the 2019 UTMB and makes
 * no claim about which entry anybody ran. `raceClaimComplete` would refuse a
 * perfectly good tag for a field that caller never renders.
 */
export function raceClaimNamesEvent(claim: RaceClaim): boolean {
  return Boolean(claim.eventId);
}

export function RaceClaimFields({
  busy = false,
  catalogueEvents,
  onChange,
  value,
  withDistance = true,
}: {
  busy?: boolean;
  /**
   * Plain and serializable — this crosses the server/client boundary as a
   * prop, so it cannot be the `Map` the helpers want. Rebuilt into one below,
   * the same way every other caller does.
   */
  catalogueEvents: CatalogueEvent[];
  onChange: (next: RaceClaim) => void;
  value: RaceClaim;
  /**
   * Off for the media library, which tags a photo with a race and a year.
   *
   * A photo asserts nothing about distance — `resolveRaceRecordRefs` takes
   * `distanceId` as optional for the same reason — and asking for one would
   * make a member choose between 100M and 50K to caption a picture of a
   * finish line. It is a prop rather than a fourth `RaceEditionPicker`
   * because of this file's header: two entry points asking the same question
   * differently is the bug this component exists to have fixed once.
   */
  withDistance?: boolean;
}) {
  const catalogue = useMemo(
    () => catalogueMap(catalogueEvents),
    [catalogueEvents],
  );
  const events = useMemo(
    () =>
      [...eventsBySeries(catalogueEvents, value.series)].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    [catalogueEvents, value.series],
  );
  const event = value.eventId ? catalogue.get(value.eventId) : undefined;

  // Built once per mount rather than per render: it only changes at a year
  // boundary, and rebuilding it would churn without changing anything.
  const years = useMemo(() => raceYearOptions(new Date()), []);

  function chooseSeries(series: RaceSeries) {
    // The previous event belongs to the other series, and its distances
    // certainly do — clearing both is the only coherent state.
    onChange({ ...value, series, eventId: "", distanceId: "" });
  }

  function chooseEvent(eventId: string) {
    const chosen = catalogue.get(eventId);
    onChange({
      ...value,
      eventId,
      // Auto-picked only when there is nothing to pick. Western States runs
      // 100M and nothing else; making the member confirm that is friction
      // with no decision behind it.
      distanceId:
        chosen && chosen.distances.length === 1 ? chosen.distances[0].id : "",
    });
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block space-y-1">
        <span className="text-sm">系列</span>
        <select
          className={selectClass}
          data-testid="race-series-select"
          disabled={busy}
          onChange={(e) => chooseSeries(e.target.value as RaceSeries)}
          value={value.series}
        >
          {RACE_SERIES.map((series) => (
            <option key={series} value={series}>
              {RACE_SERIES_LABELS[series]}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1">
        <span className="text-sm">賽事</span>
        <select
          className={selectClass}
          data-testid="race-event-select"
          disabled={busy}
          onChange={(e) => chooseEvent(e.target.value)}
          value={value.eventId}
        >
          <option value="">選擇賽事…</option>
          {events.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
              {option.country ? `（${option.country}）` : ""}
            </option>
          ))}
        </select>
      </label>

      {withDistance && (
        <label className="block space-y-1">
          <span className="text-sm">距離</span>
          <select
            className={selectClass}
            data-testid="race-distance-select"
            disabled={busy || !event}
            onChange={(e) => onChange({ ...value, distanceId: e.target.value })}
            value={value.distanceId}
          >
            <option value="">選擇距離…</option>
            {(event?.distances ?? []).map((distance) => (
              <option key={distance.id} value={distance.id}>
                {distance.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="block space-y-1">
        <span className="text-sm">年份</span>
        <select
          className={selectClass}
          data-testid="race-year-select"
          disabled={busy}
          onChange={(e) => onChange({ ...value, year: Number(e.target.value) })}
          value={value.year}
        >
          {years.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
