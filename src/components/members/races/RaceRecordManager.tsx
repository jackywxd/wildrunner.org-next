"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  RaceClaimFields,
  emptyRaceClaim,
  raceClaimComplete,
} from "@/components/members/races/RaceClaimFields";
import { RaceBadge } from "@/lib/races/badge";
import { resolveBadge } from "@/lib/races/badge-source";
import { catalogueMap } from "@/lib/races/catalogue-shape";
import type { CatalogueEvent } from "@/lib/races/catalogue-shape";

export type MemberRaceRecord = {
  distanceId: string;
  eventId: string;
  id: number;
  year: number;
};

export function RaceRecordManager({
  catalogueEvents,
  records: initial,
}: {
  catalogueEvents: CatalogueEvent[];
  records: MemberRaceRecord[];
}) {
  const [records, setRecords] = useState(initial);
  // The four selects live in `RaceClaimFields`, shared with the post editor's
  // picker — see that file for why asking this question in two different ways
  // was the bug.
  const [claim, setClaim] = useState(() => emptyRaceClaim(new Date()));
  const { distanceId, eventId, year } = claim;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const catalogue = useMemo(
    () => catalogueMap(catalogueEvents),
    [catalogueEvents],
  );

  async function add() {
    if (!raceClaimComplete(claim)) return;
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

        <RaceClaimFields
          busy={busy}
          catalogueEvents={catalogueEvents}
          onChange={setClaim}
          value={claim}
        />

        {error && (
          <p className="text-sm text-destructive" data-testid="race-record-error">
            {error}
          </p>
        )}

        <div className="flex justify-end">
          <Button
            className="justify-center"
            data-testid="race-record-add"
            disabled={busy || !raceClaimComplete(claim)}
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
