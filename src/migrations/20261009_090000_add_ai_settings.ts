import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * The `ai-settings` global: which backend answers the members' AI buttons.
 * `src/globals/AiSettings.ts` says why it is its own global and why the API
 * key is not in it.
 *
 * ONE NEW TABLE, AND NOTHING ELSE TOUCHED. A global with no drafts has no
 * `_v` shadow table — `site` has none, checked for `20260904_010000_add_site_about`
 * — and `payload_locked_documents` refers to globals by `global_slug`, a text
 * column, so nothing gains a foreign key.
 *
 * The column shape is what `@payloadcms/drizzle`'s `traverseFields` builds for
 * this field rather than a guess: a `select` is a text column, `required`
 * makes it NOT NULL, and the field's `defaultValue` becomes the DEFAULT. The
 * timestamps are nullable with no default, as on `site`.
 *
 * NO ROW IS INSERTED. A global with no row reads as its field defaults, and
 * `resolveAiProvider` treats anything missing as Workers AI, so applying this
 * changes nothing a member can see until an admin saves the setting.
 *
 * SAFE TO RUN TWICE, because `next build` enters a pending migration from
 * several worker processes at once and `@payloadcms/drizzle` writes the ledger
 * row only after `up()` returns (AGENTS.md). Unlike `ADD COLUMN`, SQLite has
 * `IF NOT EXISTS` for tables, so the database decides inside the statement and
 * there is no error to tolerate and no check-then-act window.
 */

export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`ai_settings\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`provider\` text DEFAULT 'workers-ai' NOT NULL,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  payload.logger.info('ai_settings: present')
}

export async function down({ db, payload }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`ai_settings\`;`)
  payload.logger.info('ai_settings: absent')
}
