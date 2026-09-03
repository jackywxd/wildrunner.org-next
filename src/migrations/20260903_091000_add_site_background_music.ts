import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * The site's fallback background music: what plays for an album that names
 * none of its own.
 *
 * A TABLE, NOT A COLUMN, because this is an array field on a global. Payload
 * gives every array its own table keyed to the parent — the shape is copied
 * from `site_top_nav_items`, which is the same global's existing array, read
 * out of `sqlite_master` rather than guessed:
 *
 *   _order      integer NOT NULL          the curator's order
 *   _parent_id  integer NOT NULL          → site(id), ON DELETE cascade
 *   id          text PRIMARY KEY          Payload's own row id
 *
 * `id text` and not `integer` matters. The live array tables in this schema
 * carry Payload's text ids, and `20260830_090500_merge_gallery_items` is the
 * record of what happens when the two kinds get confused: the *version*
 * tables number from 1 in each table, so copying ids between them silently
 * dropped 80 of 200 rows with exit status 0. There is no version table here —
 * `site` is a global with no drafts — but the column type is what keeps it
 * that way.
 *
 * BOTH INDEXES ARE PART OF THE SHAPE, not an optimisation: Payload's own
 * generated migrations create `_order` and `_parent_id` indexes for every
 * array table, and a table that differs from what the ORM expects is a
 * difference that shows up as a slow query nobody attributes.
 *
 * `down()` DROPS THE WHOLE TABLE, which is the one place this migration is
 * genuinely destructive — an admin's list of tracks goes with it. That is the
 * correct inverse of creating it, and it is why the table holds only URLs
 * somebody can paste again rather than anything derived.
 *
 * SAFE TO RUN TWICE, per AGENTS.md: `next build` enters migrations from a pool
 * of worker processes and the ledger row is written only after `up()` returns.
 * `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` are the whole
 * mechanism — no error to tolerate, because SQLite offers the clause here.
 */

const CREATE_TABLE = sql`
  CREATE TABLE IF NOT EXISTS \`site_background_music\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`url\` text NOT NULL,
    \`label\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`site\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
`

const CREATE_ORDER_IDX = sql`CREATE INDEX IF NOT EXISTS \`site_background_music_order_idx\` ON \`site_background_music\` (\`_order\`);`
const CREATE_PARENT_IDX = sql`CREATE INDEX IF NOT EXISTS \`site_background_music_parent_id_idx\` ON \`site_background_music\` (\`_parent_id\`);`

const DROP_TABLE = sql`DROP TABLE IF EXISTS \`site_background_music\`;`

export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  await db.run(CREATE_TABLE)
  await db.run(CREATE_ORDER_IDX)
  await db.run(CREATE_PARENT_IDX)

  // Reads the end state rather than reporting what was attempted: with two
  // build workers in here at once, "created" and "already there" are both
  // true and neither is the useful answer. The count is.
  const rows = await db.get<{ n: number }>(
    sql`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='site_background_music';`,
  )
  payload.logger.info(`site_background_music: present=${rows?.n ?? 0}`)
}

export async function down({ db, payload }: MigrateDownArgs): Promise<void> {
  await db.run(DROP_TABLE)
  payload.logger.info('site_background_music: dropped')
}
