import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`media\` ADD \`content_fingerprint\` text;`)
  await db.run(sql`CREATE INDEX \`media_content_fingerprint_idx\` ON \`media\` (\`content_fingerprint\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX \`media_content_fingerprint_idx\`;`)
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`content_fingerprint\`;`)
}
