import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`media\` ADD \`transcode_status\` text;`)
  await db.run(sql`ALTER TABLE \`media\` ADD \`transcode_attempts\` numeric DEFAULT 0;`)
  await db.run(sql`ALTER TABLE \`media\` ADD \`original_url\` text;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`transcode_status\`;`)
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`transcode_attempts\`;`)
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`original_url\`;`)
}
