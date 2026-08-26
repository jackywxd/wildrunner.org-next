import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Add the Western States / Hardrock qualifier flags to `race_categories`.
 *
 * DDL ONLY. NO DATA. The obvious alternative — backfill from a regenerated
 * `SEED_CATEGORIES`, the way `20260805_153543_add_race_domain_model` filled
 * these tables in the first place — is wrong here, and the reason is the
 * one AGENTS.md gives for editions: a migration runs **once per
 * environment**. Staging and production already have their categories, so
 * data carried in this file would reach a fresh database and never reach
 * them. Every later refresh would then have to go somewhere else anyway,
 * and the two would drift apart permanently.
 *
 * So the flags travel the editions road instead:
 * `data/race-categories.csv` → `scripts/import-race-qualifiers.ts` →
 * every environment, local and deployed alike. That also matches how the
 * data behaves: WSER and Hardrock republish their lists **every year**,
 * which is an import cadence, not a seed cadence.
 *
 * `src/lib/races/seed-data.ts` is deliberately NOT regenerated with these
 * columns. `scripts/csv-to-seed.ts` maps category fields by name, so the
 * new CSV columns are simply ignored there — which is what keeps this
 * change from perturbing the already-applied migration that imports it.
 *
 * THE COLUMNS ARE NOT INDEXED, unlike `verified`/`verified_at` on the same
 * table. SQLite refuses `DROP COLUMN` on an indexed column, so an index
 * would force `down()` to rebuild the whole table and re-declare the
 * `(event_id, key)` unique constraint by hand — the constraint
 * `RaceCategories.ts` calls "a real database constraint rather than a
 * beforeValidate hook". Nothing would use the index: `/races` filters in
 * memory over categories the page has already loaded.
 *
 * EVERY STATEMENT HERE IS SAFE TO RUN TWICE, and that is a requirement
 * rather than a nicety. `next build` collects page data in a pool of
 * worker processes — eleven of them on the machine where this first ran —
 * and each boots its own Payload, connects, and applies whatever is
 * pending. Nothing serialises them, because
 * `@payloadcms/drizzle`'s `runMigrationFile` writes the
 * `payload_migrations` row *after* `up()` returns:
 *
 *     await migration.up({ db, payload, req })
 *     await payload.create({ collection: 'payload-migrations', ... })
 *
 * So two workers both find this migration pending and both enter it. The
 * first version of this file guarded with `PRAGMA table_info` and added
 * only the missing columns — a check-then-act that cannot help, since both
 * reads land before either write. The staging deploy failed on exactly
 * that: "race_categories has 12 columns" printed twice, both workers
 * deciding to add all four, and the loser exiting on `duplicate column
 * name`. D1 has no transactional DDL, so the winner's columns survived
 * with no ledger row.
 *
 * This is not specific to this migration. Any DDL in this repo applied
 * through a build is entered concurrently, and must be written the same
 * way. See AGENTS.md.
 */

const ADD_COLUMNS = {
  qualifies_wser: sql`ALTER TABLE \`race_categories\` ADD \`qualifies_wser\` integer DEFAULT false;`,
  wser_verified_at: sql`ALTER TABLE \`race_categories\` ADD \`wser_verified_at\` text;`,
  qualifies_hardrock: sql`ALTER TABLE \`race_categories\` ADD \`qualifies_hardrock\` integer DEFAULT false;`,
  hardrock_verified_at: sql`ALTER TABLE \`race_categories\` ADD \`hardrock_verified_at\` text;`,
} as const

const DROP_COLUMNS = {
  qualifies_wser: sql`ALTER TABLE \`race_categories\` DROP COLUMN \`qualifies_wser\`;`,
  wser_verified_at: sql`ALTER TABLE \`race_categories\` DROP COLUMN \`wser_verified_at\`;`,
  qualifies_hardrock: sql`ALTER TABLE \`race_categories\` DROP COLUMN \`qualifies_hardrock\`;`,
  hardrock_verified_at: sql`ALTER TABLE \`race_categories\` DROP COLUMN \`hardrock_verified_at\`;`,
} as const

type QualifierColumn = keyof typeof ADD_COLUMNS

/**
 * Run one DDL statement, treating `tolerate` as "already in that state".
 *
 * WHY MATCH THE ERROR RATHER THAN CHECK FIRST. Reading `PRAGMA table_info`
 * and adding only what is missing is the obvious shape, and it is wrong
 * here — provably, not stylistically. Two processes enter this migration
 * concurrently (see the header), and both of their reads happen before
 * either of their writes, so both compute the same "missing" list and the
 * loser dies on `duplicate column name`. That is exactly how the first
 * staging deploy of this migration failed, with the log showing the same
 * "race_categories has 12 columns" line printed twice.
 *
 * Attempting the statement and tolerating the one error that means "this
 * DDL is already applied" has no such window: whichever process loses is
 * told so by the database itself, after the fact. Every other error —
 * `no such table`, a permissions or disk failure — still fails the
 * migration, which is what should happen.
 */
async function runTolerating(
  db: MigrateUpArgs['db'],
  statement: (typeof ADD_COLUMNS)[QualifierColumn],
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

/**
 * Every message in an error's cause chain, joined.
 *
 * Drizzle does not put the database's complaint on the error it throws.
 * `.message` is its own summary — "Failed query: ALTER TABLE ... params: ."
 * — and the D1 text that actually says what went wrong sits one or two
 * `cause` levels down:
 *
 *     Error: Failed query: ALTER TABLE `race_categories` ADD ...
 *       caused by: Error: D1_ERROR: duplicate column name: qualifies_wser: SQLITE_ERROR
 *         caused by: Error: duplicate column name: qualifies_wser: SQLITE_ERROR
 *
 * A first version of this matched `.message` alone. It let the error
 * straight through and the migration failed exactly as it had before —
 * caught only because the fix was run against a table that already had the
 * columns before being believed.
 */
function allMessages(error: unknown): string {
  const parts: string[] = []
  let current: unknown = error
  // Bounded rather than `while (current)`: a cause chain that loops back on
  // itself would otherwise hang the migration instead of failing it.
  for (let depth = 0; depth < 8 && current instanceof Error; depth += 1) {
    parts.push(current.message)
    current = current.cause
  }
  return parts.join('\n')
}

const ALREADY_ADDED = /duplicate column name/i
const ALREADY_DROPPED = /no such column/i

export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  const added: string[] = []
  const skipped: string[] = []

  for (const column of Object.keys(ADD_COLUMNS) as QualifierColumn[]) {
    const did = await runTolerating(db, ADD_COLUMNS[column], ALREADY_ADDED)
    ;(did ? added : skipped).push(column)
  }

  // Reports what happened, not what was intended: with two processes in
  // here at once, "added" and "skipped" differ between them, and that
  // difference is the only visible trace of the race.
  payload.logger.info(
    `race category qualifiers: added ${added.length ? added.join(', ') : 'none'}` +
      `${skipped.length ? `; already present: ${skipped.join(', ')}` : ''}`,
  )
}

export async function down({ db, payload }: MigrateDownArgs): Promise<void> {
  const dropped: string[] = []
  const skipped: string[] = []

  for (const column of Object.keys(DROP_COLUMNS) as QualifierColumn[]) {
    const did = await runTolerating(db, DROP_COLUMNS[column], ALREADY_DROPPED)
    ;(did ? dropped : skipped).push(column)
  }

  payload.logger.info(
    `race category qualifiers: dropped ${dropped.length ? dropped.join(', ') : 'none'}` +
      `${skipped.length ? `; already absent: ${skipped.join(', ')}` : ''}`,
  )
}
