import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

import { ensureAuthorForUser } from '../lib/author-alias'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`users\` ADD \`author_id\` integer REFERENCES authors(id);`)
  await db.run(sql`CREATE INDEX \`users_author_idx\` ON \`users\` (\`author_id\`);`)

  // Accounts created before bylines existed get one now. Done through the
  // Local API rather than raw SQL so slug generation and the "reuse an
  // author this user already owns" rule stay in one place — that reuse is
  // what stops the original operator getting a second, empty byline
  // alongside the migrated one.
  const users = await payload.find({
    collection: 'users',
    limit: 1000,
    depth: 0,
    overrideAccess: true,
    req,
  })

  for (const user of users.docs) {
    await ensureAuthorForUser({ payload, req, user })
  }
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_users\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`display_name\` text,
  	\`invite_pending\` integer DEFAULT false,
  	\`invited_at\` text,
  	\`invited_by_id\` integer,
  	\`role\` text DEFAULT 'member' NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`email\` text NOT NULL,
  	\`reset_password_token\` text,
  	\`reset_password_expiration\` text,
  	\`salt\` text,
  	\`hash\` text,
  	\`login_attempts\` numeric DEFAULT 0,
  	\`lock_until\` text,
  	FOREIGN KEY (\`invited_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_users\`("id", "display_name", "invite_pending", "invited_at", "invited_by_id", "role", "updated_at", "created_at", "email", "reset_password_token", "reset_password_expiration", "salt", "hash", "login_attempts", "lock_until") SELECT "id", "display_name", "invite_pending", "invited_at", "invited_by_id", "role", "updated_at", "created_at", "email", "reset_password_token", "reset_password_expiration", "salt", "hash", "login_attempts", "lock_until" FROM \`users\`;`)
  await db.run(sql`DROP TABLE \`users\`;`)
  await db.run(sql`ALTER TABLE \`__new_users\` RENAME TO \`users\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`users_invited_by_idx\` ON \`users\` (\`invited_by_id\`);`)
  await db.run(sql`CREATE INDEX \`users_updated_at_idx\` ON \`users\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`users_created_at_idx\` ON \`users\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`users_email_idx\` ON \`users\` (\`email\`);`)
}
