import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * The name a member fetches UltraSignup with, and the event titles that
 * name is allowed to match.
 *
 * Neither column rewrites a row. `users.ultrasignup_name` is empty until a
 * member saves one. `race_events.ultrasignup_aliases` is empty until an
 * admin has read an UltraSignup page and written the title down — the
 * catalogue name is already tried, so an empty column changes no match.
 *
 * No version tables. `Users` sets `versions: false` and `RaceEvents` has no
 * versions block, so there is no `_users_v` / `_race_events_v` to alter.
 *
 * SAFE TO RUN TWICE. Build workers enter a pending migration together and
 * the ledger row is written after `up()` returns. Each statement tolerates
 * the one error that means another worker already applied it. The database
 * text is on the cause chain, not on Drizzle's `.message`.
 */

const ADD_NAME = sql`ALTER TABLE \`users\` ADD \`ultrasignup_name\` text;`
const ADD_ALIASES = sql`ALTER TABLE \`race_events\` ADD \`ultrasignup_aliases\` text;`
const DROP_NAME = sql`ALTER TABLE \`users\` DROP COLUMN \`ultrasignup_name\`;`
const DROP_ALIASES = sql`ALTER TABLE \`race_events\` DROP COLUMN \`ultrasignup_aliases\`;`

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
  statement: typeof ADD_NAME,
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
  const name = await runTolerating(db, ADD_NAME, ALREADY_ADDED)
  const aliases = await runTolerating(db, ADD_ALIASES, ALREADY_ADDED)
  payload.logger.info(
    `users.ultrasignup_name: ${name ? 'added' : 'already present'}; ` +
      `race_events.ultrasignup_aliases: ${aliases ? 'added' : 'already present'}`,
  )
}

export async function down({ db, payload }: MigrateDownArgs): Promise<void> {
  const aliases = await runTolerating(db, DROP_ALIASES, ALREADY_DROPPED)
  const name = await runTolerating(db, DROP_NAME, ALREADY_DROPPED)
  payload.logger.info(
    `race_events.ultrasignup_aliases: ${aliases ? 'dropped' : 'already absent'}; ` +
      `users.ultrasignup_name: ${name ? 'dropped' : 'already absent'}`,
  )
}
