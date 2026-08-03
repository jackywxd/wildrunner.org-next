/**
 * Calendar maths for the race schedule.
 *
 * Pure functions, no React, no I/O — the same shape as badge-contract.ts, so
 * the tests for this file run as plain Node without a browser.
 *
 * TWO RULES THIS FILE ENFORCES, both of which exist because getting them
 * wrong is invisible until a visitor in the wrong timezone reports it:
 *
 * 1. `now` is always a parameter, never read from the clock in here. A
 *    module that calls `new Date()` internally cannot be tested at a month
 *    boundary, a year boundary, or on a leap day without changing the
 *    system clock.
 *
 * 2. Dates are "YYYY-MM-DD" strings end to end. A `Date` carries a time and
 *    a timezone; a calendar cell has neither. Converting a stored
 *    `2026-08-28T00:00:00.000Z` through a local-time `Date` puts the race
 *    on 8/27 for a visitor in the Americas and 8/28 for one in Taipei — the
 *    same row landing in two different cells for two people. Strings in
 *    this format also sort and compare lexicographically in exactly date
 *    order, so nothing is lost by never parsing them.
 */

import dayjs from "dayjs";
// The `.js` is load-bearing. Next's bundler resolves the extensionless
// specifier that `src/store/day.ts` uses, but this module is also imported
// directly by the Playwright specs under Node's ESM loader, which will not
// — it fails with "Did you mean to import dayjs/plugin/utc.js?". Both
// resolve to the same file.
import utc from "dayjs/plugin/utc.js";

// Registered locally rather than in src/store/day.ts, which sets a global
// `zh-cn` locale. Extending dayjs is idempotent, and keeping this next to
// its only consumer means a future edit to the global setup cannot silently
// remove the plugin this file depends on.
dayjs.extend(utc);

/** "YYYY-MM-DD". Every date in this module is one of these. */
export type DateString = string;

export type MonthKey = {
  /** "YYYY-MM". Stable identity for a month block. */
  key: string;
  year: number;
  /** 1-12, not the 0-11 that `Date` uses. */
  month: number;
};

export type CalendarCell = {
  date: DateString;
  /** False for the leading/trailing days borrowed from adjacent months. */
  inMonth: boolean;
};

/** The UTC calendar day `now` falls on, as a date string. */
export function toDateString(now: Date): DateString {
  return dayjs.utc(now).format("YYYY-MM-DD");
}

/**
 * The window `/races` covers: from the start of today through the same day
 * `months` later, exclusive.
 *
 * Exclusive on the far end so a race exactly twelve months out is not
 * double-counted against next year's window when the page is revisited.
 */
export function scheduleWindow(
  now: Date,
  months = 12,
): { from: DateString; to: DateString } {
  const start = dayjs.utc(now).startOf("day");
  return {
    from: start.format("YYYY-MM-DD"),
    to: start.add(months, "month").format("YYYY-MM-DD"),
  };
}

/** The month blocks the calendar view renders, starting with `now`'s month. */
export function monthsInWindow(now: Date, months = 12): MonthKey[] {
  const start = dayjs.utc(now).startOf("month");
  const keys: MonthKey[] = [];
  for (let i = 0; i < months; i += 1) {
    const cursor = start.add(i, "month");
    keys.push({
      key: cursor.format("YYYY-MM"),
      month: cursor.month() + 1,
      year: cursor.year(),
    });
  }
  return keys;
}

/**
 * A month as a fixed 6x7 grid.
 *
 * Always 42 cells, even when the month fits in five rows. A grid that
 * changes height between months makes the twelve stacked blocks jitter as
 * you scroll, and the empty row costs nothing.
 */
export function monthGrid(
  month: MonthKey,
  weekStartsOn: 0 | 1 = 0,
): CalendarCell[] {
  const first = dayjs.utc(`${month.key}-01`);
  const offset = (first.day() - weekStartsOn + 7) % 7;
  const gridStart = first.subtract(offset, "day");

  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const day = gridStart.add(i, "day");
    cells.push({
      date: day.format("YYYY-MM-DD"),
      inMonth: day.format("YYYY-MM") === month.key,
    });
  }
  return cells;
}

/**
 * How many days a multi-day entry may occupy.
 *
 * A mistyped `endDate` — 2027 instead of 2026 — would otherwise paint every
 * cell in the window. The collection validator rejects that on write, but
 * rows already stored are never re-validated unless edited, which is the
 * same gap `RaceRecords.eventId` documents. Clamping here means a bad row
 * looks wrong instead of taking the page down with it.
 */
export const MAX_ENTRY_SPAN_DAYS = 21;

type SpannedEntry = {
  startDate: DateString;
  endDate?: DateString | null;
};

/**
 * Index entries by every calendar day they occupy, so a cell can be
 * rendered with a single map lookup rather than a scan of the whole list.
 */
export function entriesByDate<T extends SpannedEntry>(
  entries: T[],
): Map<DateString, T[]> {
  const byDate = new Map<DateString, T[]>();

  for (const entry of entries) {
    const start = dayjs.utc(entry.startDate);
    const end = entry.endDate ? dayjs.utc(entry.endDate) : start;
    // A backwards range degrades to the single start day rather than
    // producing nothing, so the race still appears somewhere.
    const span = Math.min(
      Math.max(end.diff(start, "day"), 0),
      MAX_ENTRY_SPAN_DAYS - 1,
    );

    for (let i = 0; i <= span; i += 1) {
      const key = start.add(i, "day").format("YYYY-MM-DD");
      const bucket = byDate.get(key);
      if (bucket) bucket.push(entry);
      else byDate.set(key, [entry]);
    }
  }

  return byDate;
}
