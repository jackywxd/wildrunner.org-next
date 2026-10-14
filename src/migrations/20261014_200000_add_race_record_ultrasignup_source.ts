import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Which UltraSignup row a race record was imported from
 * (`race-records.ultrasignupTitle` / `ultrasignupDate`).
 *
 * WHAT THIS DOES TO EXISTING DATA: nothing. Two nullable columns, empty on
 * every existing row — which is the truth, since no record has ever carried
 * this. No backfill: a record imported before now cannot be told from one
 * typed in by hand, and guessing would pin rows to records they are not.
 *
 * No version table: `RaceRecords` has no `versions` block. No index, so a
 * `DROP COLUMN` stays possible.
 *
 * SAFE TO RUN TWICE, per AGENTS.md: each statement tolerates the one error
 * meaning another build worker already applied it, read from the cause
 * chain because Drizzle's `.message` is its own summary.
 */

const ADD_TITLE = sql`ALTER TABLE \`race_records\` ADD \`ultrasignup_title\` text;`
const ADD_DATE = sql`ALTER TABLE \`race_records\` ADD \`ultrasignup_date\` text;`
const DROP_TITLE = sql`ALTER TABLE \`race_records\` DROP COLUMN \`ultrasignup_title\`;`
const DROP_DATE = sql`ALTER TABLE \`race_records\` DROP COLUMN \`ultrasignup_date\`;`

const ALREADY_ADDED = /duplicate column name/i
const ALREADY_DROPPED = /no such column/i

function allMessages(error: unknown): string {
  const parts: string[] = []
  let current: unknown = error
  for (let depth = 0; depth < 8 && current instanceof Error; depth += 1) {
    parts.push(current.message)
    current = current.cause
  }
  return parts.join('\n')
}

async function runTolerating(
  db: MigrateUpArgs['db'],
  statement: typeof ADD_TITLE,
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
  const title = await runTolerating(db, ADD_TITLE, ALREADY_ADDED)
  const date = await runTolerating(db, ADD_DATE, ALREADY_ADDED)
  payload.logger.info(
    `race_records.ultrasignup_title: ${title ? 'added' : 'already present'}; ` +
      `race_records.ultrasignup_date: ${date ? 'added' : 'already present'}`,
  )
}

export async function down({ db, payload }: MigrateDownArgs): Promise<void> {
  // Discards which UltraSignup row each imported record came from; the
  // records themselves are untouched.
  const date = await runTolerating(db, DROP_DATE, ALREADY_DROPPED)
  const title = await runTolerating(db, DROP_TITLE, ALREADY_DROPPED)
  payload.logger.info(
    `race_records.ultrasignup_date: ${date ? 'dropped' : 'already absent'}; ` +
      `race_records.ultrasignup_title: ${title ? 'dropped' : 'already absent'}`,
  )
}
