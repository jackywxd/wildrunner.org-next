import { parseFinishTime } from "@/lib/races/finish-time";

import type { NameSplit } from "./name";

/**
 * One row of `historybyname`, after the fields we do not use are dropped.
 *
 * `eventname` on the wire is `"<event> - <distance>"`. The distance is not a
 * separate field — `distance_time` is null on every row checked — so the
 * last " - " is the split. Status `1` is a finish and `2` is a DNF; anything
 * else (DNS, DQ, unofficial) is kept visible and not importable, because a
 * race record only has those two outcomes.
 */
export type ParsedResult = {
  date: string;
  distanceText: string;
  eventName: string;
  finishSeconds: number | null;
  place: number | null;
  rawName: string;
  status: "finished" | "dnf" | "other";
  timeText: string | null;
  year: number;
};

export type ParsedPerson = {
  age: number | null;
  firstName: string;
  id: number;
  lastName: string;
  results: ParsedResult[];
  split: NameSplit;
};

const DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function calendarDate(value: unknown): { date: string; year: number } | null {
  if (typeof value !== "string") return null;
  const match = DATE.exec(value.trim());
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { date, year };
}

function splitEventName(raw: string): { distanceText: string; eventName: string } {
  const at = raw.lastIndexOf(" - ");
  if (at === -1) return { distanceText: "", eventName: raw.trim() };
  return {
    eventName: raw.slice(0, at).trim(),
    distanceText: raw.slice(at + 3).trim(),
  };
}

function oneResult(value: unknown): ParsedResult | null {
  const row = asRecord(value);
  if (!row) return null;
  const when = calendarDate(row.eventdate);
  if (!when || typeof row.eventname !== "string" || row.eventname.trim() === "") {
    return null;
  }
  const statusCode = typeof row.status === "number" ? row.status : null;
  const status =
    statusCode === 1 ? "finished" : statusCode === 2 ? "dnf" : "other";
  const timeText =
    status === "finished" && typeof row.formattime === "string"
      ? row.formattime.trim()
      : null;
  const finishSeconds = timeText ? parseFinishTime(timeText) : null;
  const place = typeof row.place === "number" && row.place > 0 ? row.place : null;
  const { distanceText, eventName } = splitEventName(row.eventname.trim());
  return {
    date: when.date,
    distanceText,
    eventName,
    finishSeconds,
    place,
    rawName: row.eventname.trim(),
    status,
    timeText: finishSeconds !== null ? timeText : null,
    year: when.year,
  };
}

function onePerson(value: unknown, split: NameSplit): ParsedPerson | null {
  const row = asRecord(value);
  if (!row || typeof row.Id !== "number") return null;
  const firstName = typeof row.FirstName === "string" ? row.FirstName.trim() : "";
  const lastName = typeof row.LastName === "string" ? row.LastName.trim() : "";
  if (!firstName || !lastName) return null;
  const results = Array.isArray(row.Results)
    ? row.Results.map(oneResult).filter((result): result is ParsedResult => result !== null)
    : [];
  const age = typeof row.Age === "number" && row.Age > 0 ? row.Age : null;
  return { age, firstName, id: row.Id, lastName, results, split };
}

/** One `historybyname` body. Not an array, or no person id, is an empty list. */
export function parseHistory(json: unknown, split: NameSplit): ParsedPerson[] {
  if (!Array.isArray(json)) return [];
  return json
    .map((person) => onePerson(person, split))
    .filter((person): person is ParsedPerson => person !== null);
}

/**
 * People from every name split, first split wins when an id repeats.
 *
 * The order is the split order: surname-last first, so "Xu Dong / Wu" stays
 * ahead of "Xu / Dong Wu" and the switcher does not jump between fetches.
 */
export function mergePeople(groups: ParsedPerson[][]): ParsedPerson[] {
  const seen = new Set<number>();
  const people: ParsedPerson[] = [];
  for (const group of groups) {
    for (const person of group) {
      if (seen.has(person.id)) continue;
      seen.add(person.id);
      people.push(person);
    }
  }
  return people;
}
