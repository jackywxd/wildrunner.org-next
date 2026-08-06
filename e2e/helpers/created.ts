/**
 * A ledger of rows this run created, so cleanup deletes what was made rather
 * than what matches a pattern.
 *
 * WHY. `cleanup-staging-test-data.ts` used to choose its victims by shape —
 * schedule rows whose name starts with `E2E `, posts whose slug is absent from
 * production. A keep-list built from prod's live API kept that mostly safe,
 * but *mostly* is the wrong property for a delete against a shared,
 * internet-reachable database: a real post titled `E2E 訓練心得` matches the
 * same rule as a fixture.
 *
 * The rule this replaces it with: **only ids recorded at creation are
 * deleted.** A pattern may still *report* what looks like residue — that
 * visibility is worth keeping — but it no longer decides what is destroyed.
 *
 * Append-only JSONL, one row per line, so a crashed spec still leaves behind
 * everything it managed to create. A file the process never finishes writing
 * costs one unparsable last line, not the whole ledger.
 *
 * Staging is the environment this exists for. On a developer's machine and in
 * CI the database is rebuilt per run, so nothing needs recording; calling this
 * there is harmless and simply produces a file nobody reads.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const LEDGER =
  process.env.E2E_CREATED_LEDGER ?? "test-results/created-on-staging.jsonl";

export type CreatedRow = {
  collection: string;
  id: string | number;
  /** Free text for the report — never used to match anything. */
  note?: string;
};

/**
 * Record a row the moment it exists — before the assertions that might fail,
 * for the same reason teardown captures ids early. A row created and not
 * recorded is a row cleanup has no right to remove.
 */
export function recordCreated(row: CreatedRow): void {
  try {
    mkdirSync(dirname(LEDGER), { recursive: true });
    appendFileSync(LEDGER, `${JSON.stringify(row)}\n`, "utf8");
  } catch (error) {
    // Deliberately loud rather than swallowed: an unrecorded row is a row
    // that will be left on staging forever, and the run should say so while
    // somebody is still watching.
    console.error(
      `[created] failed to record ${row.collection}/${row.id}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
