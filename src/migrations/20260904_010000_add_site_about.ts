import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * The prose on /about, as something an admin can edit.
 *
 * That page rendered `metadata.description` as its entire body — the sentence
 * written for a search result, already present in a `<meta>` tag on every
 * page, doing duty as a club's self-introduction. This column is where the
 * real copy goes. The field's own header says why it is a `textarea` and not
 * rich text.
 *
 * ONE COLUMN ON `site`, and nothing else. Checked rather than assumed:
 * `pragma_table_info('site')` on the local database returns id,
 * hero_title_en, hero_title_zh, metadata_title_default,
 * metadata_title_template, metadata_description, social_github, updated_at,
 * created_at — no `about`, and `sqlite_master` holds no `_site_v`, because
 * `site` is a global with no drafts. So unlike `galleries` there is no shadow
 * table needing a `version_about` alongside.
 *
 * Nullable, no default, no backfill. NULL means "nobody has written one",
 * which is true of the single existing row on both deployed databases, and
 * the page falls back to the old description until somebody types something.
 * So applying this migration changes nothing that renders.
 *
 * NOT INDEXED, matching every recent column added here: SQLite refuses
 * `DROP COLUMN` on an indexed column, which would force `down()` to rebuild
 * the table, and nothing queries by this value — `getSiteGlobals` already has
 * the row in hand.
 *
 * SAFE TO RUN TWICE, which is a requirement and not a nicety: `next build`
 * collects page data in a pool of worker processes, each boots its own
 * Payload, and `@payloadcms/drizzle` writes the `payload_migrations` row only
 * *after* `up()` returns — so several of them enter this file at once. There
 * is no `IF NOT EXISTS` for `ADD COLUMN` in SQLite and, per AGENTS.md,
 * checking `PRAGMA table_info` first is the shape that took staging down:
 * both workers read before either writes, both compute the same missing
 * column, and the loser dies on `duplicate column name` with the winner's
 * column left behind and no ledger row. Attempting the statement and
 * tolerating exactly that one error is the only correct form.
 */

const ADD_COLUMN = sql`ALTER TABLE \`site\` ADD \`about\` text;`
const DROP_COLUMN = sql`ALTER TABLE \`site\` DROP COLUMN \`about\`;`

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
  payload.logger.info(`site.about: ${added ? 'added' : 'already present'}`)
}

export async function down({ db, payload }: MigrateDownArgs): Promise<void> {
  const dropped = await runTolerating(db, DROP_COLUMN, ALREADY_DROPPED)
  payload.logger.info(`site.about: ${dropped ? 'dropped' : 'already absent'}`)
}
