import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Which race an album is of — tagged once on the album, not once per photo.
 *
 * THE TAG ALREADY EXISTED AND NOBODY COULD USE IT. `media.raceEdition` has
 * been the association since race walls shipped, and it is per file: an album
 * of 28 photos needs 28 edits. Measured on the seeded corpus the day this was
 * written: **420 media rows, 0 of them tagged**, while the albums are named
 * `UTMB 2025`, `Sinister7 2025`, `Mt Fuji 100 | 2025` — the association exists
 * in the titles and nowhere a query can reach. One column on the album is what
 * makes it reachable.
 *
 * ADDITIVE, NOT A REPLACEMENT. `media.raceEdition` stays and stays
 * authoritative for a single photo; this answers the different question "what
 * is this whole album of". A reader takes the album's tag when it has one and
 * otherwise the tags its own items carry, so nothing that works today stops
 * working — see `albumRaceEditionId` in `gallery-index.ts`.
 *
 * TWO TABLES, NOT ONE, and that is the whole difficulty. `galleries` has
 * `versions: { drafts: true }`, so Payload keeps a shadow table `_galleries_v`
 * whose columns are the same fields under a `version_` prefix — read off the
 * local database rather than assumed: `version_cover_id`, `version_owner_id`,
 * `version_event_date`. A field added to the collection and to `galleries`
 * alone typechecks, migrates cleanly, and then 500s the first time an admin
 * saves a draft, because drizzle writes a column the shadow table does not
 * have. Exactly the note `20260902_160000_add_gallery_music_url` carries.
 *
 * NOT INDEXED, for the reason every recent column here is not: SQLite refuses
 * `DROP COLUMN` on an indexed column, which would force `down()` to rebuild
 * the table. Nothing queries by this value — every reader already holds the
 * album row, and there are 20 of them.
 *
 * SAFE TO RUN TWICE, per AGENTS.md: `next build` enters migrations from a pool
 * of worker processes and the ledger row is written only after `up()` returns,
 * so several of them can be inside this file at once. Each statement is
 * attempted and its "already applied" error tolerated — never checked for
 * first, which is the shape that took staging down.
 */

const ADD_LIVE = sql`ALTER TABLE \`galleries\` ADD \`race_edition_id\` integer REFERENCES race_editions(id);`
const ADD_VERSION = sql`ALTER TABLE \`_galleries_v\` ADD \`version_race_edition_id\` integer REFERENCES race_editions(id);`
const DROP_LIVE = sql`ALTER TABLE \`galleries\` DROP COLUMN \`race_edition_id\`;`
const DROP_VERSION = sql`ALTER TABLE \`_galleries_v\` DROP COLUMN \`version_race_edition_id\`;`

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
  // Reported separately, because the two can genuinely differ: a run that died
  // between the statements leaves the live column present and the shadow
  // column absent, and that asymmetry is the thing worth seeing in a log.
  payload.logger.info(
    `galleries.race_edition_id: ${live ? 'added' : 'already present'}; ` +
      `_galleries_v.version_race_edition_id: ${version ? 'added' : 'already present'}`,
  )
}

export async function down({ db, payload }: MigrateDownArgs): Promise<void> {
  // Reverse order of `up`, so a half-applied `down` leaves the same shape a
  // half-applied `up` does rather than a third one.
  const version = await runTolerating(db, DROP_VERSION, ALREADY_DROPPED)
  const live = await runTolerating(db, DROP_LIVE, ALREADY_DROPPED)
  payload.logger.info(
    `_galleries_v.version_race_edition_id: ${version ? 'dropped' : 'already absent'}; ` +
      `galleries.race_edition_id: ${live ? 'dropped' : 'already absent'}`,
  )
}
