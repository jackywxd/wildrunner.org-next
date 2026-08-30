import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * One album-membership table instead of two split by mime type.
 *
 * `galleries_images` and `galleries_videos` were the same relation twice:
 * identical columns apart from `featured` on one and `video_id` on the other,
 * four tables once the `_galleries_v` shadows are counted, and a union in
 * every consumer. Worse, `video_id` was the *media's* public identity stored
 * on a membership row — so a video in two albums had two share ids and a video
 * in no album had none and could not be shared at all. That column has moved
 * to `media.legacy_video_id` in the migration before this one; identity is now
 * the media id.
 *
 * EXPAND ONLY. The four old tables are deliberately NOT dropped here. D1 has
 * no transactional DDL and several `next build` workers enter this file at
 * once, so a DROP in worker A can land while worker B is still copying. They
 * are left in place, unread, and removed by a separate migration in a separate
 * PR once staging and production have been seen to be correct. That also makes
 * `down()` a plain DROP of what this file created, with nothing to reconstruct.
 *
 * `ON DELETE cascade` on the live table, `set null` on the version table. The
 * old `set null` on both is what let a member's delete leave a membership row
 * pointing at nothing — a row violating `required: true` that readers had to
 * guard against and that silently shrank an album with no error anywhere.
 * Cascade removes the row instead. The version table keeps `set null` on
 * purpose: a historical snapshot should not lose an entry because somebody
 * deleted a file today, and `mapPayloadGallery`'s `isMedia` guard already
 * handles the hole.
 *
 * `media_id` stays NULLABLE rather than becoming NOT NULL to match
 * `required: true`. Galleries have drafts enabled, and a draft save skips
 * required-field validation, so NOT NULL would turn a validation message into
 * a 500 the first time an editor saved a draft with an empty row.
 *
 * SAFE TO RUN TWICE, which is a requirement rather than a nicety — see
 * AGENTS.md and `20260826_072758_add_race_category_qualifiers`. How each copy
 * achieves that differs between the live and version tables, and the
 * difference is load-bearing; see the two constants below.
 */

const CREATE_ITEMS = sql`
  CREATE TABLE \`galleries_items\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`media_id\` integer,
    \`featured\` integer DEFAULT false,
    FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`galleries\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
`

const CREATE_VERSION_ITEMS = sql`
  CREATE TABLE \`_galleries_v_version_items\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`media_id\` integer,
    \`featured\` integer DEFAULT false,
    \`_uuid\` text,
    FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`_galleries_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
`

const INDEXES = [
  sql`CREATE INDEX \`galleries_items_order_idx\` ON \`galleries_items\` (\`_order\`);`,
  sql`CREATE INDEX \`galleries_items_parent_id_idx\` ON \`galleries_items\` (\`_parent_id\`);`,
  sql`CREATE INDEX \`galleries_items_media_idx\` ON \`galleries_items\` (\`media_id\`);`,
  sql`CREATE INDEX \`_galleries_v_version_items_order_idx\` ON \`_galleries_v_version_items\` (\`_order\`);`,
  sql`CREATE INDEX \`_galleries_v_version_items_parent_id_idx\` ON \`_galleries_v_version_items\` (\`_parent_id\`);`,
  sql`CREATE INDEX \`_galleries_v_version_items_media_idx\` ON \`_galleries_v_version_items\` (\`media_id\`);`,
]

/**
 * Images keep their position; videos are appended after the last image in the
 * same album.
 *
 * `_order` has to be recomputed rather than carried over. Each of the two old
 * tables numbered from 1 within a parent, so a straight union puts two rows at
 * `_order = 1` in the same album — and Payload sorts the array by that column,
 * so the album's order would become whatever the planner happened to return.
 *
 * The offset is a correlated subquery rather than `ROW_NUMBER() OVER (...)` so
 * this does not depend on D1's SQLite build having window functions. It costs
 * one small lookup per video row, on 22 rows in this corpus.
 *
 * `INSERT OR IGNORE` is what makes these re-entrant, and it works here only
 * because `id` is the source table's own `text` primary key: a second worker
 * inserting the same ids conflicts on every row and writes nothing. The
 * version copy below cannot use this — see there.
 */
const COPY_IMAGES = sql`
  INSERT OR IGNORE INTO \`galleries_items\` (\`_order\`,\`_parent_id\`,\`id\`,\`media_id\`,\`featured\`)
  SELECT \`_order\`, \`_parent_id\`, \`id\`, \`media_id\`, \`featured\`
  FROM \`galleries_images\`;
`

const COPY_VIDEOS = sql`
  INSERT OR IGNORE INTO \`galleries_items\` (\`_order\`,\`_parent_id\`,\`id\`,\`media_id\`,\`featured\`)
  SELECT
    (SELECT COALESCE(MAX(i.\`_order\`), 0) FROM \`galleries_images\` i
      WHERE i.\`_parent_id\` = v.\`_parent_id\`) + v.\`_order\`,
    v.\`_parent_id\`, v.\`id\`, v.\`media_id\`, false
  FROM \`galleries_videos\` v;
`

/**
 * The same copy for version rows, and deliberately NOT `INSERT OR IGNORE`.
 *
 * Version array tables use an `integer PRIMARY KEY`, so both source tables
 * number from 1 and their ids collide across almost every row. `INSERT OR
 * IGNORE` would silently discard the colliding half and report nothing — the
 * exact failure mode AGENTS.md describes for "a row reported as failed may
 * already be written", inverted. So the id is not carried at all; SQLite
 * assigns new ones.
 *
 * Re-entrancy instead comes from a `NOT EXISTS` correlated on `_parent_id`,
 * evaluated inside the one INSERT statement rather than as a separate read.
 * That is the "database does the deciding, inside the statement" shape
 * `20260829_041500_add_marathon_majors` names, not the check-then-act shape
 * that took staging down. Per-parent rather than whole-table so a run that
 * dies partway resumes on the parents it had not reached.
 */
const COPY_VERSION_ROWS = sql`
  INSERT INTO \`_galleries_v_version_items\` (\`_order\`,\`_parent_id\`,\`media_id\`,\`featured\`,\`_uuid\`)
  SELECT src.\`_order\`, src.\`_parent_id\`, src.\`media_id\`, src.\`featured\`, src.\`_uuid\`
  FROM (
    SELECT \`_order\`, \`_parent_id\`, \`media_id\`, \`featured\`, \`_uuid\`
    FROM \`_galleries_v_version_images\`
    UNION ALL
    SELECT
      (SELECT COALESCE(MAX(i.\`_order\`), 0) FROM \`_galleries_v_version_images\` i
        WHERE i.\`_parent_id\` = v.\`_parent_id\`) + v.\`_order\`,
      v.\`_parent_id\`, v.\`media_id\`, false, v.\`_uuid\`
    FROM \`_galleries_v_version_videos\` v
  ) src
  WHERE NOT EXISTS (
    SELECT 1 FROM \`_galleries_v_version_items\` x
    WHERE x.\`_parent_id\` = src.\`_parent_id\`
  );
`

/** Any id present in both source tables, which the merged `text` PK cannot hold twice. */
const COLLIDING_IDS = sql`
  SELECT i.\`id\` AS id FROM \`galleries_images\` i
  JOIN \`galleries_videos\` v ON v.\`id\` = i.\`id\`;
`

const COUNTS = sql`
  SELECT
    (SELECT COUNT(*) FROM \`galleries_images\`) AS images,
    (SELECT COUNT(*) FROM \`galleries_videos\`) AS videos,
    (SELECT COUNT(*) FROM \`galleries_items\`) AS items,
    (SELECT COUNT(*) FROM (
      SELECT \`_parent_id\`, \`_order\` FROM \`galleries_items\`
      GROUP BY \`_parent_id\`, \`_order\` HAVING COUNT(*) > 1
    )) AS duplicate_order;
`

const DROP_ITEMS = sql`DROP TABLE \`galleries_items\`;`
const DROP_VERSION_ITEMS = sql`DROP TABLE \`_galleries_v_version_items\`;`

const ALREADY_EXISTS = /already exists/i
const ALREADY_GONE = /no such (table|index)/i

/**
 * Every message in an error's cause chain, joined.
 *
 * Drizzle puts its own summary on `.message` and leaves the database's actual
 * complaint one or two `cause` levels down, so a matcher reading `.message`
 * alone tolerates nothing and fails exactly as if it were not there. Copied
 * rather than shared with the earlier migrations on purpose: an applied
 * migration is a historical record, and editing a helper it imports would
 * silently change what a fresh database replays.
 */
function allMessages(error: unknown): string {
  const parts: string[] = []
  let current: unknown = error
  // Bounded rather than `while (current)`: a cause chain that loops back on
  // itself would hang the migration instead of failing it.
  for (let depth = 0; depth < 8 && current instanceof Error; depth += 1) {
    parts.push(current.message)
    current = current.cause
  }
  return parts.join('\n')
}

async function runTolerating(
  db: MigrateUpArgs['db'],
  statement: typeof CREATE_ITEMS,
  tolerate: RegExp,
): Promise<boolean> {
  try {
    await db.run(statement)
    return true
  } catch (error) {
    if (tolerate.test(allMessages(error))) return false
    throw error
  }
}

/**
 * The rows of a SELECT, whatever this driver calls them.
 *
 * See the identical note in `20260830_090000_add_media_usage`: neither shape
 * being present throws, because a verification that reads `undefined` and
 * passes is worse than no verification.
 */
function rowsOf<T>(result: unknown): T[] {
  const candidate = result as { rows?: unknown; results?: unknown }
  const rows = candidate?.rows ?? candidate?.results
  if (!Array.isArray(rows)) {
    throw new Error(
      `Cannot read rows from this driver's SELECT result (got ${typeof rows}). ` +
        'Refusing to continue, because the checks in this migration would otherwise pass by reading nothing.',
    )
  }
  return rows as T[]
}

export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  // Checked before the first CREATE TABLE, per AGENTS.md: D1 cannot roll back
  // a migration that fails halfway, so everything knowable is established
  // while nothing has been touched. `galleries_items.id` is the source id
  // carried over, and a `text` primary key cannot hold the same value twice —
  // `INSERT OR IGNORE` would drop the loser without a word.
  const colliding = rowsOf<{ id: string }>(await db.run(COLLIDING_IDS))
  if (colliding.length > 0) {
    throw new Error(
      `Refusing to run: ${colliding.length} row id(s) appear in both galleries_images and ` +
        `galleries_videos (${colliding.slice(0, 5).map((row) => row.id).join(', ')}). ` +
        'Merging them into one table keyed on that id would silently discard one of each pair.',
    )
  }

  const createdItems = await runTolerating(db, CREATE_ITEMS, ALREADY_EXISTS)
  const createdVersions = await runTolerating(db, CREATE_VERSION_ITEMS, ALREADY_EXISTS)
  for (const index of INDEXES) await runTolerating(db, index, ALREADY_EXISTS)

  // Run unconditionally, whatever the two flags say: guarding a copy on "did I
  // create the table" is the check-then-act shape that took staging down.
  await db.run(COPY_IMAGES)
  await db.run(COPY_VIDEOS)
  await db.run(COPY_VERSION_ROWS)

  const [counts] = rowsOf<{
    duplicate_order: number
    images: number
    items: number
    videos: number
  }>(await db.run(COUNTS))
  if (!counts) throw new Error('galleries_items: the verification query returned no row.')

  const expected = Number(counts.images) + Number(counts.videos)
  if (Number(counts.items) !== expected) {
    throw new Error(
      `galleries_items has ${counts.items} rows; galleries_images + galleries_videos is ${expected}. ` +
        'The copy is incomplete, and the old tables are still present — do not drop them.',
    )
  }
  if (Number(counts.duplicate_order) > 0) {
    throw new Error(
      `galleries_items has ${counts.duplicate_order} (gallery, _order) pairs used twice. ` +
        'Payload sorts the array by _order, so album order would be non-deterministic.',
    )
  }

  // Reports what happened rather than what was intended: with several
  // processes in here at once the answers differ, and that difference is the
  // only visible trace of the race.
  payload.logger.info(
    `galleries_items: ${createdItems ? 'created' : 'already present'}; ` +
      `_galleries_v_version_items: ${createdVersions ? 'created' : 'already present'}; ` +
      `${counts.items} rows (${counts.images} images + ${counts.videos} videos). ` +
      'Old tables left in place; a later migration drops them.',
  )
}

export async function down({ db, payload }: MigrateDownArgs): Promise<void> {
  // Nothing to reconstruct: this migration only ever added tables, and the
  // four it copied from are still there with their rows untouched.
  const droppedItems = await runTolerating(db, DROP_ITEMS, ALREADY_GONE)
  const droppedVersions = await runTolerating(db, DROP_VERSION_ITEMS, ALREADY_GONE)
  payload.logger.info(
    `galleries_items: ${droppedItems ? 'dropped' : 'already absent'}; ` +
      `_galleries_v_version_items: ${droppedVersions ? 'dropped' : 'already absent'}`,
  )
}
