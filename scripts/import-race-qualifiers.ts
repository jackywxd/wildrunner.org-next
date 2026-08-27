/**
 * Upsert the Western States / Hardrock qualifier flags from
 * `data/race-categories.csv` into `race-categories`.
 *
 * WHY A SCRIPT AND NOT THE MIGRATION THAT ADDED THE COLUMNS. A migration
 * runs once per environment, and staging and production already had their
 * categories long before those columns existed. Data carried in the
 * migration would reach a fresh database and never reach them. It is also
 * the wrong cadence: WSER and Hardrock republish their lists **every
 * year**, so this is the same situation `import-race-editions.ts` exists
 * for, and it is deliberately the same shape.
 *
 * ONLY EVER UPDATES; NEVER CREATES. An edition may be created by its
 * importer, but a category may not. `race_records.category` is a foreign
 * key a member's badge points at, and inventing a category is the exact
 * fabrication `catalogue-db.ts`'s header describes — the in-code catalogue
 * once named distances two real member records pointed at that the events
 * had never run. A CSV row naming a category the database does not have is
 * reported as unmatched and fails the run.
 *
 * NEVER DELETES, and never touches `label`, `distanceKm`, `verified` or
 * any other column. This script owns four cells per row and nothing else.
 *
 * THE STALENESS GUARD RUNS PER LIST, not per row. The two lists get re-read
 * at different times, so "the WS list is fresher than the database but the
 * Hardrock one is not" is a state that has to be expressible — otherwise a
 * WS refresh would drag a stale Hardrock flag along with it, or be blocked
 * by one. That is the whole reason the two dates are separate columns.
 *
 * Dry run unless `--write`. Targets local D1 unless `--remote`, in which
 * case `CLOUDFLARE_ENV` (staging|production) selects the target — the same
 * guard as import-race-editions.ts, for the same reason: a stray ambient
 * CLOUDFLARE_ENV/NODE_ENV=production refuses to run rather than being
 * silently honoured.
 *
 *   pnpm tsx scripts/import-race-qualifiers.ts                                    # local, report only
 *   pnpm tsx scripts/import-race-qualifiers.ts --write                            # local, apply
 *   CLOUDFLARE_ENV=staging pnpm tsx scripts/import-race-qualifiers.ts --remote --write
 */
import fs from 'node:fs'
import path from 'node:path'

import { getPayload } from 'payload'

const shouldWrite = process.argv.includes('--write')
const remote = process.argv.includes('--remote')

if (remote) {
  const target = process.env.CLOUDFLARE_ENV ?? 'staging'
  if (target !== 'staging' && target !== 'production') {
    console.error(`CLOUDFLARE_ENV must be "staging" or "production", got "${target}".`)
    process.exit(1)
  }
  Object.assign(process.env, { NODE_ENV: 'production' })
  // `CLOUDFLARE_ENV=production` is invalid and always has been: wrangler
  // names the top-level environment by its absence. AGENTS.md.
  if (target === 'production') {
    delete process.env.CLOUDFLARE_ENV
  } else {
    process.env.CLOUDFLARE_ENV = target
  }
  console.log(`[import-race-qualifiers] target: ${target} (remote)`)
} else if (process.env.CLOUDFLARE_ENV || process.env.NODE_ENV === 'production') {
  console.error(
    'CLOUDFLARE_ENV or NODE_ENV=production is set but --remote was not passed. ' +
      'Refusing to guess whether this run means the local database or a real ' +
      'one — pass --remote to target CLOUDFLARE_ENV explicitly, or unset it to ' +
      'run locally.',
  )
  process.exit(1)
}

/** Same minimal reader as validate-catalogue.ts, for the same reason. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else quoted = false
      } else field += char
      continue
    }
    if (char === '"') quoted = true
    else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') field += char
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }

  const [header, ...body] = rows.filter((r) => r.some((c) => c !== ''))
  return body.map((cells) => Object.fromEntries(header.map((key, i) => [key, (cells[i] ?? '').trim()])))
}

/**
 * The Local API writes a bare "YYYY-MM-DD" through unconverted, which then
 * sorts before every full ISO value in SQLite's text comparison. Same seam,
 * same fix, as import-race-editions.ts — see its header.
 */
const isoDate = (value: string) => `${value}T00:00:00.000Z`
const day = (value: unknown) => (typeof value === 'string' ? value.slice(0, 10) : '')

/** The two lists, each with the CSV columns and the fields they land in. */
const LISTS = [
  {
    name: 'Western States',
    flagColumn: 'qualifies_wser',
    dateColumn: 'wser_verified_at',
    flagField: 'qualifiesWser',
    dateField: 'wserVerifiedAt',
  },
  {
    name: 'Hardrock',
    flagColumn: 'qualifies_hardrock',
    dateColumn: 'hardrock_verified_at',
    flagField: 'qualifiesHardrock',
    dateField: 'hardrockVerifiedAt',
  },
] as const

/**
 * Every message in the error's cause chain, outermost first.
 *
 * A write that fails here reaches us wrapped: Payload's error, then
 * drizzle's, and only then the database's. Drizzle's `.message` is its own
 * summary — `Failed query: update "race_categories" set ... params: ...` —
 * which names the statement and says nothing about why it was refused. The
 * D1 text ("UNIQUE constraint failed", "no such column", "SQLITE_ERROR")
 * sits one or two `cause` levels below it.
 *
 * Printing `.message` alone therefore reports a failure while withholding
 * the failure. That happened: a staging run reported one failed row with
 * 400 characters of SQL and no reason, and the next step had to be a
 * hand-written `wrangler d1 execute` to ask the database the same question
 * it had already answered. The migration next door
 * (20260826_072758_add_race_category_qualifiers) learned this first and
 * carries the same walk; AGENTS.md records it as a general rule.
 */
function allMessages(error: unknown): string {
  const parts: string[] = []
  let current: unknown = error
  for (let depth = 0; depth < 8 && current instanceof Error; depth += 1) {
    parts.push(current.message)
    current = current.cause
  }
  return parts.join('\n    caused by: ')
}

async function main() {
  const { default: config } = await import('../src/payload.config')
  const payload = await getPayload({ config })

  const dataDir = path.resolve(import.meta.dirname, '..', 'data')
  const rows = parseCsv(fs.readFileSync(path.join(dataDir, 'race-categories.csv'), 'utf8'))

  // `limit: 0, pagination: false` rather than editions' `limit: 1000`:
  // there are already 394 categories, and a silent truncation is a bug
  // waiting for the catalogue to grow past the cap.
  const [events, categories] = await Promise.all([
    payload.find({
      collection: 'race-events',
      limit: 0,
      pagination: false,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'race-categories',
      limit: 0,
      pagination: false,
      depth: 0,
      overrideAccess: true,
    }),
  ])
  const eventIdByKey = new Map(events.docs.map((e) => [e.key, e.id]))
  const existingByPair = new Map(
    categories.docs.map((c) => [
      `${typeof c.event === 'number' ? c.event : c.event.id}:${c.key}`,
      c,
    ]),
  )

  let updated = 0
  let unchanged = 0
  let skippedStale = 0
  const unmatched: string[] = []
  // One row Payload's own field validation rejects must not take the other
  // 393 down with it — this runs unattended, in CI's reset and in the
  // annual refresh, with nobody watching to rerun it row by row.
  const failed: string[] = []

  for (const row of rows) {
    const eventId = eventIdByKey.get(row.event_key)
    if (eventId === undefined) {
      unmatched.push(`${row.event_key}/${row.key} (no such event)`)
      continue
    }
    const existing = existingByPair.get(`${eventId}:${row.key}`)
    if (!existing) {
      unmatched.push(`${row.event_key}/${row.key} (no such category)`)
      continue
    }

    const data: Record<string, unknown> = {}
    let stale = 0

    for (const list of LISTS) {
      const csvDate = row[list.dateColumn] ?? ''
      // A row with no date on this list says nothing about it — not even
      // "no". Leaving the database alone is the only honest reading.
      if (!csvDate) {
        stale += 1
        continue
      }
      // Never overwrite what the database has checked more recently than
      // the CSV: that is either an admin's own edit in /admin or a later
      // import this CSV has not caught up to.
      const dbDate = day(existing[list.dateField as keyof typeof existing])
      if (dbDate && csvDate < dbDate) {
        stale += 1
        continue
      }

      const flag = row[list.flagColumn] === 'yes'
      const currentFlag = Boolean(existing[list.flagField as keyof typeof existing])
      if (flag !== currentFlag || csvDate !== dbDate) {
        data[list.flagField] = flag
        data[list.dateField] = isoDate(csvDate)
      }
    }

    if (stale === LISTS.length) {
      skippedStale += 1
      continue
    }
    // 394 rows: an unconditional update per row would rewrite `updated_at`
    // across the whole table every run and report "394 updated" when
    // nothing moved.
    if (Object.keys(data).length === 0) {
      unchanged += 1
      continue
    }

    try {
      if (shouldWrite) {
        await payload.update({
          collection: 'race-categories',
          id: existing.id,
          data,
          overrideAccess: true,
        })
      }
      console.log(
        `  ~ ${row.event_key}/${row.key} ${Object.keys(data).filter((k) => k.startsWith('qualifies')).join(', ') || 'dates'}`,
      )
      updated += 1
    } catch (error) {
      failed.push(`${row.event_key}/${row.key}: ${allMessages(error)}`)
    }
  }

  console.log(
    `\n${shouldWrite ? 'Applied' : 'Would apply'}: updated=${updated} unchanged=${unchanged} ` +
      `skipped(db newer or never checked)=${skippedStale} unmatched=${unmatched.length} ` +
      `failed=${failed.length}`,
  )
  for (const row of unmatched) console.log(`  unmatched: ${row}`)
  for (const row of failed) console.log(`  failed: ${row}`)

  if (!shouldWrite) console.log('\nDry run. Pass --write to apply.')

  if (unmatched.length > 0 || failed.length > 0) {
    throw new Error(
      `${unmatched.length} row(s) named a category not in race-categories, ` +
        `${failed.length} row(s) failed to write`,
    )
  }
}

main()
  .then(() => {
    // Booting Payload from the CLI leaves the event loop non-empty. AGENTS.md.
    process.exit(0)
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
