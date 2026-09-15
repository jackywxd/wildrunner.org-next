import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * How many times each article has been read.
 *
 * WHAT THIS DOES TO EXISTING DATA: nothing. One new table, empty. No existing
 * row is read or written, and every article starts at "no reads recorded",
 * which is the truth — nothing was counting before this.
 *
 * A TABLE PAYLOAD DOES NOT MANAGE, deliberately, and the alternative is worse
 * than it looks. The obvious shape is `posts.view_count`, and it is wrong
 * because `posts` is a versioned collection: Payload's update path builds the
 * row it writes by merging the incoming patch over the document it read at
 * the start of the request (`dataToUpdate = { ...result }` in
 * `payload/dist/collections/operations/utilities/update.js`). So an increment
 * written by raw SQL between that read and that write is silently discarded —
 * on every autosave, not just on publish. A counter and a versioned document
 * cannot share a row. `ai_rate_limits`
 * (`20260727_142704_add_media_stream_gallery_fields`) is the precedent for a
 * table created here that Payload knows nothing about.
 *
 * NO FOREIGN KEY TO `posts`, and no cascade. A deleted post leaves its row
 * behind, which is a few bytes and no reader: `/members/posts` looks counts up
 * *by* the posts it already has, so an orphan is never joined to anything. The
 * cost of the alternative is real — SQLite enforces foreign keys only when
 * `PRAGMA foreign_keys` is on, so a constraint here would be a rule that binds
 * in some connections and not others, which is worse than no rule.
 *
 * `count` IS NOT NULL WITH A DEFAULT so the upsert in `src/lib/posts/views.ts`
 * can be a single statement: the row either does not exist (INSERT with 1) or
 * does (UPDATE count + 1). A nullable counter would need a COALESCE at every
 * read and would let "never read" and "read zero times" become two different
 * values for one fact.
 *
 * SAFE TO RUN TWICE, per AGENTS.md: `next build` enters migrations from a pool
 * of worker processes and the ledger row is written only after `up()` returns,
 * so several of them can be inside this file at once. `IF NOT EXISTS` is what
 * makes CREATE TABLE re-entrant — and unlike the check-then-act shape that
 * took staging down, the decision is made by the database inside the one
 * statement rather than by a reader who may lose the race.
 */

const CREATE = sql`CREATE TABLE IF NOT EXISTS \`post_views\` (
  \`post_id\` integer PRIMARY KEY NOT NULL,
  \`count\` integer NOT NULL DEFAULT 0
);`

const DROP = sql`DROP TABLE IF EXISTS \`post_views\`;`

export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  await db.run(CREATE)
  payload.logger.info('post_views: present')
}

export async function down({ db, payload }: MigrateDownArgs): Promise<void> {
  // A plain drop, and worth naming: this discards every recorded read. There
  // is nothing to reconstruct them from — the counts are the only copy, and
  // the beacon that produced them keeps no log.
  await db.run(DROP)
  payload.logger.info('post_views: dropped (every recorded read count is gone)')
}
