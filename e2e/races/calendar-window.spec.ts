import { test, expect } from "@playwright/test";

import {
  MAX_ENTRY_SPAN_DAYS,
  entriesByDate,
  monthGrid,
  monthsInWindow,
  scheduleWindow,
  toDateString,
} from "@/lib/races/calendar";

/**
 * Phase C — calendar maths.
 *
 * Plain Node, no browser, like badge-contract.spec.ts. Every case injects
 * `now`, which is the whole reason calendar.ts takes it as a parameter: a
 * month-boundary or leap-day bug is otherwise only reproducible by changing
 * the system clock.
 *
 * The timezone choice matters here. `new Date("2026-08-01T12:00:00Z")` is
 * used rather than `new Date(2026, 7, 1)` — the latter is local time, so on
 * a CI runner set to UTC-7 it would be a different UTC day and half these
 * assertions would flip.
 */

const at = (iso: string) => new Date(iso);

test.describe("C calendar window", () => {
  test("C-T1: the window starts today and runs twelve months", () => {
    const { from, to } = scheduleWindow(at("2026-08-01T12:00:00Z"));
    expect(from).toBe("2026-08-01");
    expect(to).toBe("2027-08-01");
  });

  test("C-T2: the window is anchored to the UTC day, not the instant", () => {
    // Late-evening UTC and early-morning UTC on the same date must produce
    // the same window, or the schedule would shift within a single day.
    const early = scheduleWindow(at("2026-08-01T00:00:01Z"));
    const late = scheduleWindow(at("2026-08-01T23:59:59Z"));
    expect(early).toEqual(late);
    expect(toDateString(at("2026-08-01T23:59:59Z"))).toBe("2026-08-01");
  });

  test("C-T3: twelve month keys, rolling over the year end", () => {
    const months = monthsInWindow(at("2026-12-15T12:00:00Z"));
    expect(months).toHaveLength(12);
    expect(months[0].key).toBe("2026-12");
    expect(months[0].year).toBe(2026);
    // 1-12, not the 0-11 `Date` uses — an off-by-one here would label every
    // month heading wrongly.
    expect(months[0].month).toBe(12);
    expect(months[1].key).toBe("2027-01");
    expect(months[11].key).toBe("2027-11");
  });

  test("C-T4: a month grid is always 42 cells", () => {
    for (const key of ["2026-08", "2027-02", "2028-02", "2026-11"]) {
      const [year, month] = key.split("-").map(Number);
      const cells = monthGrid({ key, month, year });
      expect(cells, `${key} grid size`).toHaveLength(42);
      // Fixed height means some months carry a whole borrowed week.
      expect(cells.filter((cell) => cell.inMonth).length).toBeGreaterThan(27);
    }
  });

  test("C-T5: leap day is in February 2028 and not in February 2027", () => {
    const leap = monthGrid({ key: "2028-02", month: 2, year: 2028 });
    expect(leap.some((cell) => cell.date === "2028-02-29")).toBeTruthy();
    expect(leap.filter((cell) => cell.inMonth)).toHaveLength(29);

    const common = monthGrid({ key: "2027-02", month: 2, year: 2027 });
    expect(common.some((cell) => cell.date === "2027-02-29")).toBeFalsy();
    expect(common.filter((cell) => cell.inMonth)).toHaveLength(28);
  });

  test("C-T6: a month starting on the week-start day borrows a full week", () => {
    // 2026-11-01 is a Sunday, which is the default week start, so the grid
    // must begin exactly on the 1st with no leading days from October.
    const cells = monthGrid({ key: "2026-11", month: 11, year: 2026 });
    expect(cells[0].date).toBe("2026-11-01");
    expect(cells[0].inMonth).toBeTruthy();
  });

  test("C-T7: a multi-day race occupies every day it runs", () => {
    const byDate = entriesByDate([
      { endDate: "2026-08-30", startDate: "2026-08-28" },
    ]);
    expect([...byDate.keys()].sort()).toEqual([
      "2026-08-28",
      "2026-08-29",
      "2026-08-30",
    ]);
  });

  test("C-T8: a single-day race occupies one cell", () => {
    const byDate = entriesByDate([{ startDate: "2027-07-09" }]);
    expect(byDate.size).toBe(1);
    expect(byDate.get("2027-07-09")).toHaveLength(1);
  });

  test("C-T9: a runaway endDate is clamped instead of painting the year", () => {
    // The classic typo: right day, wrong year.
    const byDate = entriesByDate([
      { endDate: "2027-08-30", startDate: "2026-08-28" },
    ]);
    expect(byDate.size).toBe(MAX_ENTRY_SPAN_DAYS);
  });

  test("C-T10: a backwards range still shows on its start day", () => {
    const byDate = entriesByDate([
      { endDate: "2026-08-01", startDate: "2026-08-28" },
    ]);
    expect([...byDate.keys()]).toEqual(["2026-08-28"]);
  });
});
