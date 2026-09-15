/**
 * What a production migration approval is approving.
 *
 *   pnpm plan:prod-migrations                # report, always exits 0
 *   pnpm plan:prod-migrations --assert-none  # exits 1 if anything is pending
 *
 * The production migration gate (.github/workflows/deploy.yml) is a GitHub
 * Environment approval, and an approval is only worth having if the person
 * pressing the button can see what they are agreeing to. This is what they
 * read: the names of the migrations production has not applied yet, and the
 * source of each one, written into the job summary *before* the gated job
 * asks for a review.
 *
 * READS THE LEDGER WITH WRANGLER, NEVER BY BOOTING PAYLOAD. `payload
 * migrate:status` is not a read: the D1 adapter applies `prodMigrations` on
 * connect when NODE_ENV=production (see connect.js:52), so a status check
 * *is* the write it was run to avoid. That is how
 * `20260805_153543_add_race_domain_model` reached production. AGENTS.md has
 * the long version. Shelling out to `wrangler d1 execute --remote` touches
 * nothing, which is the whole point of doing it this way.
 *
 * THE SAME SCRIPT IS THE PROBE AFTERWARDS. `--assert-none` is what the apply
 * job runs once it has finished, and that check is not decoration: a
 * `payload migrate` that resolved local emulated bindings instead of remote
 * ones would print every migration as applied and change nothing in
 * production. Asking the real database through a different code path is the
 * only answer that cannot come from the process that just claimed success.
 */
import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PROD_DB = 'wildrunner-org-next'
const ASSERT_NONE = process.argv.includes('--assert-none')

// The job summary has a 1 MiB cap and a reviewer has a smaller one. Past
// this the report lists names and links instead of pasting source.
const SOURCE_BUDGET = 40_000

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'migrations',
)

function fail(message: string): never {
  console.error(`::error::${message}`)
  process.exit(1)
}

/**
 * `--json` writes bare JSON to stdout, so the whole string normally parses.
 * A warning banner ahead of it would not, and slicing from the FIRST `[` —
 * the obvious repair, and the one preflight-production.ts makes — lands
 * inside `▲ [WARNING]` and parses nothing. So try every offset a JSON
 * array could begin at, and require the result to have the shape asked for.
 *
 * Failure is never answered with an empty list. "I could not read the
 * ledger" and "nothing is applied" are opposite findings that would send a
 * reviewer opposite ways, and telling them apart is what this script is for.
 */
function parseRows(raw: string): { name: string }[] {
  const starts = [0]
  for (let i = raw.indexOf('['); i !== -1; i = raw.indexOf('[', i + 1)) starts.push(i)
  for (const start of starts) {
    try {
      const parsed = JSON.parse(raw.slice(start)) as { results?: { name: string }[] }[]
      if (Array.isArray(parsed) && parsed[0]?.results) return parsed[0].results
    } catch {
      // not a JSON array at this offset — try the next one
    }
  }
  fail(`could not parse wrangler's answer as JSON — the ledger was not read:\n${raw}`)
}

const raw = execFileSync(
  'npx',
  [
    'wrangler',
    'd1',
    'execute',
    PROD_DB,
    // Production is the top-level wrangler environment and wrangler names it
    // by its ABSENCE — `-e production` fails outright, there is only a
    // `staging` env section.
    '--remote',
    '--json',
    '--command',
    'SELECT name FROM payload_migrations ORDER BY id',
  ],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 },
)

const applied = new Set(parseRows(raw).map((row) => row.name))

// An empty ledger on production is not a fresh database, it is a wrong
// database: production has carried these rows since the cutover. Reporting
// "every migration is pending" from a misdirected query would send a
// reviewer to approve a full replay against live data.
if (applied.size === 0) {
  fail(
    `${PROD_DB}.payload_migrations came back empty. Production has applied ` +
      `migrations since the cutover, so this is a query that did not reach ` +
      `production — not a database that needs all of them replayed.`,
  )
}

const { migrations } = await import('../src/migrations/index.js')
const pending = migrations.filter((m) => !applied.has(m.name))

// Rows production carries that this tree knows nothing about. Not an error:
// it is what a closed PR leaves behind (schema reaches D1 during a build, so
// it survives a discarded branch — AGENTS.md, "Closing a PR does not revert
// the database"). Worth seeing next to a pending list, because a name here
// that matches one being added means the generated file needs renaming to
// the old name rather than applying.
const known = new Set(migrations.map((m) => m.name))
const unknown = [...applied].filter((name) => !known.has(name))

console.log(`${applied.size} applied, ${pending.length} pending`)
for (const m of pending) console.log(`  pending: ${m.name}`)
for (const name of unknown) console.log(`  applied but not in this tree: ${name}`)

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `pending=${pending.length > 0}\ncount=${pending.length}\n`,
  )
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const lines: string[] = [
    '## Production migrations',
    '',
    `\`${PROD_DB}\` has **${applied.size}** applied, **${pending.length}** pending.`,
    '',
  ]

  if (pending.length === 0) {
    lines.push('Production is already at this tree\'s schema. Nothing to approve.', '')
  } else {
    lines.push(
      'These run against the **production** database once the gated job is approved.',
      'They have already been applied to staging by the `Deploy staging` job, and',
      'the staging smoke check passed against the result.',
      '',
      ...pending.map((m) => `- \`${m.name}\``),
      '',
    )

    let spent = 0
    for (const m of pending) {
      const file = path.join(migrationsDir, `${m.name}.ts`)
      let source: string
      try {
        source = readFileSync(file, 'utf8')
      } catch {
        // Registered in index.ts but not on disk: report it rather than
        // dropping the migration silently out of the review.
        lines.push(`### \`${m.name}\``, '', `_source not found at \`src/migrations/${m.name}.ts\`_`, '')
        continue
      }
      if (spent + source.length > SOURCE_BUDGET) {
        const rest = pending.slice(pending.indexOf(m))
        lines.push(
          `_${rest.length} further source(s) omitted to keep this summary readable — ` +
            `read them under \`src/migrations/\`, starting at \`${m.name}.ts\`._`,
          '',
        )
        break
      }
      spent += source.length
      lines.push(`### \`${m.name}\``, '', '```ts', source.trimEnd(), '```', '')
    }
  }

  if (unknown.length > 0) {
    lines.push(
      '### Applied to production but absent from this tree',
      '',
      'Schema reaches D1 during a build, so it survives a discarded branch.',
      'If a migration below shares its subject with one being added, rename the',
      'new file to the old name instead of applying it.',
      '',
      ...unknown.map((name) => `- \`${name}\``),
      '',
    )
  }

  appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'))
}

if (ASSERT_NONE && pending.length > 0) {
  fail(
    `production still has ${pending.length} pending migration(s) after the ` +
      `apply step: ${pending.map((m) => m.name).join(', ')}. The step reported ` +
      `success, so it wrote somewhere else — check that CLOUDFLARE_ENV was ` +
      `unset and NODE_ENV=production.`,
  )
}

// Booting anything from the CLI can leave the event loop occupied; every
// script here exits explicitly rather than reasoning about whether it needs
// to (AGENTS.md).
process.exit(0)
