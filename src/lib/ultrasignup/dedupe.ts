import type { ParsedResult } from "./parse";

/**
 * The same finish listed twice.
 *
 * UltraSignup will publish one result under two event names. On Xu Dong Wu's
 * page, "Ultra Trail Du Mont Blanc by UTMB - TDS" and "Sur les Traces des
 * Ducs de Savoie - 145K" are both 39:24:51, place 852, four days apart.
 * Those are one finish. Squamish 50 on 2022-08-21 is three rows — 50K, 50
 * miler, 50/50 — with three different times, and those are three finishes.
 *
 * Identical rows collapse. Rows that share a finish time, a place and a
 * year, and sit within 14 days, stay as a group the member picks from.
 * Neither row is dropped: only one of the two names may be in the catalogue.
 */

export type DedupedResult = ParsedResult & {
  /** Set when the member has to choose which row of a repeated finish to keep. */
  groupId: string | null;
};

function exactKey(row: ParsedResult): string {
  return [
    row.rawName,
    row.date,
    row.status,
    row.timeText ?? "",
    row.place ?? "",
  ].join("\u0000");
}

function sameFinish(left: ParsedResult, right: ParsedResult): boolean {
  return (
    left.status === "finished" &&
    right.status === "finished" &&
    left.finishSeconds !== null &&
    left.finishSeconds > 0 &&
    left.finishSeconds === right.finishSeconds &&
    left.place !== null &&
    left.place === right.place &&
    left.year === right.year &&
    Math.abs(utcDay(left.date) - utcDay(right.date)) <= 14
  );
}

function utcDay(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function dedupeResults(rows: ParsedResult[]): DedupedResult[] {
  const unique: ParsedResult[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const key = exactKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }

  const parent = unique.map((_, index) => index);
  const find = (index: number): number => {
    let cursor = index;
    while (parent[cursor] !== cursor) cursor = parent[cursor];
    return cursor;
  };
  const unite = (left: number, right: number) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent[b] = a;
  };

  for (let i = 0; i < unique.length; i += 1) {
    for (let j = i + 1; j < unique.length; j += 1) {
      if (sameFinish(unique[i], unique[j])) unite(i, j);
    }
  }

  const members = new Map<number, number[]>();
  for (let index = 0; index < unique.length; index += 1) {
    const root = find(index);
    const list = members.get(root) ?? [];
    list.push(index);
    members.set(root, list);
  }

  return unique.map((row, index) => {
    const list = members.get(find(index)) ?? [];
    const groupId =
      list.length > 1
        ? `finish:${row.finishSeconds}:${row.place}:${row.year}`
        : null;
    return { ...row, groupId };
  });
}
