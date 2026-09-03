import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * The background music for a race's own album.
 *
 * `galleries.musicUrl` covers albums somebody curated. It cannot cover the
 * ones that matter most for a race, because those are not rows: a race album
 * is synthesised from whatever media carries that `raceEdition` tag
 * (`buildRaceGallery`), and `src/lib/race-gallery.ts` explains at length why
 * it is derived rather than stored — a stored copy would be a second source
 * for "which photos are this race's" and would diverge the first time somebody
 * retagged one. So the music has to hang off the thing that *does* exist, and
 * that is the edition.
 *
 * Which is also the right place for it on its own terms: a race's music is the
 * race's, shared by everyone who opens that album, not a property of one
 * viewing.
 *
 * ONE TABLE, unlike `20260902_160000_add_gallery_music_url`. `race-editions`
 * has no `versions`/`drafts`, so there is no `_race_editions_v` shadow to keep
 * in step — checked against `sqlite_master`, which holds exactly two shadow
 * tables, `_posts_v` and `_galleries_v`.
 *
 * NOT INDEXED, for the reason every recent column here is not: SQLite refuses
 * `DROP COLUMN` on an indexed column, which would force `down()` to rebuild
 * the table. Nothing queries by this value — `getRaceEditionsByIds` already
 * has the row in hand.
 *
 * NO VALIDATION HERE. The column is plain `text`; what makes it a YouTube
 * link is `RaceEditions.ts`'s `validate`, and what makes it safe is that the
 * renderer never passes the stored string to an `<iframe src>` — it re-derives
 * an eleven-character id with `youTubeVideoId` and rebuilds the URL.
 *
 * SAFE TO RUN TWICE, per AGENTS.md: `next build` enters migrations from a pool
 * of worker processes and the ledger row is written only after `up()` returns.
 */

const ADD_COLUMN = sql`ALTER TABLE \`race_editions\` ADD \`music_url\` text;`
const DROP_COLUMN = sql`ALTER TABLE \`race_editions\` DROP COLUMN \`music_url\`;`

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
  payload.logger.info(`race_editions.music_url: ${added ? 'added' : 'already present'}`)
}

export async function down({ db, payload }: MigrateDownArgs): Promise<void> {
  const dropped = await runTolerating(db, DROP_COLUMN, ALREADY_DROPPED)
  payload.logger.info(`race_editions.music_url: ${dropped ? 'dropped' : 'already absent'}`)
}
