import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Members' requests to add a race to the catalogue (`RaceCatalogueRequests`).
 *
 * WHAT THIS DOES TO EXISTING DATA: nothing. One new, empty table, and one
 * nullable column on `payload_locked_documents_rels` — the column Payload
 * keeps for every collection so a document can be locked while an admin
 * edits it. No existing row is read or written.
 *
 * No version table: the collection has no `versions` block.
 *
 * SAFE TO RUN TWICE, per AGENTS.md: build workers enter a pending migration
 * together and the ledger row is written only after `up()` returns. `IF NOT
 * EXISTS` decides CREATE TABLE and CREATE INDEX inside the statement; the
 * one ALTER tolerates the error meaning another worker already added it,
 * read from the cause chain because Drizzle's `.message` is its own summary.
 */

const CREATE_TABLE = sql`CREATE TABLE IF NOT EXISTS \`race_catalogue_requests\` (
  \`id\` integer PRIMARY KEY NOT NULL,
  \`owner_id\` integer,
  \`ultrasignup_title\` text NOT NULL,
  \`event_name\` text NOT NULL,
  \`distance_text\` text,
  \`race_date\` text NOT NULL,
  \`reason\` text NOT NULL,
  \`status\` text DEFAULT 'pending' NOT NULL,
  \`event_id\` integer,
  \`admin_note\` text,
  \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  FOREIGN KEY (\`owner_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (\`event_id\`) REFERENCES \`race_events\`(\`id\`) ON UPDATE no action ON DELETE set null
);`

const INDEXES = [
  sql`CREATE INDEX IF NOT EXISTS \`race_catalogue_requests_owner_idx\` ON \`race_catalogue_requests\` (\`owner_id\`);`,
  sql`CREATE INDEX IF NOT EXISTS \`race_catalogue_requests_status_idx\` ON \`race_catalogue_requests\` (\`status\`);`,
  sql`CREATE INDEX IF NOT EXISTS \`race_catalogue_requests_event_idx\` ON \`race_catalogue_requests\` (\`event_id\`);`,
  sql`CREATE INDEX IF NOT EXISTS \`race_catalogue_requests_updated_at_idx\` ON \`race_catalogue_requests\` (\`updated_at\`);`,
  sql`CREATE INDEX IF NOT EXISTS \`race_catalogue_requests_created_at_idx\` ON \`race_catalogue_requests\` (\`created_at\`);`,
]

const ADD_LOCK_COLUMN = sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`race_catalogue_requests_id\` integer REFERENCES race_catalogue_requests(id);`
const LOCK_INDEX = sql`CREATE INDEX IF NOT EXISTS \`payload_locked_documents_rels_race_catalogue_requests_id_idx\` ON \`payload_locked_documents_rels\` (\`race_catalogue_requests_id\`);`

// down leaves the lock column. SQLite refuses DROP COLUMN on a column in a
// foreign key, so removing it means rebuilding `payload_locked_documents_rels`
// with every other collection's column spelled out (20260801_030616's down
// is that shape) — a rewrite of a table this migration otherwise never
// touches. Left behind it is a nullable integer that can only hold NULL once
// the table it names is gone.
const DROP_LOCK_INDEX = sql`DROP INDEX IF EXISTS \`payload_locked_documents_rels_race_catalogue_requests_id_idx\`;`
const DROP_TABLE = sql`DROP TABLE IF EXISTS \`race_catalogue_requests\`;`

const ALREADY_ADDED = /duplicate column name/i

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
  statement: typeof ADD_LOCK_COLUMN,
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
  await db.run(CREATE_TABLE)
  for (const index of INDEXES) await db.run(index)
  const lock = await runTolerating(db, ADD_LOCK_COLUMN, ALREADY_ADDED)
  await db.run(LOCK_INDEX)
  payload.logger.info(
    `race_catalogue_requests: present; payload_locked_documents_rels.race_catalogue_requests_id: ${lock ? 'added' : 'already present'}`,
  )
}

export async function down({ db, payload }: MigrateDownArgs): Promise<void> {
  // A plain drop: this discards every request members filed, pending or not.
  await db.run(DROP_LOCK_INDEX)
  await db.run(DROP_TABLE)
  payload.logger.info(
    'race_catalogue_requests: dropped; payload_locked_documents_rels.race_catalogue_requests_id left in place (see header)',
  )
}
