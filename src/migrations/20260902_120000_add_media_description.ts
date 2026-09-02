import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * What this photo or video is *about*, in a person's words.
 *
 * The third string on a media row, and the three are genuinely three things —
 * the reason this is not a reuse of either of the others is written out in the
 * field's own header. Briefly: `alt` is required and describes the picture for
 * a screen reader (on the migrated corpus it holds the album name plus the
 * original filename); `title` is the short label under a tile; this is the
 * caption, the sentence somebody would say about the photo.
 *
 * Deliberately nullable with no default, and no backfill. NULL means "nobody
 * has written one", which is the honest state of all 546 existing rows, and
 * every reader treats it as absent rather than as an empty caption. So this
 * migration changes nothing that renders until a member types something.
 *
 * NOT INDEXED, matching `20260901_213000_add_media_title` and the two before
 * it: SQLite refuses `DROP COLUMN` on an indexed column, which would force
 * `down()` to rebuild the table, and nothing queries by this value — every
 * reader already has the row in hand.
 *
 * NO SHADOW TABLE. `media` has no drafts, so unlike `galleries` there is no
 * `_media_v` needing a `version_description` alongside. Checked rather than
 * assumed: `sqlite_master` on the local database holds `_galleries_v` and
 * `_posts_v` and nothing else.
 *
 * SAFE TO RUN TWICE, which is a requirement rather than a nicety: `next build`
 * collects page data in a pool of worker processes, each boots its own
 * Payload, and `@payloadcms/drizzle` writes the `payload_migrations` row only
 * *after* `up()` returns, so several of them enter this file at once. See
 * AGENTS.md for the staging outage that established this.
 */

const ADD_COLUMN = sql`ALTER TABLE \`media\` ADD \`description\` text;`
const DROP_COLUMN = sql`ALTER TABLE \`media\` DROP COLUMN \`description\`;`

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
  payload.logger.info(`media.description: ${added ? 'added' : 'already present'}`)
}

export async function down({ db, payload }: MigrateDownArgs): Promise<void> {
  const dropped = await runTolerating(db, DROP_COLUMN, ALREADY_DROPPED)
  payload.logger.info(`media.description: ${dropped ? 'dropped' : 'already absent'}`)
}
