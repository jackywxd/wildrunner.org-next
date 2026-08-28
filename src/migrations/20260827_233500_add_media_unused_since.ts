import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * When the unused-media sweep first found this row referenced by nothing.
 *
 * The sweep never deletes on the run that finds a file unused — it writes
 * this date, mails the owner, and only removes the file on a later run once
 * the grace period has passed. That two-stage shape is the whole reason for
 * the column: without somewhere to remember "I have already told someone
 * about this", a weekly job either deletes immediately or mails the same
 * list every week forever.
 *
 * Deliberately nullable with no default. NULL means "not currently marked",
 * which is also the correct state for every row that exists today, so there
 * is no backfill here and no window where existing media looks condemned.
 *
 * NOT INDEXED, matching `20260826_072758_add_race_category_qualifiers`'s
 * reasoning: SQLite refuses `DROP COLUMN` on an indexed column, which would
 * force `down()` to rebuild the table. The sweep reads every media row
 * anyway — it has to, since deciding "unused" means comparing against every
 * reference in the database — so an index would save nothing.
 *
 * SAFE TO RUN TWICE, which is a requirement rather than a nicety: `next
 * build` collects page data in a pool of worker processes, each boots its
 * own Payload, and `@payloadcms/drizzle` writes the `payload_migrations`
 * row only *after* `up()` returns, so several of them enter this file at
 * once. See AGENTS.md and the header of the qualifiers migration for the
 * staging outage that established this.
 */

const ADD_COLUMN = sql`ALTER TABLE \`media\` ADD \`unused_since\` text;`
const DROP_COLUMN = sql`ALTER TABLE \`media\` DROP COLUMN \`unused_since\`;`

const ALREADY_ADDED = /duplicate column name/i
const ALREADY_DROPPED = /no such column/i

/**
 * Every message in an error's cause chain, joined.
 *
 * Drizzle puts its own summary on `.message` ("Failed query: ALTER TABLE
 * ...") and leaves the database's actual complaint one or two `cause`
 * levels down, so a matcher reading `.message` alone tolerates nothing and
 * fails exactly as if it were not there. Copied rather than shared with the
 * qualifiers migration on purpose: an applied migration is a historical
 * record, and editing a helper it imports would silently change what a
 * fresh database replays.
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
  statement: typeof ADD_COLUMN,
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
  const added = await runTolerating(db, ADD_COLUMN, ALREADY_ADDED)
  // Reports what happened rather than what was intended: with two processes
  // in here at once the two answers differ, and that difference is the only
  // visible trace of the race.
  payload.logger.info(
    `media.unused_since: ${added ? 'added' : 'already present'}`,
  )
}

export async function down({ db, payload }: MigrateDownArgs): Promise<void> {
  const dropped = await runTolerating(db, DROP_COLUMN, ALREADY_DROPPED)
  payload.logger.info(
    `media.unused_since: ${dropped ? 'dropped' : 'already absent'}`,
  )
}
