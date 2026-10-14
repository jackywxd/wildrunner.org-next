"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { FieldLabel, Input } from "@/components/ui/input";
import { formatFinishTime } from "@/lib/races/finish-time";
import type { ImportPerson, ImportRow, RecordUpdate } from "@/lib/ultrasignup/assemble";
import { MAX_NAME_WORDS } from "@/lib/ultrasignup/name";
import {
  displayItems,
  existingRecord,
  groupOf,
  resolved,
  rowState,
  type Existing,
  type LoggedRecord,
  type RowState,
} from "@/lib/ultrasignup/row-state";

type Split = { fname: string; lname: string };

const UNREADABLE =
  "目前無法讀取 UltraSignup，可能是對方網站暫時故障或改版。請稍後再試；如果持續發生，請告訴管理員。";

const SIGNED_OUT = "登入已過期，請重新登入後再試。";

/**
 * What to tell the member about a refused request.
 *
 * Only the two UltraSignup endpoints write their messages for members; a
 * Payload collection answers in English validation prose, so for those the
 * caller's own sentence stands. A 5xx says nothing a member can act on
 * except 503, which is the import endpoint's "try again shortly".
 */
async function refusal(response: Response, fallback: string, ours: boolean): Promise<string> {
  if (response.status === 401) return SIGNED_OUT;
  if (!ours || (response.status >= 500 && response.status !== 503)) return fallback;
  try {
    const body = (await response.json()) as { errors?: { message?: unknown }[] };
    const message = body.errors?.[0]?.message;
    return typeof message === "string" && message ? message : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Fetch every UltraSignup person a name splits into, then import one row
 * at a time into the member's own race records.
 *
 * The switcher is the whole point of a repeated name. "Xu Dong Wu" is two
 * ids, and each id's finishes stay on their own list — picking one does not
 * merge the other in. Which rows are locked, and why, is `row-state.ts`.
 */
export function UltraSignupImport({
  initialName,
  onImported,
  records,
  userId,
}: {
  initialName: string;
  onImported: (record: LoggedRecord) => void;
  records: LoggedRecord[];
  userId: number;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  // The name as last stored, so 讀取成績 only writes the account (and runs
  // the Users hooks) when the member actually changed it.
  const [savedName, setSavedName] = useState(initialName.trim());
  const [people, setPeople] = useState<ImportPerson[] | null>(null);
  const [personId, setPersonId] = useState<number | null>(null);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [distanceId, setDistanceId] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [failedSplits, setFailedSplits] = useState<Split[]>([]);
  const [busy, setBusy] = useState(false);

  const person = people?.find((item) => item.id === personId) ?? people?.[0] ?? null;

  async function load() {
    setBusy(true);
    setError(null);
    setFailedSplits([]);
    try {
      const wanted = name.trim();
      if (wanted !== savedName) {
        const saved = await fetch(`/api/users/${userId}`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ultrasignupName: wanted }),
        });
        if (!saved.ok) {
          setError(
            await refusal(saved, `姓名沒有存下來。請用成績頁上的姓名，姓放在最後，2 到 ${MAX_NAME_WORDS} 個詞。`, false),
          );
          return;
        }
        setSavedName(wanted);
      }
      const response = await fetch("/api/members/ultrasignup-results", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!response.ok) {
        setPeople(null);
        setError(await refusal(response, UNREADABLE, true));
        return;
      }
      const body = (await response.json()) as {
        failedSplits?: Split[];
        people: ImportPerson[];
      };
      setPeople(body.people);
      setPersonId(body.people[0]?.id ?? null);
      setFailedSplits(body.failedSplits ?? []);
      setChosen({});
      setDistanceId({});
    } catch {
      setPeople(null);
      setError(UNREADABLE);
    } finally {
      setBusy(false);
    }
  }

  /**
   * A distance the catalogue lists goes straight to the collection. One it
   * does not goes through the import endpoint, which re-reads UltraSignup
   * and creates the historical category before the record — so the request
   * names the row and nothing about the distance.
   */
  async function importRow(row: ImportRow) {
    if (!person || !rowState(groupOf(person.rows, row), row, distanceId, records, chosen).canImport) return;
    const picked = resolved(row, distanceId[row.key]);
    const isNew = row.match.kind === "new-distance";
    setBusy(true);
    setError(null);
    try {
      const response = isNew
        ? await fetch("/api/members/ultrasignup-import", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ date: row.date, personId: person.id, rawName: row.rawName }),
          })
        : await fetch("/api/race-records", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              distanceId: picked?.distanceId,
              eventId: picked?.eventId,
              finishSeconds: row.status === "finished" ? row.finishSeconds : null,
              result: row.status === "dnf" ? "dnf" : "finished",
              year: row.year,
            }),
          });
      if (!response.ok) {
        setError(await refusal(response, "這筆沒有匯入。若已經登錄過，列表上會標出來。", isNew));
        return;
      }
      const { doc } = (await response.json()) as { doc: LoggedRecord };
      onImported(doc);
      // The row now points at a real category, so the existing-record
      // lookup — which reads the live list — finds what was just written.
      const label =
        row.match.kind === "new-distance"
          ? row.match.distanceLabel
          : row.match.kind === "choose-distance"
            ? (row.match.options.find((option) => option.id === doc.distanceId)?.label ?? doc.distanceId)
            : row.match.kind === "ready"
              ? row.match.distanceLabel
              : doc.distanceId;
      const eventName = row.match.kind === "unsupported" ? doc.eventId : row.match.eventName;
      setPeople((current) =>
        current?.map((item) => ({
          ...item,
          rows: item.rows.map((candidate) =>
            candidate.key === row.key
              ? {
                  ...candidate,
                  match: {
                    distanceId: doc.distanceId,
                    distanceLabel: label,
                    eventId: doc.eventId,
                    eventName,
                    kind: "ready",
                  },
                }
              : candidate,
          ),
        })) ?? null,
      );
      // The new category is not in the catalogue this page was rendered
      // with; without a refresh the record's badge cannot name it.
      if (isNew) router.refresh();
    } catch {
      setError("這筆沒有匯入，請再試一次。");
    } finally {
      setBusy(false);
    }
  }

  async function updateRow(existing: Existing, update: RecordUpdate) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/race-records/${existing.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      if (!response.ok) {
        setError(await refusal(response, "這筆沒有更新，請再試一次。", false));
        return;
      }
      onImported(((await response.json()) as { doc: LoggedRecord }).doc);
    } catch {
      setError("這筆沒有更新，請再試一次。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 border border-border p-4">
      <div>
        <h2 className="font-heading text-sm font-semibold text-foreground/70">
          從 UltraSignup 匯入
        </h2>
        <p className="mt-1 text-xs text-foreground/50">
          填成績頁上的姓名，姓放最後。同名若對到不只一位選手，可以切換查看。已在比賽紀錄裡的場次會標出來。
        </p>
      </div>

      <label className="block space-y-1">
        <FieldLabel>姓名</FieldLabel>
        <Input
          data-testid="ultrasignup-name"
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
          placeholder="Xu Dong Wu"
          value={name}
        />
      </label>

      <Button
        data-testid="ultrasignup-load"
        disabled={busy || name.trim() === ""}
        onClick={() => void load()}
        type="button"
        variant="outline"
      >
        讀取成績
      </Button>

      {error && (
        <p className="text-sm text-destructive" data-testid="ultrasignup-error" role="alert">
          {error}
        </p>
      )}

      {people && people.length === 0 && (
        <p className="text-sm text-muted-foreground">這個姓名在 UltraSignup 沒有成績。</p>
      )}

      {people && people.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {people.map((item) => (
            <Button
              data-testid={`ultrasignup-person-${item.id}`}
              disabled={busy}
              key={item.id}
              onClick={() => setPersonId(item.id)}
              type="button"
              variant={item.id === person?.id ? "default" : "outline"}
            >
              {personLabel(item)}
            </Button>
          ))}
        </div>
      )}

      {person && people && people.length === 1 && (
        <p className="text-sm">{personLabel(person)}</p>
      )}

      {failedSplits.length > 0 && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 border border-border p-3 text-sm"
          data-testid="ultrasignup-partial"
        >
          <p>
            有一部分沒有讀到：以
            {failedSplits.map((split) => `「名 ${split.fname}、姓 ${split.lname}」`).join("、")}
            查詢沒有回應，這個姓名下的選手可能不完整。
          </p>
          <Button disabled={busy} onClick={() => void load()} type="button" variant="outline">
            重新讀取
          </Button>
        </div>
      )}

      {person && (
        <ul className="space-y-3">
          {displayItems(person.rows).map((item) => {
            const rowView = (row: ImportRow, state: RowState) => (
              <RowView
                busy={busy}
                distanceId={distanceId[row.key] ?? ""}
                key={row.key}
                onChoose={() =>
                  row.groupId && setChosen((current) => ({ ...current, [row.groupId!]: row.key }))
                }
                onDistance={(value) =>
                  setDistanceId((current) => ({ ...current, [row.key]: value }))
                }
                onImport={() => void importRow(row)}
                onUpdate={(existing, update) => void updateRow(existing, update)}
                row={row}
                state={state}
              />
            );
            if (item.rows.length === 1) {
              const [row] = item.rows;
              return rowView(row, rowState(item.rows, row, distanceId, records, chosen));
            }
            const locked = item.rows.find((row) => existingRecord(row, distanceId, records));
            return (
              <li
                className="space-y-2 border border-border p-3"
                data-locked={locked ? "true" : "false"}
                data-testid="ultrasignup-group"
                key={item.groupId}
              >
                <p className="text-xs text-foreground/70">{groupTitle(item.rows, locked)}</p>
                <ul className="space-y-2">
                  {item.rows.map((row) =>
                    rowView(row, rowState(item.rows, row, distanceId, records, chosen)),
                  )}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function personLabel(person: ImportPerson): string {
  const age = person.age === null ? "年齡未知" : `${person.age} 歲`;
  return `${person.firstName} ${person.lastName}（名 ${person.firstName}、姓 ${person.lastName}）· ${age} · ${person.rows.length} 場`;
}

function groupTitle(rows: ImportRow[], locked: ImportRow | undefined): string {
  if (locked) {
    const label = locked.match.kind === "ready" ? locked.match.distanceLabel : locked.rawName;
    return `同一場完賽，已匯入 ${label}`;
  }
  const [first] = rows;
  if (first.groupId?.startsWith("finish:")) {
    return `疑似同一場完賽：${first.timeText ?? ""}，第 ${first.place ?? "?"} 名，只能匯入一筆`;
  }
  return "這幾筆對到同一筆紀錄，只能匯入一筆";
}

function outcome(value: { finishSeconds: number | null; result: "finished" | "dnf" }): string {
  if (value.result === "dnf") return "未完賽";
  return value.finishSeconds === null ? "完賽（沒有時間）" : formatFinishTime(value.finishSeconds);
}

function matchLine(row: ImportRow): string {
  switch (row.match.kind) {
    case "ready":
      return `　→　${row.match.eventName} · ${row.match.distanceLabel}`;
    case "choose-distance":
      return `　→　${row.match.eventName}`;
    case "new-distance":
      return `　→　${row.match.eventName} · ${row.match.distanceLabel}`;
    case "unsupported":
      return {
        distance: "　目錄裡沒有這個分項",
        event: "　目錄裡沒有這場",
        status: "",
        unverifiable: "　目錄裡沒有這個分項，也無法確認是否為新分項，請管理員補上距離或別名",
        year: "　年份不在可登錄範圍",
      }[row.match.reason];
  }
}

function RowView({
  busy,
  distanceId,
  onChoose,
  onDistance,
  onImport,
  onUpdate,
  row,
  state,
}: {
  busy: boolean;
  distanceId: string;
  onChoose: () => void;
  onDistance: (value: string) => void;
  onImport: () => void;
  onUpdate: (existing: Existing, update: RecordUpdate) => void;
  row: ImportRow;
  state: RowState;
}) {
  const { canImport, existing, note, radio, update } = state;
  const missingTime =
    update !== null &&
    existing !== null &&
    existing.result === "finished" &&
    existing.finishSeconds === null &&
    update.result === "finished";
  return (
    <li
      className={`border border-border p-3 text-sm${note ? " text-foreground/50" : ""}`}
      data-testid={`ultrasignup-row-${row.key}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {radio && (
            <label className="mb-1 flex items-center gap-2 text-xs text-foreground/70">
              <input
                checked={radio.checked}
                disabled={busy}
                name={row.groupId ?? row.key}
                onChange={onChoose}
                type="radio"
              />
              留下這一筆
            </label>
          )}
          <p>
            {row.date}　{row.rawName}
          </p>
          <p className="text-foreground/60">
            {row.status === "dnf" ? "未完賽" : row.status === "other" ? "不匯入" : "完賽"}
            {row.timeText ? `　${row.timeText}` : ""}
            {matchLine(row)}
          </p>
          {row.match.kind === "new-distance" && !existing && !note && (
            <p className="text-foreground/70" data-testid={`ultrasignup-new-distance-${row.key}`}>
              目錄沒有這個分項，匯入時會依 UltraSignup 新增為歷史分項
            </p>
          )}
          {existing && (
            <p className="text-foreground/70" data-testid={`ultrasignup-existing-${row.key}`}>
              {missingTime
                ? "已在你的比賽紀錄，但沒有完賽時間"
                : update
                  ? `已在你的比賽紀錄 ${outcome(existing)}，和 UltraSignup 不同（${outcome(update)}）`
                  : `已在你的比賽紀錄　${outcome(existing)}`}
            </p>
          )}
          {note && <p data-testid={`ultrasignup-locked-${row.key}`}>{note}</p>}
        </div>
        {canImport && (
          <Button
            data-testid={`ultrasignup-import-${row.key}`}
            disabled={busy}
            onClick={onImport}
            type="button"
            variant="outline"
          >
            匯入
          </Button>
        )}
        {existing && update && (
          <Button
            data-testid={`ultrasignup-update-${row.key}`}
            disabled={busy}
            onClick={() => onUpdate(existing, update)}
            type="button"
            variant="outline"
          >
            {missingTime ? "補上時間" : "改成 UltraSignup 的結果"}
          </Button>
        )}
      </div>
      {row.match.kind === "choose-distance" && !existing && !note && (
        <label className="mt-2 block space-y-1">
          <span className="text-xs">分項</span>
          <select
            className="block w-full border border-input bg-background px-3 py-2 text-base md:text-sm"
            disabled={busy}
            onChange={(event) => onDistance(event.target.value)}
            value={distanceId}
          >
            <option value="">選擇分項</option>
            {row.match.options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </li>
  );
}
