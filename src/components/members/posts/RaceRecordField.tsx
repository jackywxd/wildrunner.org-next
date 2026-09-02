"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  RaceClaimFields,
  emptyRaceClaim,
  raceClaimComplete,
  type RaceClaim,
} from "@/components/members/races/RaceClaimFields";
import { RaceBadge } from "@/lib/races/badge";
import { resolveBadge, resolveBadgeEvent } from "@/lib/races/badge-source";
import { catalogueMap } from "@/lib/races/catalogue-shape";
import type { CatalogueEvent } from "@/lib/races/catalogue-shape";
import { ensureRaceRecord } from "@/lib/members/race-records";
import type { RaceReportOption } from "@/lib/races/report-options";

export type LinkedRace = {
  distanceId: string;
  eventId: string;
  label: string;
  recordId: number;
  year: number;
};

const selectClass =
  "block w-full border border-input bg-background px-3 py-2 text-sm";

/**
 * The second entry point: attaching a race to a post already being written.
 *
 * The first is the 「紀錄比賽」 button on /races, which starts from a schedule
 * row and is right to. This one starts from the post — somebody who opened the
 * editor, wrote half a report, and only then thought to link the race.
 *
 * IT USED TO ASK A DIFFERENT QUESTION FROM /members/races, AND THAT WAS THE
 * BUG. It offered finished `race-editions` rows, which sounds like "races that
 * have been run" and is in fact "races somebody has entered into the reviewed
 * calendar". That table holds 2026 and 2027 and nothing else — 39 and 38 rows,
 * the same in production, staging and local — so on 2026-09-02 this control
 * could offer exactly 14 races, every one of them from this year, while
 * /members/races happily logged a 2015 Hardrock through
 * `RaceClaimFields`. Same member, same claim, two answers.
 *
 * So it asks the catalogue now, through that same component. What is left of
 * the schedule is the shortcut below: a finished race is far and away the
 * common case, and picking one fills the four fields in one gesture rather
 * than replacing them. `options` being empty is no longer a dead end — it
 * removes a convenience, not the feature.
 *
 * The record is created the moment the member confirms, not deferred to the
 * post's save. Two reasons. The badge appears immediately, which is what makes
 * the link feel real; and a record is worth having on its own even if the
 * draft is abandoned — see the header of StartRaceReport.
 */
export function RaceRecordField({
  catalogueEvents,
  linked,
  onChange,
  options,
  ownerId,
}: {
  catalogueEvents: CatalogueEvent[];
  linked: LinkedRace | null;
  /** `null` detaches. The editor holds the value; this only proposes changes. */
  onChange: (value: LinkedRace | null) => void;
  /** Finished races, offered as a shortcut only — see this file's header. */
  options: RaceReportOption[];
  ownerId: number;
}) {
  const catalogue = useMemo(
    () => catalogueMap(catalogueEvents),
    [catalogueEvents],
  );
  const [open, setOpen] = useState(false);
  const [claim, setClaim] = useState<RaceClaim>(() => emptyRaceClaim(new Date()));
  const [shortcut, setShortcut] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const complete = raceClaimComplete(claim);

  /**
   * Fill the four fields from a finished race.
   *
   * The series has to come with it: `RaceClaimFields` lists events within one
   * series, so writing an `eventId` without its series would leave the 賽事
   * select holding a value its own options do not contain — which renders as
   * an empty select over a claim that is actually complete.
   */
  function applyShortcut(scheduleId: string) {
    setShortcut(scheduleId);
    const option = options.find((o) => String(o.scheduleId) === scheduleId);
    if (!option) return;
    const event = catalogue.get(option.eventId);
    setClaim({
      distanceId:
        option.distances.length === 1 ? option.distances[0].id : "",
      eventId: option.eventId,
      series: event?.series ?? claim.series,
      year: option.year,
    });
  }

  function close() {
    setOpen(false);
    setClaim(emptyRaceClaim(new Date()));
    setShortcut("");
    setError(null);
  }

  async function attach() {
    if (!complete) return;
    setBusy(true);
    setError(null);

    const record = await ensureRaceRecord({
      distanceId: claim.distanceId,
      eventId: claim.eventId,
      ownerId,
      year: claim.year,
    });
    setBusy(false);

    if (!record.ok) {
      setError(record.message);
      return;
    }

    onChange({
      distanceId: claim.distanceId,
      eventId: claim.eventId,
      // From the catalogue, not from a schedule row: the record points at an
      // event, and most of what this can now reach has no schedule row at all.
      label: resolveBadgeEvent(catalogue, claim.eventId).name,
      recordId: record.id,
      year: claim.year,
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
            {...resolveBadge(catalogue, linked.eventId, linked.distanceId)}
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
            onClick={() => setOpen(true)}
            size="sm"
            variant="outline"
          >
            連結比賽
          </Button>
        </div>
      ) : null}

      {open && (
        <div className="space-y-3" data-testid="race-choice">
          {options.length > 0 && (
            <label className="block space-y-1">
              <span className="text-sm">最近結束的比賽</span>
              <select
                className={selectClass}
                data-testid="post-race-recent"
                disabled={busy}
                onChange={(event) => applyShortcut(event.target.value)}
                value={shortcut}
              >
                <option value="">直接在下面選擇…</option>
                {options.map((option) => (
                  <option key={option.scheduleId} value={option.scheduleId}>
                    {option.year}　{option.label}
                    {option.sublabel ? `（${option.sublabel}）` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          <RaceClaimFields
            busy={busy}
            catalogueEvents={catalogueEvents}
            onChange={(next) => {
              setClaim(next);
              // The shortcut described the old values; leaving it selected
              // would claim it still describes these.
              setShortcut("");
            }}
            value={claim}
          />

          {complete && (
            <div
              className="flex items-center gap-3 border border-border bg-secondary p-3"
              data-testid="race-report-preview"
            >
              <RaceBadge
                {...resolveBadge(catalogue, claim.eventId, claim.distanceId)}
                size={56}
                year={claim.year}
              />
              <div className="min-w-0 text-sm">
                <p className="truncate font-semibold">
                  {resolveBadgeEvent(catalogue, claim.eventId).name}
                </p>
                <p className="text-xs text-muted-foreground">{claim.year}</p>
              </div>
            </div>
          )}

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
              disabled={busy || !complete}
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
