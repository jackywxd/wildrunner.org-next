import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * What a file is called on screen, when somebody has said.
 *
 * The gallery labels a video by decoding the last segment of its URL, which
 * on the real corpus reads as `馬營2019-final` or `SQ 5050 [2024] H264` — a
 * filename, because that is all there was. `media.alt` looks like the answer
 * and is not: it is required, it describes content for a screen reader, and
 * on these rows it holds the album name plus the filename with its extension
 * (`2023 - UTMB UTMB 2023 Vertical.m4v`). See the field's own header.
 *
 * Deliberately nullable with no default, and no backfill. NULL means "nobody
 * has named this", which is the honest state of every existing row and the
 * state `mediaDisplayName` already handles — it falls back to exactly the
 * derivation it does today. So this migration changes nothing that renders
 * until a member types something.
 *
 * NOT INDEXED, matching `20260827_233500_add_media_unused_since` and
 * `20260901_200000_add_media_poster_url`: SQLite refuses `DROP COLUMN` on an
 * indexed column, which would force `down()` to rebuild the table, and
 * nothing queries by this value — every reader already has the row in hand.
 *
 * SAFE TO RUN TWICE, which is a requirement rather than a nicety: `next
 * build` collects page data in a pool of worker processes, each boots its own
 * Payload, and `@payloadcms/drizzle` writes the `payload_migrations` row only
 * *after* `up()` returns, so several of them enter this file at once. See
 * AGENTS.md for the staging outage that established this.
 */

const ADD_COLUMN = sql`ALTER TABLE \`media\` ADD \`title\` text;`
const DROP_COLUMN = sql`ALTER TABLE \`media\` DROP COLUMN \`title\`;`

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
  payload.logger.info(`media.title: ${added ? 'added' : 'already present'}`)
}

export async function down({ db, payload }: MigrateDownArgs): Promise<void> {
  const dropped = await runTolerating(db, DROP_COLUMN, ALREADY_DROPPED)
  payload.logger.info(`media.title: ${dropped ? 'dropped' : 'already absent'}`)
}
