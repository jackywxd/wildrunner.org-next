import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`media\` ADD \`stream_ready\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`media\` ADD \`blur_data_u_r_l\` text;`)
  await db.run(sql`ALTER TABLE \`galleries\` ADD \`featured\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`galleries\` ADD \`event_date\` text;`)
  await db.run(sql`ALTER TABLE \`_galleries_v\` ADD \`version_featured\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`_galleries_v\` ADD \`version_event_date\` text;`)
  await db.run(sql`CREATE TABLE \`ai_rate_limits\` (
    \`key\` text PRIMARY KEY NOT NULL,
    \`count\` integer NOT NULL,
    \`reset_at\` integer NOT NULL
  );`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`ai_rate_limits\`;`)
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`stream_ready\`;`)
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`blur_data_u_r_l\`;`)
  await db.run(sql`ALTER TABLE \`galleries\` DROP COLUMN \`featured\`;`)
  await db.run(sql`ALTER TABLE \`galleries\` DROP COLUMN \`event_date\`;`)
  await db.run(sql`ALTER TABLE \`_galleries_v\` DROP COLUMN \`version_featured\`;`)
  await db.run(sql`ALTER TABLE \`_galleries_v\` DROP COLUMN \`version_event_date\`;`)
}
