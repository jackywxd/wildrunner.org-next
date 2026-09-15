import { expect, test } from "@playwright/test";

import { formatFinishTime, parseFinishTime } from "@/lib/races/finish-time";

/**
 * U-RACETIME — a finishing time survives the round trip, and an ultra's
 * hours survive it too.
 *
 * The bug this exists to prevent is not a formatting nit. A hundred-miler
 * takes 30-40 hours, and every obvious way to format a duration in
 * JavaScript is really a *clock* — `new Date(ms).toISOString().slice(11,19)`
 * renders 38 hours as `14:42:15`, which is a valid-looking time and a
 * different finish. Nothing downstream could detect that; the number would
 * simply be wrong on the page.
 *
 * Pure in, pure out, so it belongs here rather than in a browser spec that
 * would have to publish a race report to observe one string.
 */

test.describe("U-RACETIME finishing times", () => {
  test("U-RACETIME-1: an ultra's hours are not wrapped at 24", () => {
    // 38:42:15 — the shape that a Date-based formatter renders as 14:42:15.
    const seconds = 38 * 3600 + 42 * 60 + 15;
    expect(formatFinishTime(seconds)).toBe("38:42:15");
    expect(parseFinishTime("38:42:15")).toBe(seconds);
  });

  test("U-RACETIME-2: minutes and seconds are padded, hours are not", () => {
    // `9:05:00`, not `09:05:00` — that is how a results page writes it, and
    // the field accepts it back in the same shape.
    expect(formatFinishTime(9 * 3600 + 5 * 60)).toBe("9:05:00");
    expect(formatFinishTime(0)).toBe("0:00:00");
  });

  test("U-RACETIME-3: both H:MM:SS and HH:MM:SS parse", () => {
    expect(parseFinishTime("4:30:00")).toBe(16_200);
    expect(parseFinishTime("04:30:00")).toBe(16_200);
    // Whitespace is what a paste from a results page brings with it.
    expect(parseFinishTime("  4:30:00  ")).toBe(16_200);
  });

  test("U-RACETIME-4: anything that is not a finishing time is null, never 0", () => {
    // `0` would be worse than a throw: it is a valid duration, so a typo
    // would store a finish of zero seconds and render as `0:00:00`.
    for (const input of [
      "",
      "abc",
      "45:30", // MM:SS — deliberately refused, see the header
      "4:60:00", // minutes out of range
      "4:30:60", // seconds out of range
      "4:3:00", // minutes not padded
      "-1:00:00",
      "4:30:00.5",
    ]) {
      expect(parseFinishTime(input), `${input} should not parse`).toBeNull();
    }
  });

  test("U-RACETIME-5: every whole second round-trips", () => {
    // Spot values rather than an exhaustive sweep: one under an hour, one
    // over a day, and the two boundaries where the padding changes.
    for (const seconds of [1, 59, 60, 3599, 3600, 86_399, 86_400, 139_335]) {
      expect(parseFinishTime(formatFinishTime(seconds))).toBe(seconds);
    }
  });
});
