import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

import { SEED_CATEGORIES, SEED_EVENTS } from '../lib/races/seed-data'

/**
 * Create the race domain tables and fill them. Nothing reads them yet.
 *
 * ADDITIVE ON PURPOSE. `race_schedule` and `race_records` are untouched and
 * `/races` still reads the old table, so deploying this changes nothing a
 * visitor can see. That is what makes it verifiable: "the new tables are
 * right" and "the pages still work" become two claims that fail
 * independently, instead of one change where a wrong badge could have come
 * from either.
 *
 * THE DATA COMES FROM A GENERATED MODULE, NOT THE CSVs. Migrations are
 * listed in `prodMigrations` and therefore bundled into the Worker, where
 * there is no filesystem — a `readFileSync` here would work from the CLI
 * and fail in production. `src/lib/races/seed-data.ts` is generated from
 * `data/*.csv` by `pnpm tsx scripts/csv-to-seed.ts`; the CSVs stay the
 * artefact a human reviews.
 *
 * RAW SQL RATHER THAN `payload.create`. 494 rows through the local API
 * means 494 round trips, each with the collection's hooks and a uniqueness
 * SELECT — against remote D1 that is minutes, and it would be minutes
 * inside a Worker's CPU budget if `prodMigrations` ever did run this.
 * The data has already been gated by `scripts/validate-catalogue.ts`, so
 * the validation would be re-checking what the CSV gate already proved.
 * Values interpolate as bound parameters, so names like "Oh Meu Deus" and
 * the Chinese ones escape correctly.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // --- preconditions, before any DDL -------------------------------------
  //
  // D1 has no transactional rollback across statements, so a check that
  // runs after CREATE TABLE cannot undo it: a failure leaves the tables
  // populated with no `payload_migrations` row, and the next run dies on
  // "table already exists". That half-applied shape is what took
  // production down once already.
  //
  // So everything that can be known up front is checked up front. After
  // this point the migration is a sequence of writes that either all make
  // sense or none of them do.
  const seedKeys = new Set(SEED_EVENTS.map((event) => event.key))

  for (const category of SEED_CATEGORIES) {
    if (!seedKeys.has(category.eventKey)) {
      throw new Error(
        `race domain model: category ${category.eventKey}/${category.key} names an ` +
          `event that is not in the seed — regenerate src/lib/races/seed-data.ts`,
      )
    }
  }

  // The five rows below predate `eventId` being required and carry none, so
  // they are matched on name — there is nothing else to match on, which is
  // exactly the problem this model removes. Applied before the check so the
  // check sees the state the insert will.
  const ORPHANS: [string, string][] = [
    ['Sinister 7 Ultra', 'other-sinister-7'],
    ['Canadian Death Race', 'other-canadian-death-race'],
    ['Ticino Wildlands 500', 'other-ticino-wildlands'],
    ['Squamish 50', 'other-squamish-50'],
    ['Squamish 50/50', 'other-squamish-50'],
    ['Ultra Trail Whistler by UTMB', 'utmb-whistler'],
  ]
  for (const [name, key] of ORPHANS) {
    await db.run(
      sql`UPDATE \`race_schedule\` SET \`event_id\` = ${key} WHERE \`name\` = ${name} AND \`event_id\` IS NULL;`,
    )
  }

  // Every scheduled race must resolve to a seed event. A JOIN would drop
  // the ones that do not, silently, and the race would be missing from a
  // table nothing reads yet and everything reads later.
  const scheduled = await payload.find({
    collection: 'race-schedule',
    depth: 0,
    limit: 0,
    pagination: false,
    req,
    select: { eventId: true, name: true },
  })
  const unresolved = scheduled.docs.filter(
    (row) => !row.eventId || !seedKeys.has(row.eventId),
  )
  if (unresolved.length > 0) {
    throw new Error(
      `race domain model: ${unresolved.length} schedule row(s) have no matching event — ` +
        unresolved.map((row) => `"${row.name}" (${row.eventId ?? 'no eventId'})`).join(', '),
    )
  }

  await db.run(sql`CREATE TABLE \`race_events\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`key\` text NOT NULL,
  	\`name\` text NOT NULL,
  	\`name_zh\` text,
  	\`series\` text DEFAULT 'others' NOT NULL,
  	\`country\` text,
  	\`website\` text,
  	\`itra_url\` text,
  	\`source\` text,
  	\`verified_at\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`race_events_key_idx\` ON \`race_events\` (\`key\`);`)
  await db.run(sql`CREATE INDEX \`race_events_series_idx\` ON \`race_events\` (\`series\`);`)
  await db.run(sql`CREATE INDEX \`race_events_verified_at_idx\` ON \`race_events\` (\`verified_at\`);`)
  await db.run(sql`CREATE INDEX \`race_events_updated_at_idx\` ON \`race_events\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`race_events_created_at_idx\` ON \`race_events\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`race_categories\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`event_id\` integer NOT NULL,
  	\`key\` text NOT NULL,
  	\`label\` text NOT NULL,
  	\`distance_km\` numeric,
  	\`elevation_gain_m\` numeric,
  	\`order\` numeric DEFAULT 1,
  	\`verified\` integer DEFAULT false,
  	\`source\` text,
  	\`verified_at\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`event_id\`) REFERENCES \`race_events\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`race_categories_event_idx\` ON \`race_categories\` (\`event_id\`);`)
  await db.run(sql`CREATE INDEX \`race_categories_verified_idx\` ON \`race_categories\` (\`verified\`);`)
  await db.run(sql`CREATE INDEX \`race_categories_verified_at_idx\` ON \`race_categories\` (\`verified_at\`);`)
  await db.run(sql`CREATE INDEX \`race_categories_updated_at_idx\` ON \`race_categories\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`race_categories_created_at_idx\` ON \`race_categories\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`event_key_idx\` ON \`race_categories\` (\`event_id\`,\`key\`);`)
  await db.run(sql`CREATE TABLE \`race_editions\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`event_id\` integer NOT NULL,
  	\`year\` numeric NOT NULL,
  	\`start_date\` text,
  	\`end_date\` text,
  	\`name_override\` text,
  	\`location\` text,
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
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`event_id\`) REFERENCES \`race_events\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`race_editions_event_idx\` ON \`race_editions\` (\`event_id\`);`)
  await db.run(sql`CREATE INDEX \`race_editions_year_idx\` ON \`race_editions\` (\`year\`);`)
  await db.run(sql`CREATE INDEX \`race_editions_start_date_idx\` ON \`race_editions\` (\`start_date\`);`)
  await db.run(sql`CREATE INDEX \`race_editions_registration_opens_at_idx\` ON \`race_editions\` (\`registration_opens_at\`);`)
  await db.run(sql`CREATE INDEX \`race_editions_verified_at_idx\` ON \`race_editions\` (\`verified_at\`);`)
  await db.run(sql`CREATE INDEX \`race_editions_updated_at_idx\` ON \`race_editions\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`race_editions_created_at_idx\` ON \`race_editions\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`event_year_idx\` ON \`race_editions\` (\`event_id\`,\`year\`);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`race_events_id\` integer REFERENCES race_events(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`race_categories_id\` integer REFERENCES race_categories(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`race_editions_id\` integer REFERENCES race_editions(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_race_events_id_idx\` ON \`payload_locked_documents_rels\` (\`race_events_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_race_categories_id_idx\` ON \`payload_locked_documents_rels\` (\`race_categories_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_race_editions_id_idx\` ON \`payload_locked_documents_rels\` (\`race_editions_id\`);`)

  // --- events -----------------------------------------------------------
  for (const event of SEED_EVENTS) {
    await db.run(sql`INSERT INTO \`race_events\`
      (\`key\`, \`name\`, \`name_zh\`, \`series\`, \`country\`, \`website\`, \`itra_url\`, \`source\`, \`verified_at\`)
      VALUES (${event.key}, ${event.name}, ${event.nameZh ?? null}, ${event.series},
              ${event.country ?? null}, ${event.website ?? null}, ${event.itraUrl ?? null},
              ${event.source ?? null}, ${event.verifiedAt ?? null});`)
  }

  // --- categories -------------------------------------------------------
  //
  // The event id is looked up inline rather than held in a map: one extra
  // subquery per row costs nothing against the round trip that carries it,
  // and it cannot go stale between the two loops.
  for (const category of SEED_CATEGORIES) {
    await db.run(sql`INSERT INTO \`race_categories\`
      (\`event_id\`, \`key\`, \`label\`, \`distance_km\`, \`elevation_gain_m\`, \`order\`, \`verified\`, \`source\`, \`verified_at\`)
      SELECT \`id\`, ${category.key}, ${category.label},
             ${category.distanceKm ?? null}, ${category.elevationGainM ?? null},
             ${category.order}, ${category.verified ? 1 : 0},
             ${category.source ?? null}, ${category.verifiedAt ?? null}
      FROM \`race_events\` WHERE \`key\` = ${category.eventKey};`)
  }

  // --- editions, from the existing schedule ------------------------------
  //
  // One statement rather than a read-then-write loop: the mapping is a
  // join, and expressing it as one keeps it atomic. `name_override` is set
  // only where the published name differed from the event's, which is what
  // that field is for — an override on every row would be indistinguishable
  // from denormalisation.
  await db.run(sql`INSERT INTO \`race_editions\`
    (\`event_id\`, \`year\`, \`start_date\`, \`end_date\`, \`name_override\`, \`location\`, \`url\`,
     \`registration_opens_at\`, \`registration_closes_at\`, \`registration_url\`,
     \`registration_type\`, \`registration_status_override\`, \`source_url\`, \`verified_at\`, \`notes\`,
     \`created_at\`, \`updated_at\`)
    SELECT e.\`id\`,
           CAST(substr(s.\`start_date\`, 1, 4) AS INTEGER),
           s.\`start_date\`, s.\`end_date\`,
           CASE WHEN s.\`name\` <> e.\`name\` THEN s.\`name\` ELSE NULL END,
           s.\`location\`, s.\`url\`,
           s.\`registration_opens_at\`, s.\`registration_closes_at\`, s.\`registration_url\`,
           s.\`registration_type\`, s.\`registration_status_override\`,
           s.\`source_url\`, s.\`verified_at\`, s.\`notes\`,
           s.\`created_at\`, s.\`updated_at\`
    FROM \`race_schedule\` s
    JOIN \`race_events\` e ON e.\`key\` = s.\`event_id\`;`)

  // --- the guard --------------------------------------------------------
  //
  // A JOIN drops what it cannot match, silently. If a schedule row has an
  // eventId with no matching event, the race simply would not appear in a
  // table nothing reads yet and everything will read later — a bug that
  // surfaces weeks after the deploy, with no obvious cause.
  //
  // Counted through the local API rather than by reading a raw result set:
  // the first version guessed at the driver's return shape, logged four
  // `undefined`s, and skipped its own check. A guard whose failure looks
  // exactly like its success is worse than no guard, because it is
  // reassuring.
  const counts = {
    categories: (await payload.count({ collection: 'race-categories', req })).totalDocs,
    editions: (await payload.count({ collection: 'race-editions', req })).totalDocs,
    events: (await payload.count({ collection: 'race-events', req })).totalDocs,
    scheduled: (await payload.count({ collection: 'race-schedule', req })).totalDocs,
  }
  payload.logger.info(
    `race domain model: ${counts.events} events, ${counts.categories} categories, ` +
      `${counts.editions} editions from ${counts.scheduled} schedule rows`,
  )

  if (counts.events !== SEED_EVENTS.length || counts.categories !== SEED_CATEGORIES.length) {
    throw new Error(
      `race domain model: seeded ${counts.events}/${SEED_EVENTS.length} events and ` +
        `${counts.categories}/${SEED_CATEGORIES.length} categories`,
    )
  }
  // Belt and braces. The precondition above should make this unreachable;
  // if it ever fires, the precondition is wrong rather than the data.
  if (counts.editions !== counts.scheduled) {
    throw new Error(
      `race domain model: ${counts.scheduled} schedule rows produced ${counts.editions} ` +
        `editions — the precondition check missed something`,
    )
  }
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Children before the parent. As generated, this dropped `race_events`
  // first, which fires `ON DELETE set null` on `race_categories.event_id`
  // — a NOT NULL column — and the rollback failed on its own first
  // statement. Reordering is the fix; the generator does not know about
  // the constraint it emitted.
  await db.run(sql`DROP TABLE \`race_categories\`;`)
  await db.run(sql`DROP TABLE \`race_editions\`;`)
  await db.run(sql`DROP TABLE \`race_events\`;`)
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
  	\`race_schedule_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`authors_id\`) REFERENCES \`authors\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`posts_id\`) REFERENCES \`posts\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`galleries_id\`) REFERENCES \`galleries\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`race_records_id\`) REFERENCES \`race_records\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`race_schedule_id\`) REFERENCES \`race_schedule\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "users_id", "media_id", "authors_id", "posts_id", "galleries_id", "race_records_id", "race_schedule_id") SELECT "id", "order", "parent_id", "path", "users_id", "media_id", "authors_id", "posts_id", "galleries_id", "race_records_id", "race_schedule_id" FROM \`payload_locked_documents_rels\`;`)
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
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_race_schedule_id_idx\` ON \`payload_locked_documents_rels\` (\`race_schedule_id\`);`)
}
