import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * A YouTube link an article plays as background music while it is read aloud.
 *
 * THE SAME PAIR OF TABLES as `20260902_160000_add_gallery_music_url`, and for
 * the same reason: `posts` has `versions: { drafts: true }`, so Payload keeps
 * a shadow `_posts_v` whose columns carry a `version_` prefix — checked
 * against the local database rather than assumed (`version_title`,
 * `version_slug`). A field added to the collection and to `posts` alone
 * typechecks, migrates cleanly, and then 500s the first time a member saves a
 * draft, because drizzle writes a column the shadow table does not have. That
 * migration's header names `_posts_v` as the only other shadow table in the
 * schema; this is it.
 *
 * NOT INDEXED, for the reason every recent column here is not: SQLite refuses
 * `DROP COLUMN` on an indexed column, which would force `down()` to rebuild
 * the table. Nothing queries by this value — the post row is already in hand
 * wherever it is read.
 *
 * NO VALIDATION HERE. The column is plain `text`; what makes it a YouTube link
 * is `Posts.ts`'s `validate`, and what makes it safe is that nothing passes the
 * stored string to an `<iframe src>` — `resolveAlbumMusic` re-derives an
 * 11-character id and `SlideshowMusic` rebuilds the URL from that. See
 * `src/lib/youtube.ts`.
 *
 * SAFE TO RUN TWICE, per AGENTS.md: `next build` enters migrations from a pool
 * of worker processes and the ledger row is written only after `up()` returns,
 * so several of them can be inside this file at once. Each statement is
 * attempted and its "already applied" error tolerated — never checked for
 * first, which is the shape that took staging down.
 */

const ADD_LIVE = sql`ALTER TABLE \`posts\` ADD \`music_url\` text;`
const ADD_VERSION = sql`ALTER TABLE \`_posts_v\` ADD \`version_music_url\` text;`
const DROP_LIVE = sql`ALTER TABLE \`posts\` DROP COLUMN \`music_url\`;`
const DROP_VERSION = sql`ALTER TABLE \`_posts_v\` DROP COLUMN \`version_music_url\`;`

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
    `posts.music_url: ${live ? 'added' : 'already present'}; ` +
      `_posts_v.version_music_url: ${version ? 'added' : 'already present'}`,
  )
}

export async function down({ db, payload }: MigrateDownArgs): Promise<void> {
  // Reverse order of `up`, so a half-applied `down` leaves the same shape a
  // half-applied `up` does rather than a third one.
  const version = await runTolerating(db, DROP_VERSION, ALREADY_DROPPED)
  const live = await runTolerating(db, DROP_LIVE, ALREADY_DROPPED)
  payload.logger.info(
    `_posts_v.version_music_url: ${version ? 'dropped' : 'already absent'}; ` +
      `posts.music_url: ${live ? 'dropped' : 'already absent'}`,
  )
}
