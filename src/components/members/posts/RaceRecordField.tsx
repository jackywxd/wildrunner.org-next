"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { RaceChoice } from "@/components/members/posts/RaceChoice";
import { RaceBadge } from "@/lib/races/badge";
import { resolveBadge } from "@/lib/races/badge-source";
import { ensureRaceRecord } from "@/lib/members/race-records";
import type { RaceReportOption } from "@/lib/races/report-options";

export type LinkedRace = {
  distanceId: string;
  eventId: string;
  label: string;
  recordId: number;
  year: number;
};

/**
 * The second entry point: attaching a race to a post already being written.
 *
 * The first is the 「紀錄比賽」 button on /races, which starts from the race.
 * This one starts from the post — somebody who opened the editor, wrote
 * half a report, and only then thought to link the race. Same two
 * questions, same shared `RaceChoice`, and the same rule about which races
 * are offered: only ones that have already been run, because 只有過去的比賽
 * 可以寫賽記.
 *
 * The record is created the moment the member confirms, not deferred to
 * the post's save. Two reasons. The badge appears immediately, which is
 * what makes the link feel real; and a record is worth having on its own
 * even if the draft is abandoned — see the header of StartRaceReport.
 */
export function RaceRecordField({
  linked,
  onChange,
  options,
  ownerId,
}: {
  linked: LinkedRace | null;
  /** `null` detaches. The editor holds the value; this only proposes changes. */
  onChange: (value: LinkedRace | null) => void;
  options: RaceReportOption[];
  ownerId: number;
}) {
  const [open, setOpen] = useState(false);
  const [scheduleId, setScheduleId] = useState<number | null>(null);
  const [distanceId, setDistanceId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const chosen = options.find((option) => option.scheduleId === scheduleId);

  function chooseRace(next: number | null) {
    setScheduleId(next);
    const option = options.find((o) => o.scheduleId === next);
    setDistanceId(
      option && option.distances.length === 1 ? option.distances[0].id : "",
    );
  }

  function close() {
    setOpen(false);
    setScheduleId(null);
    setDistanceId("");
    setError(null);
  }

  async function attach() {
    if (!chosen || !distanceId) return;
    setBusy(true);
    setError(null);

    const record = await ensureRaceRecord({
      distanceId,
      eventId: chosen.eventId,
      ownerId,
      year: chosen.year,
    });
    setBusy(false);

    if (!record.ok) {
      setError(record.message);
      return;
    }

    onChange({
      distanceId,
      eventId: chosen.eventId,
      label: chosen.label,
      recordId: record.id,
      year: chosen.year,
    });
    close();
  }

  return (
    <div className="space-y-3 border border-border p-4" data-testid="post-race">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-foreground/60">賽事</span>
        {linked && !open && (
          <button
            className="text-xs text-foreground/40 hover:text-destructive"
            data-testid="post-race-detach"
            onClick={() => onChange(null)}
            type="button"
          >
            移除
          </button>
        )}
      </div>

      {linked && !open ? (
        <div className="flex items-center gap-3" data-testid="post-race-linked">
          <RaceBadge
            {...resolveBadge(linked.eventId, linked.distanceId)}
            size={48}
            year={linked.year}
          />
          <div className="min-w-0 flex-1 text-sm">
            <p className="truncate font-semibold">{linked.label}</p>
            <p className="text-xs text-muted-foreground">{linked.year}</p>
          </div>
          <button
            className="text-xs text-foreground/50 hover:text-foreground"
            data-testid="post-race-change"
            onClick={() => setOpen(true)}
            type="button"
          >
            更換
          </button>
        </div>
      ) : null}

      {!linked && !open ? (
        <div className="space-y-2">
          <p className="text-xs text-foreground/50">
            這篇是賽記嗎？連結一場比賽就會顯示徽章。
          </p>
          <Button
            className="justify-center"
            data-testid="post-race-attach"
            disabled={options.length === 0}
            onClick={() => setOpen(true)}
            size="sm"
            variant="outline"
          >
            {options.length === 0 ? "還沒有結束的比賽" : "連結比賽"}
          </Button>
        </div>
      ) : null}

      {open && (
        <div className="space-y-3">
          <RaceChoice
            busy={busy}
            distanceId={distanceId}
            onDistance={setDistanceId}
            onRace={chooseRace}
            options={options}
            scheduleId={scheduleId}
          />

          {error && (
            <p className="text-sm text-destructive" data-testid="post-race-error">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              className="justify-center"
              disabled={busy}
              onClick={close}
              size="sm"
              variant="outline"
            >
              取消
            </Button>
            <Button
              className="justify-center"
              data-testid="post-race-confirm"
              disabled={busy || !chosen || !distanceId}
              onClick={attach}
              size="sm"
            >
              {busy ? "處理中…" : "確定"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
