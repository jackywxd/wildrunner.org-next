import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * `race_records.edition_id`/`category_id` only. The generator also proposed
 * re-adding `posts.race_record_id` and `_posts_v.version_race_record_id` —
 * both already live on every database (applied by
 * `20260804_213708_add_post_race_record`, confirmed via `PRAGMA table_info`
 * against local D1). That statement pair was cut here: `ALTER TABLE ADD
 * COLUMN` fails outright on a column that already exists, and per
 * AGENTS.md's D1-migration rule, everything knowable is checked before the
 * first statement runs, not discovered mid-migration on a real database.
 *
 * The false diff came from this migration's base snapshot
 * (`20260806_223655_add_media_race_edition.json`), which had already lost
 * track of those two columns — confirmed by comparing it against
 * `20260804_213708_add_post_race_record.json`, the snapshot from the
 * migration that actually added them. This migration's own `.json` restores
 * both, so the drift stops here rather than being generated again next time.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`race_records\` ADD \`edition_id\` integer REFERENCES race_editions(id);`)
  await db.run(sql`ALTER TABLE \`race_records\` ADD \`category_id\` integer REFERENCES race_categories(id);`)
  await db.run(sql`CREATE INDEX \`race_records_edition_idx\` ON \`race_records\` (\`edition_id\`);`)
  await db.run(sql`CREATE INDEX \`race_records_category_idx\` ON \`race_records\` (\`category_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_race_records\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`owner_id\` integer,
  	\`event_id\` text NOT NULL,
  	\`distance_id\` text NOT NULL,
  	\`year\` numeric NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`owner_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_race_records\`("id", "owner_id", "event_id", "distance_id", "year", "updated_at", "created_at") SELECT "id", "owner_id", "event_id", "distance_id", "year", "updated_at", "created_at" FROM \`race_records\`;`)
  await db.run(sql`DROP TABLE \`race_records\`;`)
  await db.run(sql`ALTER TABLE \`__new_race_records\` RENAME TO \`race_records\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`race_records_owner_idx\` ON \`race_records\` (\`owner_id\`);`)
  await db.run(sql`CREATE INDEX \`race_records_event_id_idx\` ON \`race_records\` (\`event_id\`);`)
  await db.run(sql`CREATE INDEX \`race_records_year_idx\` ON \`race_records\` (\`year\`);`)
  await db.run(sql`CREATE INDEX \`race_records_updated_at_idx\` ON \`race_records\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`race_records_created_at_idx\` ON \`race_records\` (\`created_at\`);`)
}
