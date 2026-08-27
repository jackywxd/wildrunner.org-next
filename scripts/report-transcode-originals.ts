/**
 * What the kept pre-transcode originals cost, and the commands to remove them.
 *
 * REPORTS ONLY. It never deletes anything, and that is deliberate rather than
 * timid: `originalUrl` exists so a bad transcode can be compared against the
 * source, and deciding that a given video no longer needs its original is a
 * judgement about content, not a rule a script can apply. AGENTS.md's standing
 * rule — destructive work is proposed, never performed — is the same idea.
 *
 * Before this existed, that decision had no tooling at all: the comment on
 * `originalUrl` said deleting them "is a separate, human decision" while
 * offering the human no way to see what they were deciding about. R2 could
 * only grow.
 *
 * Reads through wrangler's D1 query path rather than by booting Payload,
 * because booting Payload with NODE_ENV=production APPLIES PENDING
 * MIGRATIONS on connect (see AGENTS.md). A read has no business doing that.
 *
 *   pnpm report:originals            # staging
 *   pnpm report:originals:prod       # production
 */
import { execFileSync } from 'node:child_process'

const DB = process.env.TRANSCODE_ORIGINALS_DB ?? 'wildrunner-org-next-staging'

type Row = {
  id: number
  alt: string | null
  original_url: string | null
  original_filesize: number | null
  updated_at: string | null
}

function query(sql: string): Row[] {
  let out: string
  try {
    out = execFileSync(
      'npx',
      ['wrangler', 'd1', 'execute', DB, '--remote', '--json', '--command', sql],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    )
  } catch (error) {
    // wrangler puts the API's own error on stdout, and a raw exception dump
    // buries it. The most likely cause by far is a schema that has not been
    // deployed yet, which deserves a sentence rather than a stack trace.
    const stdout = String((error as { stdout?: string }).stdout ?? '')
    if (/no such column: original_filesize/.test(stdout)) {
      console.error(
        `${DB} does not have the originalFilesize column yet.\n` +
          `Deploy the branch carrying 20260827_062932_add_media_original_filesize to that environment first — the report has nothing to read until then.`,
      )
      process.exit(1)
    }
    console.error(`Query against ${DB} failed:\n${stdout || String(error)}`)
    process.exit(1)
  }
  // `--json` still prints wrangler's banner on some versions, so take the
  // JSON array rather than assuming the whole stream parses.
  const start = out.indexOf('[')
  if (start === -1) throw new Error(`no JSON in wrangler output:\n${out}`)
  const parsed = JSON.parse(out.slice(start)) as { results?: Row[] }[]
  return parsed[0]?.results ?? []
}

function human(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${bytes} B`
}

const rows = query(
  `SELECT id, alt, original_url, original_filesize, updated_at
   FROM media
   WHERE original_url IS NOT NULL
   ORDER BY original_filesize DESC;`,
)

if (rows.length === 0) {
  console.log(`No kept originals in ${DB}. Nothing to review.`)
  process.exit(0)
}

const total = rows.reduce((sum, row) => sum + (row.original_filesize ?? 0), 0)
const unknown = rows.filter((row) => row.original_filesize == null).length

console.log(`${DB}: ${rows.length} kept original(s), ${human(total)} reclaimable\n`)
for (const row of rows) {
  const size = row.original_filesize == null ? 'size unknown' : human(row.original_filesize)
  console.log(`  #${row.id}  ${size.padStart(10)}  ${row.alt ?? '(no alt)'}`)
  console.log(`             ${row.original_url}`)
}

if (unknown > 0) {
  // Rows transcoded before `originalFilesize` existed. They still occupy
  // space; the quota simply cannot see it, so say so rather than let the
  // total read as complete.
  console.log(
    `\n${unknown} row(s) predate originalFilesize — their originals are real but uncounted, so the total above is a FLOOR, not the full figure.`,
  )
}

console.log(`
Nothing was deleted. To remove one, delete the R2 object and clear the two
columns together — leaving either behind makes the quota wrong in one
direction or the other:

  npx wrangler r2 object delete <bucket>/<key-from-the-url-above> --remote
  npx wrangler d1 execute ${DB} --remote --command \\
    "UPDATE media SET original_url = NULL, original_filesize = NULL WHERE id = <id>;"

The R2 delete is the irreversible step. Verify the transcode plays before
running it — that is the whole reason the original was kept.`)

// Booting nothing, but exiting explicitly anyway: AGENTS.md records that a
// script which merely happens to exit today is not evidence the next one will.
process.exit(0)
