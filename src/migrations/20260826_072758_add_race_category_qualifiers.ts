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
 */

const QUALIFIER_COLUMNS = {
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

type QualifierColumn = keyof typeof QUALIFIER_COLUMNS

/**
 * Which of the four columns `race_categories` already has.
 *
 * `db.all`, NOT `db.run`. On D1 the driver types `run` as `D1Response` —
 * an acknowledgement with no rows on it — so reading a PRAGMA through it
 * yields `undefined` and a guard built on that would skip its own check
 * while reporting success. That is not hypothetical: the header of
 * `20260805_153543_add_race_domain_model` records exactly that mistake
 * being made once already, in this same table's migration.
 */
async function existingColumns(
  db: MigrateUpArgs['db'],
  payload: MigrateUpArgs['payload'],
): Promise<Set<string>> {
  const rows = await db.all<{ name: string }>(
    sql`PRAGMA table_info(\`race_categories\`);`,
  )
  const names = new Set(rows.map((row) => row.name).filter(Boolean))

  // An empty set means the PRAGMA came back in a shape this does not
  // understand, or the table is not there. Both are reasons to stop before
  // any DDL rather than to carry on and "add all four".
  if (names.size === 0) {
    throw new Error(
      'race category qualifiers: PRAGMA table_info(race_categories) returned no ' +
        'column names. Either the table is missing or the driver result shape changed.',
    )
  }
  payload.logger.info(
    `race category qualifiers: race_categories has ${names.size} columns`,
  )
  return names
}

export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  // --- precondition, before any DDL ---------------------------------------
  //
  // D1 has no transactional DDL. Four `ADD COLUMN`s are four chances to
  // half-apply: if the third fails, the first two are live with no
  // `payload_migrations` row, and the next run dies on "duplicate column
  // name" — the shape that took production down once. Adding only what is
  // missing makes the migration re-runnable from exactly that state.
  const present = await existingColumns(db, payload)
  const missing = (Object.keys(QUALIFIER_COLUMNS) as QualifierColumn[]).filter(
    (column) => !present.has(column),
  )

  payload.logger.info(
    missing.length === 0
      ? 'race category qualifiers: all four columns already present, nothing to add'
      : `race category qualifiers: adding ${missing.join(', ')}`,
  )

  for (const column of missing) {
    await db.run(QUALIFIER_COLUMNS[column])
  }
}

export async function down({ db, payload }: MigrateDownArgs): Promise<void> {
  // Symmetric with `up()`, for the symmetric reason: a rollback that runs
  // after a half-applied `up()` would otherwise die on the first column
  // that was never added.
  const present = await existingColumns(db, payload)
  const drop = (Object.keys(DROP_COLUMNS) as QualifierColumn[]).filter((column) =>
    present.has(column),
  )

  payload.logger.info(
    drop.length === 0
      ? 'race category qualifiers: no qualifier columns to drop'
      : `race category qualifiers: dropping ${drop.join(', ')}`,
  )

  for (const column of drop) {
    await db.run(DROP_COLUMNS[column])
  }
}
