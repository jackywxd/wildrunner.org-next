/**
 * Upsert `data/race-editions.csv` into `race-editions`.
 *
 * REPLACES derive-race-editions.ts AS THE SEED PATH. That script only ever
 * derived editions from `race_schedule` — a stopgap for the ~18 rows that
 * happened to be scheduled. This reads the reviewed CSV directly, the same
 * source-of-truth pattern `race-events.csv`/`race-categories.csv` already
 * established, and is meant to carry the full catalogue's editions, not just
 * the near-term schedule's.
 *
 * UPSERTS, UNLIKE seed-race-schedule.ts. That script deliberately never
 * touches a row once written — "a row that has to change is an admin-panel
 * edit". This one has to be able to update an existing row, because its
 * whole purpose is a weekly refresh: a registration window opening, a date
 * getting officially confirmed, a lottery result changing. What it does NOT
 * do is destroy an admin's own edit: a row is only overwritten when the
 * CSV's `verified_at` is at least as recent as the database's — see
 * `shouldWrite` below. An admin editing a row in the backend (which bumps
 * nothing in the CSV) is safe from the next weekly run until the CSV is
 * re-verified past that edit.
 *
 * NEVER DELETES. A row that drops out of the CSV (an event uncertain enough
 * to remove from this pass) is left alone — deleting is what breaks a
 * member's race record, which points at the edition by id, not by name.
 *
 * Only `event` + `year` are treated as identity (matching race-editions'
 * own UNIQUE index); every other column is a candidate for update.
 *
 * Dry run unless `--write` is passed. Targets local D1 unless `--remote` is
 * passed, in which case `CLOUDFLARE_ENV` (staging|production) selects the
 * target — same guard as derive-race-editions.ts, for the same reason: a
 * stray ambient CLOUDFLARE_ENV/NODE_ENV=production left over from a previous
 * command refuses to run rather than being silently honoured.
 *
 *   pnpm tsx scripts/import-race-editions.ts                                    # local, report only
 *   pnpm tsx scripts/import-race-editions.ts --write                             # local, apply
 *   CLOUDFLARE_ENV=staging pnpm tsx scripts/import-race-editions.ts --remote --write
 */
import fs from 'node:fs'
import path from 'node:path'

import { getPayload } from 'payload'
import type { RaceEdition } from '../src/payload-types'

const shouldWrite = process.argv.includes('--write')
const remote = process.argv.includes('--remote')

if (remote) {
  const target = process.env.CLOUDFLARE_ENV ?? 'staging'
  if (target !== 'staging' && target !== 'production') {
    console.error(`CLOUDFLARE_ENV must be "staging" or "production", got "${target}".`)
    process.exit(1)
  }
  Object.assign(process.env, { NODE_ENV: 'production' })
  if (target === 'production') {
    delete process.env.CLOUDFLARE_ENV
  } else {
    process.env.CLOUDFLARE_ENV = target
  }
  console.log(`[import-race-editions] target: ${target} (remote)`)
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

const opt = (value: string) => (value === '' ? undefined : value)

/**
 * `payload.create`/`payload.update` through the Local API, unlike a REST
 * request or the admin UI, do not coerce a bare "YYYY-MM-DD" into the full
 * ISO datetime Payload's `date` field actually stores — they write the bare
 * string through as-is. That silently broke `getUpcomingRaces`'s window
 * query: it compares `startDate >= '2026-08-01T00:00:00.000Z'`, and SQLite's
 * text comparison ranks the shorter, un-suffixed "2026-08-01" *before* that
 * bound, so a race starting exactly on the window's first day vanished from
 * /races — caught by e2e/journeys/race-report.spec.ts's R-DUPLICATE, which
 * needs a real "已結束" race to be visible there. Every date field goes
 * through this before it reaches Payload, not just startDate.
 */
const isoDate = (value: string) => `${value}T00:00:00.000Z`
const optDate = (value: string) => (value === '' ? undefined : isoDate(value))

function editionData(row: Record<string, string>, eventId: number) {
  return {
    event: eventId,
    year: Number(row.year),
    startDate: optDate(row.start_date),
    endDate: optDate(row.end_date),
    nameOverride: opt(row.name_override),
    location: opt(row.location),
    url: opt(row.url),
    registrationOpensAt: optDate(row.registration_opens_at),
    registrationClosesAt: optDate(row.registration_closes_at),
    registrationUrl: opt(row.registration_url),
    registrationType: opt(row.registration_type) as RaceEdition['registrationType'],
    sourceUrl: opt(row.source_url),
    verifiedAt: optDate(row.verified_at),
    notes: opt(row.notes),
  }
}

async function main() {
  const { default: config } = await import('../src/payload.config')
  const payload = await getPayload({ config })

  const dataDir = path.resolve(import.meta.dirname, '..', 'data')
  const rows = parseCsv(fs.readFileSync(path.join(dataDir, 'race-editions.csv'), 'utf8'))

  const [events, editions] = await Promise.all([
    payload.find({ collection: 'race-events', limit: 1000, depth: 0, overrideAccess: true }),
    payload.find({ collection: 'race-editions', limit: 1000, depth: 0, overrideAccess: true }),
  ])
  const eventIdByKey = new Map(events.docs.map((e) => [e.key, e.id]))
  const existingByPair = new Map(editions.docs.map((e) => [`${e.event}:${e.year}`, e]))

  let created = 0
  let updated = 0
  let skippedStale = 0
  const unmatched: string[] = []

  // One malformed row (a date Payload's own field validation rejects, an
  // out-of-range year) must not take the other 99 down with it — this runs
  // unattended, in CI's reset and eventually a weekly refresh, with nobody
  // watching to rerun it row by row. `validate:editions` catches most of
  // this ahead of time, but that is a separate, human-run step (matching
  // validate-catalogue.ts / csv-to-seed.ts's own split), not a guarantee
  // this script can lean on for a CSV it did not just validate itself.
  const failed: string[] = []

  for (const row of rows) {
    const eventId = eventIdByKey.get(row.event_key)
    if (eventId === undefined) {
      unmatched.push(`${row.event_key}/${row.year} (no such event)`)
      continue
    }

    const existing = existingByPair.get(`${eventId}:${row.year}`)
    const data = editionData(row, eventId)

    if (!existing) {
      try {
        if (shouldWrite) {
          await payload.create({ collection: 'race-editions', data, overrideAccess: true })
        }
        console.log(`  + create ${row.event_key}/${row.year}`)
        created += 1
      } catch (error) {
        failed.push(`${row.event_key}/${row.year}: ${(error as Error).message}`)
      }
      continue
    }

    // Never overwrite a row the database has verified more recently than
    // the CSV — that is either an admin's own edit or a previous import
    // this one has not caught up to. Missing CSV verified_at never wins.
    const csvVerified = row.verified_at
    const dbVerified = typeof existing.verifiedAt === 'string' ? existing.verifiedAt.slice(0, 10) : ''
    if (!csvVerified || (dbVerified && csvVerified < dbVerified)) {
      skippedStale += 1
      continue
    }

    try {
      if (shouldWrite) {
        await payload.update({
          collection: 'race-editions',
          id: existing.id,
          data,
          overrideAccess: true,
        })
      }
      console.log(`  ~ update ${row.event_key}/${row.year}`)
      updated += 1
    } catch (error) {
      failed.push(`${row.event_key}/${row.year}: ${(error as Error).message}`)
    }
  }

  console.log(
    `\n${shouldWrite ? 'Applied' : 'Would apply'}: created=${created} updated=${updated} ` +
      `skipped(db newer or unverified)=${skippedStale} unmatched=${unmatched.length} failed=${failed.length}`,
  )
  for (const row of unmatched) console.log(`  unmatched: ${row}`)
  for (const row of failed) console.log(`  failed: ${row}`)

  if (!shouldWrite) console.log('\nDry run. Pass --write to apply.')

  if (unmatched.length > 0 || failed.length > 0) {
    throw new Error(
      `${unmatched.length} row(s) named an event_key not in race-events, ` +
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
