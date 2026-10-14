import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * `race_categories.historical` — an entry known from a member's UltraSignup
 * result rather than from the event's current line-up (RaceCategories.ts).
 *
 * Rewrites no row. Every existing category is a reviewed line-up entry, so
 * the column defaults to 0 and nothing changes for the 394 that are there.
 * Not indexed: SQLite refuses `DROP COLUMN` on an indexed column, and
 * `down()` is a plain drop because of it.
 *
 * SAFE TO RUN TWICE, for the reason 20261013_120000_add_ultrasignup_import
 * gives: build workers enter a pending migration together and the ledger
 * row lands after `up()` returns. The tolerated error is read off the
 * `cause` chain, where D1's own text sits.
 */

const ADD = sql`ALTER TABLE \`race_categories\` ADD \`historical\` integer DEFAULT false;`
const DROP = sql`ALTER TABLE \`race_categories\` DROP COLUMN \`historical\`;`

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
  statement: typeof ADD,
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
  const added = await runTolerating(db, ADD, ALREADY_ADDED)
  payload.logger.info(`race_categories.historical: ${added ? 'added' : 'already present'}`)
}

export async function down({ db, payload }: MigrateDownArgs): Promise<void> {
  const dropped = await runTolerating(db, DROP, ALREADY_DROPPED)
  payload.logger.info(`race_categories.historical: ${dropped ? 'dropped' : 'already absent'}`)
}
