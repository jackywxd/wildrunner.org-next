import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Whether a media row is public photo-wall content, and the share id it used
 * to have.
 *
 * `/gallery` answered "is this public?" with `raceEdition exists` — a category
 * tag standing in for a publish switch — so a member who uploaded a photo
 * without picking a race got a file that appeared nowhere and that the weekly
 * sweep would eventually delete. `media.usage` is the column that question
 * needed; see its header in src/collections/Media.ts for the three values and
 * why it is not a boolean.
 *
 * NO SQL DEFAULT ON EITHER COLUMN, which is the opposite of what
 * `migrate:create` would emit for a field carrying `defaultValue: 'gallery'`.
 * D1 has no transactional DDL, so `ADD COLUMN ... DEFAULT 'gallery'` would
 * publish every article image on the photo wall for the whole interval between
 * that statement and the UPDATE below — and if the process died in between,
 * permanently. NULL is fail-closed against `usage = 'gallery'`. The
 * application default still works: `payload.create` injects the field default
 * into the document, and Drizzle binds it as an INSERT parameter rather than
 * emitting the SQL `DEFAULT` keyword, so this column's DDL default is never
 * read by anything.
 *
 * THE BACKFILL REPRODUCES TODAY'S PUBLIC OUTPUT EXACTLY. What is on the photo
 * wall right now is what carries a race tag, so that is what becomes
 * 'gallery'. Nothing becomes public on deploy and nothing disappears. Turning
 * the rest of the library on is a separate, human-run step with a dry run —
 * scripts/backfill-media-usage.ts — because it is the step that decides what
 * the public can see.
 *
 * `ELSE 'private'` rather than 'attachment' so both directions are fail-safe:
 * 'private' is not public AND not collectable by the sweep. Classifying an
 * un-backfilled member upload as 'attachment' would put it in the one category
 * that can be deleted.
 *
 * NOT INDEXED, matching `20260827_233500_add_media_unused_since`: SQLite
 * refuses `DROP COLUMN` on an indexed column, which would force `down()` to
 * rebuild the table.
 *
 * SAFE TO RUN TWICE, which is a requirement rather than a nicety: `next build`
 * collects page data in a pool of worker processes, each boots its own
 * Payload, and `@payloadcms/drizzle` writes the `payload_migrations` row only
 * *after* `up()` returns, so several of them enter this file at once.
 *
 * `WHERE usage IS NULL` is what makes the UPDATE re-entrant, and it is
 * deliberately not `if (added)`. Guarding the backfill on "did I add the
 * column" is the check-then-act shape that took staging down in
 * `20260826_072758_add_race_category_qualifiers`: worker A adds the column and
 * is descheduled, worker B gets `duplicate column name`, skips the backfill,
 * finishes and writes the ledger row — and if A dies in between nothing ever
 * backfills. Letting the database decide inside the statement is the shape
 * `20260829_041500_add_marathon_majors` names as the alternative. It also
 * survives the case AGENTS.md records under "closing a PR does not revert the
 * database": if the schema outlives its ledger row and this file replays on a
 * later build, a member's own 'private' is not NULL and is not overwritten.
 */

const ADD_USAGE = sql`ALTER TABLE \`media\` ADD \`usage\` text;`
const ADD_LEGACY_VIDEO_ID = sql`ALTER TABLE \`media\` ADD \`legacy_video_id\` text;`

const DROP_USAGE = sql`ALTER TABLE \`media\` DROP COLUMN \`usage\`;`
const DROP_LEGACY_VIDEO_ID = sql`ALTER TABLE \`media\` DROP COLUMN \`legacy_video_id\`;`

const BACKFILL_USAGE = sql`
  UPDATE \`media\` SET \`usage\` =
    CASE WHEN \`race_edition_id\` IS NOT NULL THEN 'gallery' ELSE 'private' END
  WHERE \`usage\` IS NULL;
`

/**
 * The share id each video had while identity lived on the membership row.
 *
 * `LIMIT 1` is safe only because `AMBIGUOUS_LEGACY_IDS` below has already
 * proved no media carries two different ones. Without that check this would
 * silently pick whichever row the planner reached first.
 */
const BACKFILL_LEGACY_VIDEO_ID = sql`
  UPDATE \`media\` SET \`legacy_video_id\` = (
    SELECT v.\`video_id\` FROM \`galleries_videos\` v
    WHERE v.\`media_id\` = \`media\`.\`id\` AND v.\`video_id\` IS NOT NULL
    LIMIT 1
  )
  WHERE \`legacy_video_id\` IS NULL;
`

/** Any media listed as a video in two albums under two different share ids. */
const AMBIGUOUS_LEGACY_IDS = sql`
  SELECT \`media_id\` FROM \`galleries_videos\`
  WHERE \`video_id\` IS NOT NULL AND \`media_id\` IS NOT NULL
  GROUP BY \`media_id\` HAVING COUNT(DISTINCT \`video_id\`) > 1;
`

const ALREADY_ADDED = /duplicate column name/i
const ALREADY_DROPPED = /no such column/i

/**
 * Every message in an error's cause chain, joined.
 *
 * Drizzle puts its own summary on `.message` ("Failed query: ALTER TABLE
 * ...") and leaves the database's actual complaint one or two `cause` levels
 * down, so a matcher reading `.message` alone tolerates nothing and fails
 * exactly as if it were not there. Copied rather than shared with the earlier
 * migrations on purpose: an applied migration is a historical record, and
 * editing a helper it imports would silently change what a fresh database
 * replays.
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

/**
 * The rows of a SELECT, whatever this driver calls them.
 *
 * `@payloadcms/db-d1-sqlite`'s own docblock for `MigrateUpArgs.db` shows
 * `const { rows } = await db.run(sql`SELECT ...`)`, but D1's native result
 * object calls the same array `results`, and this adapter sits over both. So
 * both are accepted and **neither being present throws**, which is the whole
 * point: `20260805_153543_add_race_domain_model` shipped a check that guessed
 * the shape wrong, read `undefined`, and reported success while asserting
 * nothing. A guard that cannot fail is worse than no guard.
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

async function runTolerating(
  db: MigrateUpArgs['db'],
  statement: typeof ADD_USAGE,
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

export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  // Checked before the first ALTER, per AGENTS.md: everything knowable is
  // established while the table is still untouched, because a migration that
  // fails halfway through leaves D1 with no way to roll back what it did.
  const ambiguous = rowsOf<{ media_id: number }>(await db.run(AMBIGUOUS_LEGACY_IDS))
  if (ambiguous.length > 0) {
    const ids = ambiguous.map((row) => row.media_id).join(', ')
    throw new Error(
      `Refusing to run: media ${ids} appear as videos under more than one share id. ` +
        'legacy_video_id holds one id per media, so picking one would silently break the other link. ' +
        'Reconcile galleries_videos.video_id for those rows first.',
    )
  }

  const addedUsage = await runTolerating(db, ADD_USAGE, ALREADY_ADDED)
  const addedLegacy = await runTolerating(db, ADD_LEGACY_VIDEO_ID, ALREADY_ADDED)

  // Run unconditionally, whatever the two flags above say — see the header.
  await db.run(BACKFILL_USAGE)
  await db.run(BACKFILL_LEGACY_VIDEO_ID)

  // Polled from the end state rather than from the driver's return value:
  // `20260805_153543_add_race_domain_model`'s first version guessed at that
  // shape, logged four `undefined`s, and reported success while checking
  // nothing.
  const [counts] = rowsOf<{ gallery: number; unclassified: number }>(
    await db.run(sql`
      SELECT
        -- COALESCE because SUM over zero rows is NULL, not 0: on an empty
        -- media table the log line read "null rows on the photo wall", which
        -- is a report nobody can act on.
        COALESCE(SUM(CASE WHEN \`usage\` = 'gallery' THEN 1 ELSE 0 END), 0) AS gallery,
        COALESCE(SUM(CASE WHEN \`usage\` IS NULL THEN 1 ELSE 0 END), 0) AS unclassified
      FROM \`media\`;
    `),
  )
  if (!counts) throw new Error('media.usage: the verification query returned no row.')
  if (Number(counts.unclassified) > 0) {
    throw new Error(
      `media.usage: ${counts.unclassified} rows still NULL after the backfill.`,
    )
  }

  payload.logger.info(
    `media.usage: ${addedUsage ? 'added' : 'already present'}; ` +
      `media.legacy_video_id: ${addedLegacy ? 'added' : 'already present'}; ` +
      `${counts.gallery} rows on the photo wall`,
  )
}

export async function down({ db, payload }: MigrateDownArgs): Promise<void> {
  const droppedUsage = await runTolerating(db, DROP_USAGE, ALREADY_DROPPED)
  const droppedLegacy = await runTolerating(db, DROP_LEGACY_VIDEO_ID, ALREADY_DROPPED)
  payload.logger.info(
    `media.usage: ${droppedUsage ? 'dropped' : 'already absent'}; ` +
      `media.legacy_video_id: ${droppedLegacy ? 'dropped' : 'already absent'}`,
  )
}
