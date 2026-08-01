import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`race_schedule\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`name_zh\` text,
  	\`series\` text DEFAULT 'others' NOT NULL,
  	\`start_date\` text NOT NULL,
  	\`end_date\` text,
  	\`event_id\` text,
  	\`country\` text,
  	\`location\` text,
  	\`distance_summary\` text,
  	\`url\` text,
  	\`registration_opens_at\` text,
  	\`registration_closes_at\` text,
  	\`registration_url\` text,
  	\`registration_type\` text DEFAULT 'first-come',
  	\`registration_status_override\` text,
  	\`source_url\` text,
  	\`verified_at\` text,
  	\`notes\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`race_schedule_series_idx\` ON \`race_schedule\` (\`series\`);`)
  await db.run(sql`CREATE INDEX \`race_schedule_start_date_idx\` ON \`race_schedule\` (\`start_date\`);`)
  await db.run(sql`CREATE INDEX \`race_schedule_event_id_idx\` ON \`race_schedule\` (\`event_id\`);`)
  await db.run(sql`CREATE INDEX \`race_schedule_registration_opens_at_idx\` ON \`race_schedule\` (\`registration_opens_at\`);`)
  await db.run(sql`CREATE INDEX \`race_schedule_verified_at_idx\` ON \`race_schedule\` (\`verified_at\`);`)
  await db.run(sql`CREATE INDEX \`race_schedule_updated_at_idx\` ON \`race_schedule\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`race_schedule_created_at_idx\` ON \`race_schedule\` (\`created_at\`);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`race_schedule_id\` integer REFERENCES race_schedule(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_race_schedule_id_idx\` ON \`payload_locked_documents_rels\` (\`race_schedule_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`race_schedule\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`users_id\` integer,
  	\`media_id\` integer,
  	\`authors_id\` integer,
  	\`posts_id\` integer,
  	\`galleries_id\` integer,
  	\`race_records_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`authors_id\`) REFERENCES \`authors\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`posts_id\`) REFERENCES \`posts\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`galleries_id\`) REFERENCES \`galleries\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`race_records_id\`) REFERENCES \`race_records\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "users_id", "media_id", "authors_id", "posts_id", "galleries_id", "race_records_id") SELECT "id", "order", "parent_id", "path", "users_id", "media_id", "authors_id", "posts_id", "galleries_id", "race_records_id" FROM \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_media_id_idx\` ON \`payload_locked_documents_rels\` (\`media_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_authors_id_idx\` ON \`payload_locked_documents_rels\` (\`authors_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_posts_id_idx\` ON \`payload_locked_documents_rels\` (\`posts_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_galleries_id_idx\` ON \`payload_locked_documents_rels\` (\`galleries_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_race_records_id_idx\` ON \`payload_locked_documents_rels\` (\`race_records_id\`);`)
}
