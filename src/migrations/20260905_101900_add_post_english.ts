import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * The English version of an article, stored beside it.
 *
 * WHY THIS IS THE ONLY MIGRATION THE THREE-LANGUAGE WORK NEEDS. `/zh-hans` is
 * *derived*: `src/lib/i18n/to-simplified.ts` converts the stored Traditional
 * at request time for 52KB of dictionary, so Simplified has nothing to store,
 * nothing to re-run, and no way to fall out of date. English is the one
 * language no converter can produce, so English is the one language with
 * columns. That asymmetry is the design, not an omission.
 *
 * SIX COLUMNS, TWO TABLES. `posts` has `versions: { drafts: true }`, so
 * Payload keeps `_posts_v` whose columns are the same fields under a
 * `version_` prefix — read off the local database rather than assumed:
 * `version_title`, `version_content`, `version_music_url`. A field added to
 * the collection and to `posts` alone typechecks, migrates cleanly, and then
 * 500s the first time a member saves a draft, because drizzle writes a column
 * the shadow table does not have. Exactly the note
 * `20260904_120000_add_gallery_race_edition` carries.
 *
 * A GROUP FIELD IS FLAT COLUMNS. Payload names them `<group>_<field>` —
 * verified against `site`, whose `metadata` group is stored as
 * `metadata_title_default`, `metadata_title_template`, `metadata_description`.
 * So `english.content` is `english_content`, and there is no new table and no
 * array to order.
 *
 * `english_content` IS `text`, matching `content`, because that is what
 * Payload stores richText as — read off `posts` rather than assumed.
 *
 * NOT INDEXED, for the reason every recent column here is not: SQLite refuses
 * `DROP COLUMN` on an indexed column, which would force `down()` to rebuild
 * the table. Nothing queries by these values — the reader already holds the
 * post row.
 *
 * NULLABLE, AND NULL IS THE COMMON CASE. Every article that exists has no
 * English version; `/en/posts/<slug>` renders the Chinese with a notice. A
 * NOT NULL column with a default would have made "translated" and "not
 * translated" indistinguishable, which is the one thing the reader must know.
 *
 * SAFE TO RUN TWICE, per AGENTS.md: `next build` enters migrations from a pool
 * of worker processes and the ledger row is written only after `up()` returns,
 * so several of them can be inside this file at once. Each statement is
 * attempted and its "already applied" error tolerated — never checked for
 * first, which is the shape that took staging down.
 */

const COLUMNS: readonly { readonly label: string; readonly add: ReturnType<typeof sql>; readonly drop: ReturnType<typeof sql> }[] = [
  {
    label: 'posts.english_title',
    add: sql`ALTER TABLE \`posts\` ADD \`english_title\` text;`,
    drop: sql`ALTER TABLE \`posts\` DROP COLUMN \`english_title\`;`,
  },
  {
    label: 'posts.english_description',
    add: sql`ALTER TABLE \`posts\` ADD \`english_description\` text;`,
    drop: sql`ALTER TABLE \`posts\` DROP COLUMN \`english_description\`;`,
  },
  {
    label: 'posts.english_content',
    add: sql`ALTER TABLE \`posts\` ADD \`english_content\` text;`,
    drop: sql`ALTER TABLE \`posts\` DROP COLUMN \`english_content\`;`,
  },
  {
    label: '_posts_v.version_english_title',
    add: sql`ALTER TABLE \`_posts_v\` ADD \`version_english_title\` text;`,
    drop: sql`ALTER TABLE \`_posts_v\` DROP COLUMN \`version_english_title\`;`,
  },
  {
    label: '_posts_v.version_english_description',
    add: sql`ALTER TABLE \`_posts_v\` ADD \`version_english_description\` text;`,
    drop: sql`ALTER TABLE \`_posts_v\` DROP COLUMN \`version_english_description\`;`,
  },
  {
    label: '_posts_v.version_english_content',
    add: sql`ALTER TABLE \`_posts_v\` ADD \`version_english_content\` text;`,
    drop: sql`ALTER TABLE \`_posts_v\` DROP COLUMN \`version_english_content\`;`,
  },
]

export const ALREADY_ADDED = /duplicate column name/i
export const ALREADY_DROPPED = /no such column/i

/**
 * Every message in an error's cause chain, joined.
 *
 * Drizzle puts its own summary on `.message` ("Failed query: ALTER TABLE
 * ...") and leaves the database's actual complaint one or two `cause` levels
 * down, so a matcher reading `.message` alone tolerates nothing and fails
 * exactly as if it were not there. Copied rather than shared with the
 * migrations that already carry it: an applied migration is a historical
 * record, and editing a helper it imports would silently change what a fresh
 * database replays.
 */
export function allMessages(error: unknown): string {
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
  statement: ReturnType<typeof sql>,
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
  const done: string[] = []
  for (const { label, add } of COLUMNS) {
    const added = await runTolerating(db, add, ALREADY_ADDED)
    done.push(`${label}: ${added ? 'added' : 'already present'}`)
  }
  // Reported per column, because they can genuinely differ: a run that died
  // between two statements leaves some present and some absent, and that
  // asymmetry is the thing worth seeing in a log.
  payload.logger.info(done.join('; '))
}

export async function down({ db, payload }: MigrateDownArgs): Promise<void> {
  const done: string[] = []
  // Reverse order of `up`, so a half-applied `down` leaves the same shape a
  // half-applied `up` does rather than a third one. Order is otherwise free
  // here: these are columns on existing tables, not tables with foreign keys
  // between them, so there is no dependency for `DROP` to get wrong.
  for (const { label, drop } of [...COLUMNS].reverse()) {
    const dropped = await runTolerating(db, drop, ALREADY_DROPPED)
    done.push(`${label}: ${dropped ? 'dropped' : 'already absent'}`)
  }
  payload.logger.info(done.join('; '))
}
