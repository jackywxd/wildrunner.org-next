import { expect, test } from "@playwright/test";

import {
  ALREADY_ADDED,
  ALREADY_DROPPED,
  allMessages,
} from "@/migrations/20260905_101900_add_post_english";

/**
 * U-MIGTOL — the migration tolerates exactly what it must, and no less.
 *
 * WHY THIS IS A TEST AND NOT A COMMENT. AGENTS.md records that this repo has
 * already shipped a matcher that tolerated nothing: "Drizzle's `.message` is
 * its own summary (`Failed query: ALTER TABLE ...`); the D1 text sits one or
 * two `cause` levels down. A matcher reading `.message` alone silently
 * tolerates nothing." Silently — the migration would just fail, in a pool of
 * build workers, on the one path this whole shape exists to survive.
 *
 * THE STRINGS ARE REAL. Both were produced by running the statement against
 * this project's local D1 through wrangler, not written from memory:
 *
 *   ALTER TABLE `posts` ADD `english_title` text;
 *     → duplicate column name: english_title: SQLITE_ERROR
 *   ALTER TABLE `posts` DROP COLUMN `english_not_a_real_column`;
 *     → no such column: "`english_not_a_real_column`" at offset 32: SQLITE_ERROR
 */

const D1_DUPLICATE = "duplicate column name: english_title: SQLITE_ERROR";
const D1_NO_COLUMN =
  'no such column: "`english_not_a_real_column`" at offset 32: SQLITE_ERROR';

/** What Drizzle hands the migration: its own summary, the real text underneath. */
function asDrizzleWould(d1Text: string): Error {
  const inner = new Error(d1Text);
  return new Error(
    "Failed query: ALTER TABLE `posts` ADD `english_title` text;\nparams: ",
    { cause: inner },
  );
}

test.describe("U-MIGTOL the english migration's error tolerance", () => {
  test("U-MIGTOL-1: the real D1 messages match, through the cause chain", () => {
    expect(ALREADY_ADDED.test(allMessages(asDrizzleWould(D1_DUPLICATE)))).toBe(true);
    expect(ALREADY_DROPPED.test(allMessages(asDrizzleWould(D1_NO_COLUMN)))).toBe(true);
  });

  test("U-MIGTOL-2: reading only .message would tolerate nothing", () => {
    // The bug this guards, stated as an assertion: Drizzle's own summary
    // contains neither phrase, so a matcher that stopped at `.message` would
    // re-throw on exactly the errors the migration is built to survive.
    const summaryOnly = asDrizzleWould(D1_DUPLICATE).message;
    expect(ALREADY_ADDED.test(summaryOnly)).toBe(false);
    expect(ALREADY_DROPPED.test(asDrizzleWould(D1_NO_COLUMN).message)).toBe(false);
  });

  test("U-MIGTOL-3: an unrelated failure is not tolerated", () => {
    // The other half, and the one that matters more: a tolerance that matched
    // too much would swallow a real failure and report success over a
    // half-applied schema — the state AGENTS.md records as having taken
    // production down.
    const real = asDrizzleWould("database is locked: SQLITE_BUSY");
    expect(ALREADY_ADDED.test(allMessages(real))).toBe(false);
    expect(ALREADY_DROPPED.test(allMessages(real))).toBe(false);
  });

  test("U-MIGTOL-4: a cause chain that loops does not hang", () => {
    // `allMessages` is bounded for this reason; an unbounded walk would spin
    // inside a migration rather than fail it.
    const a = new Error("a");
    const b = new Error("b", { cause: a });
    (a as Error & { cause?: unknown }).cause = b;
    expect(allMessages(b).split("\n").length).toBeLessThanOrEqual(8);
  });
});
