"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  RaceClaimFields,
  emptyRaceClaim,
  raceClaimComplete,
} from "@/components/members/races/RaceClaimFields";
import { UNLINK_FLAG } from "@/lib/members/race-record-unlink";
import { RaceBadge } from "@/lib/races/badge";
import {
  formatFinishTime,
  parseFinishTime,
} from "@/lib/races/finish-time";
import { resolveBadge } from "@/lib/races/badge-source";
import { catalogueMap } from "@/lib/races/catalogue-shape";
import type { CatalogueEvent } from "@/lib/races/catalogue-shape";

/**
 * What the finish-time box currently means.
 *
 * `null` from an empty box is "no time given", which is a legitimate finish.
 * `null` from a non-empty box is text that is not a time, and the member has
 * to be told rather than have it silently dropped. Shared by the add form and
 * the per-row editor, because those are the same two sentences and a second
 * copy is where they would stop agreeing.
 */
function deriveFinish(finishTime: string): {
  invalid: boolean;
  seconds: number | null;
} {
  const blank = finishTime.trim() === "";
  const seconds = blank ? null : parseFinishTime(finishTime);
  return { invalid: !blank && seconds === null, seconds };
}

export type MemberRaceRecord = {
  distanceId: string;
  eventId: string;
  /** Seconds. Absent on a DNF, and on a finish whose time was left blank. */
  finishSeconds?: number | null;
  id: number;
  /** Absent on every row written before `20260915_090000_add_race_record_result`. */
  result?: "finished" | "dnf" | null;
  year: number;
};

/**
 * 完賽狀態 and 完賽時間, for whichever form is asking.
 *
 * `idPrefix` exists because both forms are on screen at once when a row is
 * being edited, and two elements sharing a `data-testid` is a strict-mode
 * violation in every spec that reaches for one.
 */
function ResultFields({
  busy,
  finishTime,
  idPrefix,
  invalid,
  onFinishTime,
  onResult,
  result,
}: {
  busy: boolean;
  finishTime: string;
  idPrefix: string;
  invalid: boolean;
  onFinishTime: (value: string) => void;
  onResult: (value: "finished" | "dnf") => void;
  result: "finished" | "dnf";
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm">完賽狀態</span>
          <select
            className="block w-full border border-input bg-background px-3 py-2 text-base md:text-sm"
            data-testid={`${idPrefix}-result`}
            disabled={busy}
            onChange={(e) => onResult(e.target.value as "finished" | "dnf")}
            value={result}
          >
            <option value="finished">完賽</option>
            <option value="dnf">未完賽</option>
          </select>
        </label>

        {/* Only for a finish. A DNF has no finishing time, so the box is
            not disabled but absent — a greyed-out field invites a member to
            wonder what would fill it. */}
        {result === "finished" && (
          <label className="block space-y-1">
            <span className="text-sm">完賽時間（可留空）</span>
            <input
              aria-invalid={invalid}
              className="block w-full border border-input bg-background px-3 py-2 text-base md:text-sm"
              data-testid={`${idPrefix}-finish-time`}
              disabled={busy}
              inputMode="numeric"
              onChange={(e) => onFinishTime(e.target.value)}
              placeholder="38:42:15"
              value={finishTime}
            />
          </label>
        )}
      </div>

      {invalid && (
        <p
          className="text-sm text-destructive"
          data-testid={`${idPrefix}-finish-time-error`}
        >
          完賽時間請填 時:分:秒，例如 38:42:15
        </p>
      )}
    </>
  );
}

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
  // NOT part of `RaceClaim`, deliberately. That type answers "which race",
  // and its other three callers — the post editor's race picker and the two
  // media forms — are tagging something *with* a race rather than logging
  // how it went. Putting these there would have put a 完賽狀態 select into
  // the photo upload panel.
  const [result, setResult] = useState<"finished" | "dnf">("finished");
  const [finishTime, setFinishTime] = useState("");
  const { distanceId, eventId, year } = claim;

  const { invalid: finishTimeInvalid, seconds: parsedFinish } =
    deriveFinish(finishTime);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The record whose deletion the member has been warned about but not yet
  // confirmed. Held per row rather than as a single page-level banner so the
  // warning sits next to the record it is about — the list is a two-column
  // grid and a message at the top would not say which one.
  const [confirming, setConfirming] = useState<{
    id: number;
    message: string;
  } | null>(null);
  // The row being edited, and its own copy of the four answers. Separate
  // state from the add form on purpose: sharing it would mean opening an
  // editor wipes a claim the member was halfway through typing above.
  const [editing, setEditing] = useState<number | null>(null);
  const [editClaim, setEditClaim] = useState(() => emptyRaceClaim(new Date()));
  const [editResult, setEditResult] = useState<"finished" | "dnf">("finished");
  const [editFinishTime, setEditFinishTime] = useState("");
  const { invalid: editFinishInvalid, seconds: editParsedFinish } =
    deriveFinish(editFinishTime);

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
        body: JSON.stringify({
          distanceId,
          eventId,
          // Only on a finish. A DNF has no finishing time by construction,
          // and sending one from a box the member filled in before switching
          // the select would store a time against a race they did not finish.
          finishSeconds: result === "finished" ? parsedFinish : null,
          result,
          year,
        }),
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

  /**
   * Delete, in two steps when articles cite the record.
   *
   * The first press asks with no flag. The server refuses with a 409 that
   * counts the articles whose badge would disappear, and that count is what
   * the member is shown — a deletion that silently changes what readers see
   * on a published article is not theirs to assume. Pressing again sends
   * `unlinkArticles=true`, which is the server's cue to clear those
   * references and let the delete through.
   *
   * Asking the server rather than counting here: the count has to come from
   * the same query that will do the unlinking, or it can be stale by the
   * time the member reads it.
   */
  /**
   * Load a record into its own editor.
   *
   * `series` is not stored on the record — it is a property of the event in
   * the catalogue — but `RaceClaimFields` filters the event list by it, so
   * seeding it wrongly would open an editor whose 賽事 select cannot show
   * the race the member is editing. Resolved here rather than defaulted.
   */
  function beginEdit(record: MemberRaceRecord) {
    setEditing(record.id);
    setEditClaim({
      distanceId: record.distanceId,
      eventId: record.eventId,
      series: catalogue.get(record.eventId)?.series ?? "utmb",
      year: record.year,
    });
    setEditResult(record.result === "dnf" ? "dnf" : "finished");
    setEditFinishTime(
      record.result !== "dnf" && typeof record.finishSeconds === "number"
        ? formatFinishTime(record.finishSeconds)
        : "",
    );
    setError(null);
    setConfirming(null);
  }

  /**
   * Write the edited record back.
   *
   * A PATCH, not delete-and-recreate: the id is what `posts.race_record_id`
   * points at, so keeping it is what lets an article that cites this record
   * survive the correction with its badge intact — now showing the race the
   * member meant. `populateRaceRecordRefs` re-derives `edition` and
   * `category` on the way through, and `uniqueRaceRecord` still refuses an
   * edit that collides with another of the member's records, excluding this
   * one.
   */
  async function save(id: number) {
    if (!raceClaimComplete(editClaim) || editFinishInvalid) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/race-records/${id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          distanceId: editClaim.distanceId,
          eventId: editClaim.eventId,
          // Same rule as `add()`: a DNF has no finishing time, and sending
          // one from a box filled in before the select was switched would
          // store a time against a race they did not finish.
          finishSeconds: editResult === "finished" ? editParsedFinish : null,
          result: editResult,
          year: editClaim.year,
        }),
      });

      if (!response.ok) {
        setError(await readError(response, "修改失敗"));
        return;
      }

      const body = (await response.json()) as { doc: MemberRaceRecord };
      setRecords((current) =>
        current
          .map((record) => (record.id === id ? body.doc : record))
          .sort((a, b) => b.year - a.year),
      );
      setEditing(null);
    } catch {
      setError("修改失敗，請再試一次");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number, confirmed = false) {
    setBusy(true);
    setError(null);
    try {
      const query = confirmed ? `?${UNLINK_FLAG}=true` : "";
      const response = await fetch(`/api/race-records/${id}${query}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (response.status === 409 && !confirmed) {
        setConfirming({ id, message: await readError(response, "刪除失敗") });
        return;
      }
      if (!response.ok) {
        // The server's sentence, not ours. The hardcoded message that used
        // to stand here replaced it with advice to retry, which for a
        // foreign key is advice that can never work. The fallback keeps that
        // shape only for a refusal that says nothing.
        setError(await readError(response, "刪除失敗"));
        return;
      }
      setConfirming(null);
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
      //
      // This branch keeps 「請再試一次」 and the one above no longer does:
      // here the request never got an answer, so trying again is exactly
      // the right thing to do.
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

        <RaceClaimFields
          busy={busy}
          catalogueEvents={catalogueEvents}
          onChange={setClaim}
          value={claim}
        />

        <ResultFields
          busy={busy}
          finishTime={finishTime}
          idPrefix="race-record"
          invalid={finishTimeInvalid}
          onFinishTime={setFinishTime}
          onResult={setResult}
          result={result}
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
            disabled={busy || !raceClaimComplete(claim) || finishTimeInvalid}
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
                  className="flex flex-wrap items-center gap-3 border border-border bg-secondary p-3"
                  data-record-id={record.id}
                  data-testid="race-record-row"
                >
                  <RaceBadge
                    {...resolveBadge(catalogue, record.eventId, record.distanceId)}
                    result={record.result === "dnf" ? "dnf" : "finished"}
                    size={56}
                    year={record.year}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {recordEvent?.name ?? record.eventId}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {record.year}
                      {/* The year alone was the whole line before `result`
                          existed. A DNF has to say so here or the greyed
                          badge is the only signal, and greyscale at 56px
                          beside a coloured one is easy to miss — and
                          invisible to anybody reading this list with a
                          screen reader. */}
                      {record.result === "dnf" && (
                        <span data-testid="race-record-dnf">　·　未完賽</span>
                      )}
                      {record.result !== "dnf" &&
                        typeof record.finishSeconds === "number" && (
                          <span data-testid="race-record-time">
                            　·　{formatFinishTime(record.finishSeconds)}
                          </span>
                        )}
                    </p>
                  </div>
                  <button
                    className="min-h-11 px-2 py-1 text-sm text-muted-foreground hover:text-foreground md:min-h-0 md:text-xs"
                    data-testid="race-record-edit"
                    disabled={busy}
                    onClick={() =>
                      editing === record.id ? setEditing(null) : beginEdit(record)
                    }
                    type="button"
                  >
                    {editing === record.id ? "取消" : "修改"}
                  </button>
                  <button
                    className="min-h-11 px-2 py-1 text-sm text-muted-foreground hover:text-destructive md:min-h-0 md:text-xs"
                    data-testid="race-record-delete"
                    disabled={busy}
                    onClick={() => remove(record.id)}
                    type="button"
                  >
                    刪除
                  </button>
                  {editing === record.id && (
                    <div
                      className="basis-full space-y-3 border-t border-border pt-3"
                      data-testid="race-record-editor"
                    >
                      <RaceClaimFields
                        busy={busy}
                        catalogueEvents={catalogueEvents}
                        onChange={setEditClaim}
                        value={editClaim}
                      />
                      <ResultFields
                        busy={busy}
                        finishTime={editFinishTime}
                        idPrefix="race-record-edit"
                        invalid={editFinishInvalid}
                        onFinishTime={setEditFinishTime}
                        onResult={setEditResult}
                        result={editResult}
                      />
                      <div className="flex justify-end">
                        <Button
                          className="justify-center"
                          data-testid="race-record-edit-save"
                          disabled={
                            busy ||
                            !raceClaimComplete(editClaim) ||
                            editFinishInvalid
                          }
                          onClick={() => save(record.id)}
                          size="sm"
                        >
                          儲存
                        </Button>
                      </div>
                    </div>
                  )}
                  {confirming?.id === record.id && (
                    <div
                      className="basis-full space-y-2 border-t border-border pt-2"
                      data-testid="race-record-confirm"
                    >
                      <p className="text-sm text-destructive">
                        {confirming.message}
                      </p>
                      <div className="flex justify-end gap-2">
                        <button
                          className="min-h-11 px-2 py-1 text-sm text-muted-foreground md:min-h-0 md:text-xs"
                          data-testid="race-record-confirm-cancel"
                          disabled={busy}
                          onClick={() => setConfirming(null)}
                          type="button"
                        >
                          取消
                        </button>
                        <button
                          className="min-h-11 px-2 py-1 text-sm font-semibold text-destructive md:min-h-0 md:text-xs"
                          data-testid="race-record-confirm-delete"
                          disabled={busy}
                          onClick={() => remove(record.id, true)}
                          type="button"
                        >
                          確認刪除
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * The server's own sentence, or `fallback`.
 *
 * `fallback` is a parameter because the two callers are different verbs. It
 * was a hardcoded 「儲存失敗」 while only `add()` used this, and `remove()`
 * hardcoded its own — which is how a refused delete came to say 「請再試一
 * 次」 about a foreign key that will refuse it every time.
 */
async function readError(
  response: Response,
  fallback = "儲存失敗，請再試一次",
): Promise<string> {
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
    return first?.data?.errors?.[0]?.message ?? first?.message ?? fallback;
  } catch {
    return fallback;
  }
}
