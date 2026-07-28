import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`media\` ADD \`owner_id\` integer REFERENCES users(id);`)
  await db.run(sql`CREATE INDEX \`media_owner_idx\` ON \`media\` (\`owner_id\`);`)
  await db.run(sql`ALTER TABLE \`authors\` ADD \`owner_id\` integer REFERENCES users(id);`)
  await db.run(sql`CREATE INDEX \`authors_owner_idx\` ON \`authors\` (\`owner_id\`);`)
  await db.run(sql`ALTER TABLE \`posts\` ADD \`owner_id\` integer REFERENCES users(id);`)
  await db.run(sql`CREATE INDEX \`posts_owner_idx\` ON \`posts\` (\`owner_id\`);`)
  await db.run(sql`ALTER TABLE \`_posts_v\` ADD \`version_owner_id\` integer REFERENCES users(id);`)
  await db.run(sql`CREATE INDEX \`_posts_v_version_version_owner_idx\` ON \`_posts_v\` (\`version_owner_id\`);`)
  await db.run(sql`ALTER TABLE \`galleries\` ADD \`owner_id\` integer REFERENCES users(id);`)
  await db.run(sql`CREATE INDEX \`galleries_owner_idx\` ON \`galleries\` (\`owner_id\`);`)
  await db.run(sql`ALTER TABLE \`_galleries_v\` ADD \`version_owner_id\` integer REFERENCES users(id);`)
  await db.run(sql`CREATE INDEX \`_galleries_v_version_version_owner_idx\` ON \`_galleries_v\` (\`version_owner_id\`);`)

  // Everything that predates ownership was created by the operator. Leaving
  // it NULL would make it unownable — `isOwner` matches on owner_id, so no
  // member could ever be given an existing post, and the admin UI would show
  // a blank owner on 400+ rows. The subquery yields NULL on a fresh install
  // with no admin yet, which is a harmless no-op.
  const firstAdmin = sql`(SELECT \`id\` FROM \`users\` WHERE \`role\` = 'admin' ORDER BY \`id\` LIMIT 1)`
  await db.run(sql`UPDATE \`media\` SET \`owner_id\` = ${firstAdmin} WHERE \`owner_id\` IS NULL;`)
  await db.run(sql`UPDATE \`authors\` SET \`owner_id\` = ${firstAdmin} WHERE \`owner_id\` IS NULL;`)
  await db.run(sql`UPDATE \`posts\` SET \`owner_id\` = ${firstAdmin} WHERE \`owner_id\` IS NULL;`)
  await db.run(sql`UPDATE \`galleries\` SET \`owner_id\` = ${firstAdmin} WHERE \`owner_id\` IS NULL;`)
  await db.run(
    sql`UPDATE \`_posts_v\` SET \`version_owner_id\` = ${firstAdmin} WHERE \`version_owner_id\` IS NULL;`,
  )
  await db.run(
    sql`UPDATE \`_galleries_v\` SET \`version_owner_id\` = ${firstAdmin} WHERE \`version_owner_id\` IS NULL;`,
  )
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_media\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`alt\` text NOT NULL,
  	\`stream_id\` text,
  	\`stream_ready\` integer DEFAULT false,
  	\`blur_data_u_r_l\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`url\` text,
  	\`thumbnail_u_r_l\` text,
  	\`filename\` text,
  	\`mime_type\` text,
  	\`filesize\` numeric,
  	\`width\` numeric,
  	\`height\` numeric
  );
  `)
  await db.run(sql`INSERT INTO \`__new_media\`("id", "alt", "stream_id", "stream_ready", "blur_data_u_r_l", "updated_at", "created_at", "url", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height") SELECT "id", "alt", "stream_id", "stream_ready", "blur_data_u_r_l", "updated_at", "created_at", "url", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height" FROM \`media\`;`)
  await db.run(sql`DROP TABLE \`media\`;`)
  await db.run(sql`ALTER TABLE \`__new_media\` RENAME TO \`media\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`media_updated_at_idx\` ON \`media\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`media_created_at_idx\` ON \`media\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`media_filename_idx\` ON \`media\` (\`filename\`);`)
  await db.run(sql`CREATE TABLE \`__new_authors\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`slug\` text NOT NULL,
  	\`bio\` text,
  	\`avatar_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`avatar_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_authors\`("id", "name", "slug", "bio", "avatar_id", "updated_at", "created_at") SELECT "id", "name", "slug", "bio", "avatar_id", "updated_at", "created_at" FROM \`authors\`;`)
  await db.run(sql`DROP TABLE \`authors\`;`)
  await db.run(sql`ALTER TABLE \`__new_authors\` RENAME TO \`authors\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`authors_slug_idx\` ON \`authors\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`authors_avatar_idx\` ON \`authors\` (\`avatar_id\`);`)
  await db.run(sql`CREATE INDEX \`authors_updated_at_idx\` ON \`authors\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`authors_created_at_idx\` ON \`authors\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`__new_posts\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`title\` text,
  	\`slug\` text,
  	\`description\` text,
  	\`image_id\` integer,
  	\`author_id\` integer,
  	\`featured\` integer DEFAULT false,
  	\`published_at\` text,
  	\`content\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`_status\` text DEFAULT 'draft',
  	FOREIGN KEY (\`image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`author_id\`) REFERENCES \`authors\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_posts\`("id", "title", "slug", "description", "image_id", "author_id", "featured", "published_at", "content", "updated_at", "created_at", "_status") SELECT "id", "title", "slug", "description", "image_id", "author_id", "featured", "published_at", "content", "updated_at", "created_at", "_status" FROM \`posts\`;`)
  await db.run(sql`DROP TABLE \`posts\`;`)
  await db.run(sql`ALTER TABLE \`__new_posts\` RENAME TO \`posts\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`posts_slug_idx\` ON \`posts\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`posts_image_idx\` ON \`posts\` (\`image_id\`);`)
  await db.run(sql`CREATE INDEX \`posts_author_idx\` ON \`posts\` (\`author_id\`);`)
  await db.run(sql`CREATE INDEX \`posts_updated_at_idx\` ON \`posts\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`posts_created_at_idx\` ON \`posts\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`posts__status_idx\` ON \`posts\` (\`_status\`);`)
  await db.run(sql`CREATE TABLE \`__new__posts_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`parent_id\` integer,
  	\`version_title\` text,
  	\`version_slug\` text,
  	\`version_description\` text,
  	\`version_image_id\` integer,
  	\`version_author_id\` integer,
  	\`version_featured\` integer DEFAULT false,
  	\`version_published_at\` text,
  	\`version_content\` text,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`version__status\` text DEFAULT 'draft',
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`latest\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`posts\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_author_id\`) REFERENCES \`authors\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new__posts_v\`("id", "parent_id", "version_title", "version_slug", "version_description", "version_image_id", "version_author_id", "version_featured", "version_published_at", "version_content", "version_updated_at", "version_created_at", "version__status", "created_at", "updated_at", "latest") SELECT "id", "parent_id", "version_title", "version_slug", "version_description", "version_image_id", "version_author_id", "version_featured", "version_published_at", "version_content", "version_updated_at", "version_created_at", "version__status", "created_at", "updated_at", "latest" FROM \`_posts_v\`;`)
  await db.run(sql`DROP TABLE \`_posts_v\`;`)
  await db.run(sql`ALTER TABLE \`__new__posts_v\` RENAME TO \`_posts_v\`;`)
  await db.run(sql`CREATE INDEX \`_posts_v_parent_idx\` ON \`_posts_v\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_version_version_slug_idx\` ON \`_posts_v\` (\`version_slug\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_version_version_image_idx\` ON \`_posts_v\` (\`version_image_id\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_version_version_author_idx\` ON \`_posts_v\` (\`version_author_id\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_version_version_updated_at_idx\` ON \`_posts_v\` (\`version_updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_version_version_created_at_idx\` ON \`_posts_v\` (\`version_created_at\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_version_version__status_idx\` ON \`_posts_v\` (\`version__status\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_created_at_idx\` ON \`_posts_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_updated_at_idx\` ON \`_posts_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_latest_idx\` ON \`_posts_v\` (\`latest\`);`)
  await db.run(sql`CREATE TABLE \`__new_galleries\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text,
  	\`slug\` text,
  	\`location\` text,
  	\`featured\` integer DEFAULT false,
  	\`event_date\` text,
  	\`cover_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`_status\` text DEFAULT 'draft',
  	FOREIGN KEY (\`cover_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_galleries\`("id", "name", "slug", "location", "featured", "event_date", "cover_id", "updated_at", "created_at", "_status") SELECT "id", "name", "slug", "location", "featured", "event_date", "cover_id", "updated_at", "created_at", "_status" FROM \`galleries\`;`)
  await db.run(sql`DROP TABLE \`galleries\`;`)
  await db.run(sql`ALTER TABLE \`__new_galleries\` RENAME TO \`galleries\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`galleries_slug_idx\` ON \`galleries\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`galleries_cover_idx\` ON \`galleries\` (\`cover_id\`);`)
  await db.run(sql`CREATE INDEX \`galleries_updated_at_idx\` ON \`galleries\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`galleries_created_at_idx\` ON \`galleries\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`galleries__status_idx\` ON \`galleries\` (\`_status\`);`)
  await db.run(sql`CREATE TABLE \`__new__galleries_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`parent_id\` integer,
  	\`version_name\` text,
  	\`version_slug\` text,
  	\`version_location\` text,
  	\`version_featured\` integer DEFAULT false,
  	\`version_event_date\` text,
  	\`version_cover_id\` integer,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`version__status\` text DEFAULT 'draft',
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`latest\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`galleries\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_cover_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new__galleries_v\`("id", "parent_id", "version_name", "version_slug", "version_location", "version_featured", "version_event_date", "version_cover_id", "version_updated_at", "version_created_at", "version__status", "created_at", "updated_at", "latest") SELECT "id", "parent_id", "version_name", "version_slug", "version_location", "version_featured", "version_event_date", "version_cover_id", "version_updated_at", "version_created_at", "version__status", "created_at", "updated_at", "latest" FROM \`_galleries_v\`;`)
  await db.run(sql`DROP TABLE \`_galleries_v\`;`)
  await db.run(sql`ALTER TABLE \`__new__galleries_v\` RENAME TO \`_galleries_v\`;`)
  await db.run(sql`CREATE INDEX \`_galleries_v_parent_idx\` ON \`_galleries_v\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_galleries_v_version_version_slug_idx\` ON \`_galleries_v\` (\`version_slug\`);`)
  await db.run(sql`CREATE INDEX \`_galleries_v_version_version_cover_idx\` ON \`_galleries_v\` (\`version_cover_id\`);`)
  await db.run(sql`CREATE INDEX \`_galleries_v_version_version_updated_at_idx\` ON \`_galleries_v\` (\`version_updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_galleries_v_version_version_created_at_idx\` ON \`_galleries_v\` (\`version_created_at\`);`)
  await db.run(sql`CREATE INDEX \`_galleries_v_version_version__status_idx\` ON \`_galleries_v\` (\`version__status\`);`)
  await db.run(sql`CREATE INDEX \`_galleries_v_created_at_idx\` ON \`_galleries_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_galleries_v_updated_at_idx\` ON \`_galleries_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_galleries_v_latest_idx\` ON \`_galleries_v\` (\`latest\`);`)
}
