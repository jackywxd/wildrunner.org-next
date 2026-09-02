"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { RaceBadge } from "@/lib/races/badge";
import { resolveBadge } from "@/lib/races/badge-source";
import {
  RACE_SERIES,
  RACE_SERIES_LABELS,
  raceYearOptions,
} from "@/lib/races/catalogue";
import type { RaceSeries } from "@/lib/races/catalogue";
import {
  catalogueMap,
  eventsBySeries as eventsInSeries,
} from "@/lib/races/catalogue-shape";
import type { CatalogueEvent } from "@/lib/races/catalogue-shape";

export type MemberRaceRecord = {
  distanceId: string;
  eventId: string;
  id: number;
  year: number;
};

const selectClass =
  "block w-full border border-input bg-background px-3 py-2 text-sm";

export function RaceRecordManager({
  catalogueEvents,
  records: initial,
}: {
  catalogueEvents: CatalogueEvent[];
  records: MemberRaceRecord[];
}) {
  const [records, setRecords] = useState(initial);
  const [series, setSeries] = useState<RaceSeries>("utmb");
  const [eventId, setEventId] = useState("");
  const [distanceId, setDistanceId] = useState("");
  const [year, setYear] = useState<number>(() => new Date().getUTCFullYear());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const catalogue = useMemo(
    () => catalogueMap(catalogueEvents),
    [catalogueEvents],
  );
  const events = useMemo(
    () =>
      [...eventsInSeries(catalogueEvents, series)].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    [catalogueEvents, series],
  );
  const event = eventId ? catalogue.get(eventId) : undefined;

  // The year list is built once per mount rather than per render: it only
  // changes at a year boundary, and rebuilding it would reset nothing but
  // still churn.
  const years = useMemo(() => raceYearOptions(new Date()), []);

  function chooseSeries(next: RaceSeries) {
    setSeries(next);
    // The previous event belongs to the other series, and its distances
    // certainly do — clearing both is the only coherent state.
    setEventId("");
    setDistanceId("");
  }

  function chooseEvent(next: string) {
    setEventId(next);
    const chosen = catalogue.get(next);
    // Auto-pick when there is no choice to make (Western States runs 100M
    // and nothing else), otherwise force a deliberate pick.
    setDistanceId(
      chosen && chosen.distances.length === 1 ? chosen.distances[0].id : "",
    );
  }

  async function add() {
    if (!eventId || !distanceId) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/race-records", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ distanceId, eventId, year }),
      });

      if (!response.ok) {
        setError(await readError(response));
        return;
      }

      const body = (await response.json()) as { doc: MemberRaceRecord };
      setRecords((current) =>
        [...current, body.doc].sort((a, b) => b.year - a.year),
      );
      // The selection is deliberately left alone. Clearing it would fight
      // the common case — logging several years of the same race — and,
      // because it happens only once the request resolves, it would also
      // silently wipe a selection made while that request was in flight.
      // Success is visible in the list below, which is where the member is
      // looking anyway.
    } catch {
      setError("儲存失敗，請再試一次");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/race-records/${id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!response.ok) {
        setError("刪除失敗，請再試一次");
        return;
      }
      setRecords((current) => current.filter((record) => record.id !== id));
    } catch {
      // `add()` has always had this and `remove()` never did — found while
      // reading this function for an unrelated reason, not from a report.
      //
      // A refused delete sets the message above; a delete that failed at the
      // *network* threw straight out of here into an unhandled rejection
      // instead. The row stays either way, but in that second case nothing
      // tells the member anything: pressing 刪除 simply does nothing, which
      // is the one outcome this file otherwise never allows.
      setError("刪除失敗，請再試一次");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-8">
      <section className="space-y-4 border border-border p-4">
        <h2 className="font-heading text-sm font-semibold text-foreground/70">
          新增紀錄
        </h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm">系列</span>
            <select
              className={selectClass}
              data-testid="race-series-select"
              onChange={(e) => chooseSeries(e.target.value as RaceSeries)}
              value={series}
            >
              {RACE_SERIES.map((value) => (
                <option key={value} value={value}>
                  {RACE_SERIES_LABELS[value]}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-sm">賽事</span>
            <select
              className={selectClass}
              data-testid="race-event-select"
              onChange={(e) => chooseEvent(e.target.value)}
              value={eventId}
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

          <label className="block space-y-1">
            <span className="text-sm">距離</span>
            <select
              className={selectClass}
              data-testid="race-distance-select"
              disabled={!event}
              onChange={(e) => setDistanceId(e.target.value)}
              value={distanceId}
            >
              <option value="">選擇距離…</option>
              {(event?.distances ?? []).map((distance) => (
                <option key={distance.id} value={distance.id}>
                  {distance.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-sm">年份</span>
            <select
              className={selectClass}
              data-testid="race-year-select"
              onChange={(e) => setYear(Number(e.target.value))}
              value={year}
            >
              {years.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && (
          <p className="text-sm text-destructive" data-testid="race-record-error">
            {error}
          </p>
        )}

        <div className="flex justify-end">
          <Button
            className="justify-center"
            data-testid="race-record-add"
            disabled={busy || !eventId || !distanceId}
            onClick={add}
          >
            新增
          </Button>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-heading text-sm font-semibold text-foreground/70">
          我的紀錄（{records.length}）
        </h2>

        {records.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="race-record-empty">
            還沒有紀錄。
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2" data-testid="race-record-list">
            {records.map((record) => {
              const recordEvent = catalogue.get(record.eventId);
              return (
                <li
                  key={record.id}
                  className="flex items-center gap-3 border border-border bg-secondary p-3"
                  data-record-id={record.id}
                  data-testid="race-record-row"
                >
                  <RaceBadge
                    {...resolveBadge(catalogue, record.eventId, record.distanceId)}
                    size={56}
                    year={record.year}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {recordEvent?.name ?? record.eventId}
                    </p>
                    <p className="text-xs text-muted-foreground">{record.year}</p>
                  </div>
                  <button
                    className="px-2 py-1 text-xs text-muted-foreground hover:text-destructive"
                    data-testid="race-record-delete"
                    disabled={busy}
                    onClick={() => remove(record.id)}
                    type="button"
                  >
                    刪除
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      errors?: {
        data?: { errors?: { message?: string }[] };
        message?: string;
      }[];
    };
    const first = body.errors?.[0];
    // Payload nests field-level messages one level down; the duplicate guard
    // and the catalogue validators both land there, and those are the two
    // messages a member will actually see.
    return (
      first?.data?.errors?.[0]?.message ?? first?.message ?? "儲存失敗，請再試一次"
    );
  } catch {
    return "儲存失敗，請再試一次";
  }
}
