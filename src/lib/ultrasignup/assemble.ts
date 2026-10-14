import { isRaceYearClaimable } from "@/lib/races/catalogue";

import { dedupeResults } from "./dedupe";
import { matchRow, type MatchEvent, type RowMatch } from "./match";
import type { ParsedPerson } from "./parse";

export type ExistingRecord = {
  distanceId: string;
  eventId: string;
  finishSeconds: number | null;
  id: number;
  result: "finished" | "dnf";
  year: number;
};

export type RecordUpdate = {
  finishSeconds: number | null;
  result: "finished" | "dnf";
};

/**
 * What the member's record should become for it to say what UltraSignup
 * says, or null when it already does.
 *
 * UltraSignup is the source of truth for an outcome it published: a missing
 * time, a different time and a different result are all offered as one
 * update. One thing is never offered — erasing a time because UltraSignup
 * printed a finish without a readable one; that is UltraSignup not saying,
 * not UltraSignup disagreeing.
 */
export function recordUpdate(
  row: Pick<ImportRow, "finishSeconds" | "status">,
  existing: Pick<ExistingRecord, "finishSeconds" | "result">,
): RecordUpdate | null {
  if (row.status === "other") return null;
  if (row.status === "dnf") {
    return existing.result === "dnf" && existing.finishSeconds === null
      ? null
      : { finishSeconds: null, result: "dnf" };
  }
  const finishSeconds = row.finishSeconds ?? existing.finishSeconds;
  return existing.result === "finished" && existing.finishSeconds === finishSeconds
    ? null
    : { finishSeconds, result: "finished" };
}

export type ImportRow = {
  date: string;
  distanceText: string;
  eventName: string;
  finishSeconds: number | null;
  groupId: string | null;
  key: string;
  match: RowMatch;
  place: number | null;
  rawName: string;
  status: "finished" | "dnf" | "other";
  timeText: string | null;
  year: number;
  existing: ExistingRecord | null;
};

export type ImportPerson = {
  age: number | null;
  firstName: string;
  id: number;
  lastName: string;
  rows: ImportRow[];
};

function existingFor(
  records: ExistingRecord[],
  match: RowMatch,
  year: number,
): ExistingRecord | null {
  if (match.kind !== "ready") return null;
  return (
    records.find(
      (record) =>
        record.eventId === match.eventId &&
        record.distanceId === match.distanceId &&
        record.year === year,
    ) ?? null
  );
}

/**
 * One person's rows, deduped, matched, and marked when the member already
 * logged that finish. Years outside the race-record range stay in the list
 * and cannot be imported — `match` is forced to unsupported.
 */
export function assemblePerson(
  person: ParsedPerson,
  events: MatchEvent[],
  records: ExistingRecord[],
  now: Date,
): ImportPerson {
  const deduped = dedupeResults(person.results);
  const rows: ImportRow[] = deduped.map((row, index) => {
    const match: RowMatch =
      row.status === "other"
        ? { kind: "unsupported", reason: "status" }
        : !isRaceYearClaimable(row.year, now)
          ? { kind: "unsupported", reason: "year" }
          : matchRow(events, row.eventName, row.distanceText);
    return {
      date: row.date,
      distanceText: row.distanceText,
      eventName: row.eventName,
      existing: existingFor(records, match, row.year),
      finishSeconds: row.finishSeconds,
      groupId: row.groupId,
      key: `${person.id}:${index}`,
      match,
      place: row.place,
      rawName: row.rawName,
      status: row.status,
      timeText: row.timeText,
      year: row.year,
    };
  });

  // Two different UltraSignup names that resolved to the same record are
  // still one finish. Share a group so only one of them can be imported.
  // A row already in a repeated-finish group brings that whole group along:
  // overwriting its id alone would leave its partner in a group of one.
  const byRecord = new Map<string, number[]>();
  rows.forEach((row, index) => {
    if (row.match.kind !== "ready" || row.existing) return;
    const id = `${row.match.eventId}\u0000${row.match.distanceId}\u0000${row.year}`;
    const list = byRecord.get(id) ?? [];
    list.push(index);
    byRecord.set(id, list);
  });
  for (const [id, indexes] of byRecord) {
    if (indexes.length < 2) continue;
    const groupId = `record:${id}`;
    const absorbed = new Set(
      indexes.map((index) => rows[index].groupId).filter((value) => value !== null),
    );
    for (const row of rows) {
      if (row.groupId !== null && absorbed.has(row.groupId)) row.groupId = groupId;
    }
    for (const index of indexes) rows[index].groupId = groupId;
  }

  rows.sort((left, right) => (left.date < right.date ? 1 : left.date > right.date ? -1 : 0));

  return {
    age: person.age,
    firstName: person.firstName,
    id: person.id,
    lastName: person.lastName,
    rows,
  };
}

export function assemblePeople(
  people: ParsedPerson[],
  events: MatchEvent[],
  records: ExistingRecord[],
  now: Date,
): ImportPerson[] {
  return people.map((person) => assemblePerson(person, events, records, now));
}
