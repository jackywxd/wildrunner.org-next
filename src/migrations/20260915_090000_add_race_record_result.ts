import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Whether a member finished the race they logged, and in what time.
 *
 * WHAT THIS DOES TO EXISTING DATA: nothing. Two nullable columns are added and
 * no row is read or rewritten. `race_records` has meant "a race a member has
 * finished" since it was written — that is the first line of its own collection
 * header — so every existing row is a finish, and the field's `defaultValue` in
 * `RaceRecords.ts` says `finished` for rows written from here on. **There is no
 * backfill, deliberately**: an `UPDATE` that set the same meaning the absence
 * already carries would be a rewrite of every member's history to change
 * nothing, and it is `down()` that would then have no way to tell the rows it
 * touched from the ones a member has since edited.
 *
 * Reading `result` as "finished unless it says otherwise" is therefore correct
 * for old and new rows alike, and `src/lib/content.ts` maps a NULL to
 * `finished` for exactly that reason.
 *
 * THE WAY BACK is `down()`, and here it is a genuine one: both columns are new,
 * nothing else references them, and dropping them restores the previous schema
 * exactly. The rows a member has entered since would lose their result and
 * time, which no bookmark restore can avoid either — that is what the
 * time-travel window is for, and it is worth reading before approving this.
 *
 * ONE TABLE, NOT TWO. Every recent migration here touches a collection *and*
 * its `_..._v` shadow, because Payload keeps one per collection with
 * `versions: { drafts: true }`. `RaceRecords` has no `versions` block — checked,
 * not assumed — so there is no `_race_records_v` and no `version_` columns. A
 * second pair of statements here would fail on a table that does not exist.
 *
 * NOT INDEXED, for the reason every recent column here is not: SQLite refuses
 * `DROP COLUMN` on an indexed column, which would force `down()` to rebuild the
 * table. Nothing queries by either value — a member's records are already in
 * hand wherever these are read, and the badge wall filters in memory over tens
 * of rows.
 *
 * `finish_seconds` IS AN INTEGER COUNT OF SECONDS, not `"38:42:15"`. Text sorts
 * wrongly for durations (`"9:00:00"` after `"38:42:15"`), so storing the
 * rendered string would make "who was fastest at this race" unanswerable
 * forever. `src/lib/races/finish-time.ts` is the only place that converts.
 *
 * SAFE TO RUN TWICE, per AGENTS.md: `next build` enters migrations from a pool
 * of worker processes and the ledger row is written only after `up()` returns,
 * so several of them can be inside this file at once. Each statement is
 * attempted and its "already applied" error tolerated — never checked for
 * first, which is the shape that took staging down.
 */

const ADD_RESULT = sql`ALTER TABLE \`race_records\` ADD \`result\` text;`
const ADD_SECONDS = sql`ALTER TABLE \`race_records\` ADD \`finish_seconds\` numeric;`
const DROP_RESULT = sql`ALTER TABLE \`race_records\` DROP COLUMN \`result\`;`
const DROP_SECONDS = sql`ALTER TABLE \`race_records\` DROP COLUMN \`finish_seconds\`;`

const ALREADY_ADDED = /duplicate column name/i
const ALREADY_DROPPED = /no such column/i

/**
 * Every message in an error's cause chain, joined.
 *
 * Drizzle puts its own summary on `.message` ("Failed query: ALTER TABLE
 * ...") and leaves the database's actual complaint one or two `cause` levels
 * down, so a matcher reading `.message` alone tolerates nothing and fails
 * exactly as if it were not there. Copied rather than shared with the
 * migrations that already carry it: an applied migration is a historical
 * record, and editing a helper it imports would silently change what a fresh
 * database replays.
 */
function allMessages(error: unknown): string {
  const parts: string[] = []
  let current: unknown = error
  // Bounded rather than `while (current)`: a cause chain that loops back on
  // itself would hang the migration instead of failing it.
  for (let depth = 0; depth < 8 && current instanceof Error; depth += 1) {
    parts.push(current.message)
    current = current.cause
  }
  return parts.join('\n')
}

async function runTolerating(
  db: MigrateUpArgs['db'],
  statement: typeof ADD_RESULT,
  tolerate: RegExp,
): Promise<boolean> {
  try {
    await db.run(statement)
    return true
  } catch (error) {
    if (tolerate.test(allMessages(error))) return false
    throw error
  }
}

export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  const result = await runTolerating(db, ADD_RESULT, ALREADY_ADDED)
  const seconds = await runTolerating(db, ADD_SECONDS, ALREADY_ADDED)
  // Reported separately, because the two can genuinely differ: a run that
  // died between the statements leaves the first column present and the
  // second absent, and that asymmetry is the thing worth seeing in a log.
  payload.logger.info(
    `race_records.result: ${result ? 'added' : 'already present'}; ` +
      `race_records.finish_seconds: ${seconds ? 'added' : 'already present'}`,
  )
}

export async function down({ db, payload }: MigrateDownArgs): Promise<void> {
  // Reverse order of `up`, so a half-applied `down` leaves the same shape a
  // half-applied `up` does rather than a third one.
  const seconds = await runTolerating(db, DROP_SECONDS, ALREADY_DROPPED)
  const result = await runTolerating(db, DROP_RESULT, ALREADY_DROPPED)
  payload.logger.info(
    `race_records.finish_seconds: ${seconds ? 'dropped' : 'already absent'}; ` +
      `race_records.result: ${result ? 'dropped' : 'already absent'}`,
  )
}
