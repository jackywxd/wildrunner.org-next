import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Where on the map a race is: `race_events.lat`, `lng`, `geo_place`,
 * `geo_source`, `geo_status`, `geocoded_at` (RaceEvents.ts, "Map position").
 *
 * WHAT THIS DOES TO EXISTING DATA: nothing. Six nullable columns, empty on
 * every existing row — which is the truth, since no event has ever had a
 * coordinate. No backfill here: filling them means a model call and a
 * geocoder call per event, which is a minute of network and not something a
 * migration (run by CI, possibly by several build workers at once) should
 * wait on. `pnpm geocode:events` fills them, one event a second, and reports
 * what it could not place. The deploy order is in the PR that adds this.
 *
 * No version table: `RaceEvents` has no `versions` block. No index: the map
 * reads every event once and filters in memory, and an index would make
 * `down()` impossible — SQLite refuses `DROP COLUMN` on an indexed column.
 *
 * SAFE TO RUN TWICE, for the reason 20261013_120000_add_ultrasignup_import
 * gives and AGENTS.md ("A migration is entered by several processes at
 * once") spells out: build workers enter a pending migration together, and
 * the ledger row lands after `up()` returns. So each statement is attempted
 * and the one error meaning "another worker already did this" is tolerated,
 * read off the `cause` chain because Drizzle's `.message` is its own summary
 * and D1's text sits a level or two down. Nothing checks `PRAGMA table_info`
 * first — that shape was tried on 20260826_072758 and both workers computed
 * the same missing list.
 *
 * Column types are what Payload's own generator produced for the same
 * fields: `number` is `numeric`, `text`, `select` and `date` are `text`.
 */

// Spelled out as `sql` templates, one pair per column, like the migrations
// beside it: the statement a reviewer reads is the statement that runs.
const COLUMNS = [
  {
    name: 'lat',
    add: sql`ALTER TABLE \`race_events\` ADD \`lat\` numeric;`,
    drop: sql`ALTER TABLE \`race_events\` DROP COLUMN \`lat\`;`,
  },
  {
    name: 'lng',
    add: sql`ALTER TABLE \`race_events\` ADD \`lng\` numeric;`,
    drop: sql`ALTER TABLE \`race_events\` DROP COLUMN \`lng\`;`,
  },
  {
    name: 'geo_place',
    add: sql`ALTER TABLE \`race_events\` ADD \`geo_place\` text;`,
    drop: sql`ALTER TABLE \`race_events\` DROP COLUMN \`geo_place\`;`,
  },
  {
    name: 'geo_source',
    add: sql`ALTER TABLE \`race_events\` ADD \`geo_source\` text;`,
    drop: sql`ALTER TABLE \`race_events\` DROP COLUMN \`geo_source\`;`,
  },
  {
    name: 'geo_status',
    add: sql`ALTER TABLE \`race_events\` ADD \`geo_status\` text;`,
    drop: sql`ALTER TABLE \`race_events\` DROP COLUMN \`geo_status\`;`,
  },
  {
    name: 'geocoded_at',
    add: sql`ALTER TABLE \`race_events\` ADD \`geocoded_at\` text;`,
    drop: sql`ALTER TABLE \`race_events\` DROP COLUMN \`geocoded_at\`;`,
  },
]

const ALREADY_ADDED = /duplicate column name/i
const ALREADY_DROPPED = /no such column/i

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
  statement: (typeof COLUMNS)[number]['add'],
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
  for (const { name, add } of COLUMNS) {
    const added = await runTolerating(db, add, ALREADY_ADDED)
    payload.logger.info(`race_events.${name}: ${added ? 'added' : 'already present'}`)
  }
}

export async function down({ db, payload }: MigrateDownArgs): Promise<void> {
  for (const { name, drop } of COLUMNS) {
    const dropped = await runTolerating(db, drop, ALREADY_DROPPED)
    payload.logger.info(`race_events.${name}: ${dropped ? 'dropped' : 'already absent'}`)
  }
}
