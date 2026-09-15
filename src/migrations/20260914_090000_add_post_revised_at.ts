import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * When an article was re-published, as distinct from when it first appeared.
 *
 * `publishedAt` was being overwritten on every publish (the member editor
 * stamped `new Date()` into the request body), so an article edited a year
 * later read as brand new and sorted to the top of `/posts`. Two columns are
 * what tells "first published" from "last revised"; this is the second one,
 * and `publishedAt` stops moving once it is set.
 *
 * NULL IS THE ORDINARY VALUE and it means "never revised since publishing" —
 * which is true of every article in the database on the day this runs, and
 * stays true for one that is published and never touched again. The public
 * page renders a second line only when this is set, so a backfill would be
 * wrong twice over: it would claim a revision date nobody made, on every
 * existing article at once.
 *
 * THE SAME PAIR OF TABLES as `20260903_120000_add_post_music_url`, and for
 * the same reason: `posts` has `versions: { drafts: true }`, so Payload keeps
 * a shadow `_posts_v` whose columns carry a `version_` prefix. A field added
 * to the collection and to `posts` alone typechecks, migrates cleanly, and
 * then 500s the first time a member saves a draft, because drizzle writes a
 * column the shadow table does not have.
 *
 * NOT INDEXED, for the reason every recent column here is not: SQLite refuses
 * `DROP COLUMN` on an indexed column, which would force `down()` to rebuild
 * the table. Nothing sorts or filters by this value — `/posts` still orders
 * by `publishedAt`, deliberately, because a reader looking for "what is new"
 * means new articles, not old ones with a typo fixed.
 *
 * SAFE TO RUN TWICE, per AGENTS.md: `next build` enters migrations from a pool
 * of worker processes and the ledger row is written only after `up()` returns,
 * so several of them can be inside this file at once. Each statement is
 * attempted and its "already applied" error tolerated — never checked for
 * first, which is the shape that took staging down.
 */

const ADD_LIVE = sql`ALTER TABLE \`posts\` ADD \`revised_at\` text;`
const ADD_VERSION = sql`ALTER TABLE \`_posts_v\` ADD \`version_revised_at\` text;`
const DROP_LIVE = sql`ALTER TABLE \`posts\` DROP COLUMN \`revised_at\`;`
const DROP_VERSION = sql`ALTER TABLE \`_posts_v\` DROP COLUMN \`version_revised_at\`;`

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
  statement: typeof ADD_LIVE,
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
  const live = await runTolerating(db, ADD_LIVE, ALREADY_ADDED)
  const version = await runTolerating(db, ADD_VERSION, ALREADY_ADDED)
  // Reported separately, because the two can genuinely differ: a run that
  // died between the statements leaves the live column present and the shadow
  // column absent, and that asymmetry is the thing worth seeing in a log.
  payload.logger.info(
    `posts.revised_at: ${live ? 'added' : 'already present'}; ` +
      `_posts_v.version_revised_at: ${version ? 'added' : 'already present'}`,
  )
}

export async function down({ db, payload }: MigrateDownArgs): Promise<void> {
  // Reverse order of `up`, so a half-applied `down` leaves the same shape a
  // half-applied `up` does rather than a third one.
  const version = await runTolerating(db, DROP_VERSION, ALREADY_DROPPED)
  const live = await runTolerating(db, DROP_LIVE, ALREADY_DROPPED)
  payload.logger.info(
    `_posts_v.version_revised_at: ${version ? 'dropped' : 'already absent'}; ` +
      `posts.revised_at: ${live ? 'dropped' : 'already absent'}`,
  )
}
