import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Where a video's poster frame lives.
 *
 * `/gallery` draws every video as a dark card with a play glyph, because
 * there has never been anything stored to draw: measured before this,
 * 26 of 27 production videos carry no `width`/`height` and 27 of 27 no
 * `blurDataURL`. The transcoder container now takes one frame a second into
 * each video it handles and writes it to `posters/<id>.jpg`; this column is
 * where that URL lands.
 *
 * Deliberately nullable with no default, and no backfill here. NULL means
 * "no poster yet", which is the true state of every existing row — the frame
 * can only be taken by the container, and a migration cannot run ffmpeg.
 * Filling these in is a separate, resumable pass
 * (`scripts/backfill-video-posters.ts`) that asks the existing transcode
 * queue to run over each video, precisely because the work has to happen
 * where the container is.
 *
 * NOT INDEXED, matching `20260827_233500_add_media_unused_since`: SQLite
 * refuses `DROP COLUMN` on an indexed column, which would force `down()` to
 * rebuild the table, and nothing queries by this value — readers already
 * have the row in hand.
 *
 * SAFE TO RUN TWICE, which is a requirement rather than a nicety: `next
 * build` collects page data in a pool of worker processes, each boots its
 * own Payload, and `@payloadcms/drizzle` writes the `payload_migrations`
 * row only *after* `up()` returns, so several of them enter this file at
 * once. See AGENTS.md for the staging outage that established this.
 */

const ADD_COLUMN = sql`ALTER TABLE \`media\` ADD \`poster_url\` text;`
const DROP_COLUMN = sql`ALTER TABLE \`media\` DROP COLUMN \`poster_url\`;`

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
  payload.logger.info(`media.poster_url: ${added ? 'added' : 'already present'}`)
}

export async function down({ db, payload }: MigrateDownArgs): Promise<void> {
  const dropped = await runTolerating(db, DROP_COLUMN, ALREADY_DROPPED)
  payload.logger.info(
    `media.poster_url: ${dropped ? 'dropped' : 'already absent'}`,
  )
}
