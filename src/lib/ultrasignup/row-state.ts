import { recordUpdate, type ImportRow, type RecordUpdate } from "./assemble";

/**
 * What each row of the import list may do, given the member's live records.
 *
 * Kept out of the component because it is the part that can import one
 * finish twice. A groupId means UltraSignup listed one finish more than
 * once (or two titles resolve to one record): once any row of the group is
 * in the member's records the rest are locked — otherwise picking the other
 * row after an import logs the same finish under a second event, which the
 * server's (event, distance, year) uniqueness cannot see.
 *
 * Every question here is asked of `records`, the page's live list, not of
 * anything the server sent with the rows: an import, an update or a delete
 * in the list below has to show here without reloading UltraSignup.
 *
 * A row the matcher could not place can be placed by the member: they pick
 * the event and distance themselves (`RowPick`), exactly as they would when
 * logging a race by hand, and from then on the row is asked every question
 * above as if the matcher had found it. The pick is theirs alone — it is
 * never written back to the catalogue as an alias.
 */

/**
 * What the member chose on a row: the distance on a "choose-distance" row,
 * or the event and distance on a row the catalogue could not place.
 */
export type RowPick = { distanceId?: string; eventId?: string };

export type LoggedRecord = {
  distanceId: string;
  eventId: string;
  finishSeconds?: number | null;
  id: number;
  result?: "finished" | "dnf" | null;
  year: number;
};

export type Existing = { finishSeconds: number | null; id: number; result: "finished" | "dnf" };

export type RowState = {
  canImport: boolean;
  existing: Existing | null;
  /** Shown instead of the import button on a row its group has locked. */
  note: string | null;
  /** Present only when more than one row of a group could be imported. */
  radio: { checked: boolean } | null;
  /** What the existing record should become to agree with UltraSignup. */
  update: RecordUpdate | null;
};

/**
 * A row the catalogue does not have — the race, or this distance of it —
 * which the member may place by hand or ask to have added. A year outside
 * the claimable range or a result that is not a finish/DNF is not a
 * catalogue question, and placing it would not make it importable.
 */
export function notInCatalogue(row: ImportRow): boolean {
  return (
    row.status !== "other" &&
    row.match.kind === "unsupported" &&
    (row.match.reason === "event" ||
      row.match.reason === "distance" ||
      row.match.reason === "unverifiable")
  );
}

/** The event and distance a row imports as, once any choice it needs is made. */
export function resolved(
  row: ImportRow,
  pick: RowPick | undefined,
): { distanceId: string; eventId: string } | null {
  if (row.match.kind === "ready") {
    return { distanceId: row.match.distanceId, eventId: row.match.eventId };
  }
  if (row.match.kind === "choose-distance" && pick?.distanceId) {
    const option = row.match.options.find((item) => item.id === pick.distanceId);
    if (!option) return null;
    return { distanceId: option.id, eventId: row.match.eventId };
  }
  if (notInCatalogue(row) && pick?.eventId && pick.distanceId) {
    return { distanceId: pick.distanceId, eventId: pick.eventId };
  }
  return null;
}

/** The member's record for this row, if they have one. */
export function existingRecord(
  row: ImportRow,
  picks: Record<string, RowPick>,
  records: LoggedRecord[],
): Existing | null {
  const picked = resolved(row, picks[row.key]);
  if (!picked) return null;
  const record = records.find(
    (item) =>
      item.eventId === picked.eventId &&
      item.distanceId === picked.distanceId &&
      item.year === row.year,
  );
  if (!record) return null;
  return {
    finishSeconds: record.finishSeconds ?? null,
    id: record.id,
    result: record.result === "dnf" ? "dnf" : "finished",
  };
}

/**
 * Could this row be imported now. An unplaced row becomes one only once the
 * member has placed it: counting it before would put a radio on every
 * repeated finish that has one unrecognised title.
 */
function candidate(
  row: ImportRow,
  picks: Record<string, RowPick>,
  records: LoggedRecord[],
): boolean {
  return (
    row.status !== "other" &&
    (row.match.kind !== "unsupported" || resolved(row, picks[row.key]) !== null) &&
    !existingRecord(row, picks, records)
  );
}

/**
 * What one row may do, given the rest of its group.
 *
 * A row that is already logged locks its group. Otherwise the member picks
 * only between rows that could actually be imported: one such row needs no
 * choice, and a radio on a row the catalogue cannot place is a question
 * with one answer.
 */
export function rowState(
  group: ImportRow[],
  row: ImportRow,
  picks: Record<string, RowPick>,
  records: LoggedRecord[],
  chosen: Record<string, string>,
): RowState {
  const existing = existingRecord(row, picks, records);
  const update = existing ? recordUpdate(row, existing) : null;
  const placeable =
    row.match.kind === "new-distance" || Boolean(resolved(row, picks[row.key]));
  const importable = placeable && candidate(row, picks, records);
  const base = { existing, note: null, radio: null, update };
  if (group.length <= 1 || existing) return { ...base, canImport: existing ? false : importable };
  if (group.some((other) => existingRecord(other, picks, records))) {
    return { ...base, canImport: false, note: "同一場已匯入，這筆不再匯入" };
  }
  const candidates = group.filter((other) => candidate(other, picks, records));
  if (candidates.length < 2 || !candidates.includes(row)) return { ...base, canImport: importable };
  const checked = chosen[row.groupId ?? ""] === row.key;
  return { ...base, canImport: importable && checked, radio: { checked } };
}

/**
 * The colour a row is drawn in. `logged`: the member's record says what
 * UltraSignup says. `differs`: they have a record and it disagrees.
 * `missing`: the catalogue has no place for it and the member has not placed
 * it by hand. Everything else — importable, new distance, not a finish — is
 * plain, and so is a row its group has locked: a sibling was imported, so
 * there is nothing left to do about it, and red would say there is.
 */
export type RowTone = "logged" | "differs" | "missing" | null;

export function rowTone(row: ImportRow, state: RowState, pick: RowPick | undefined): RowTone {
  if (state.existing) return state.update ? "differs" : "logged";
  if (state.note) return null;
  if (notInCatalogue(row) && !resolved(row, pick)) return "missing";
  return null;
}

/** The rows that share this row's group, itself included. */
export function groupOf(rows: ImportRow[], row: ImportRow): ImportRow[] {
  if (!row.groupId) return [row];
  return rows.filter((candidate) => candidate.groupId === row.groupId);
}

/** Rows in date order, with each group gathered where its first row falls. */
export function displayItems(rows: ImportRow[]): { groupId: string; rows: ImportRow[] }[] {
  const items: { groupId: string; rows: ImportRow[] }[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.groupId) {
      items.push({ groupId: row.key, rows: [row] });
      continue;
    }
    if (seen.has(row.groupId)) continue;
    seen.add(row.groupId);
    items.push({ groupId: row.groupId, rows: groupOf(rows, row) });
  }
  return items;
}
