/**
 * Decide what the weekly editions refresh needs to re-check this week —
 * and nothing more. This script never fetches a race's own site and never
 * writes to `data/race-editions.csv`; it only reads the two catalogue CSVs
 * and prints a worklist.
 *
 * WHY A SEPARATE STEP FROM THE RESEARCH ITSELF. Reading an organiser's page
 * and turning it into a dated row is judgment, not parsing — the same
 * research pass that first populated this CSV (see the PR that grew it from
 * 18 to 77 rows) hit page formats that misled a naive read (a "Registrations
 * open" badge sitting next to a race's *start date*, not its actual
 * registration date, on nearly every UTMB subsite) and caught it only by
 * cross-checking. A deterministic parser breaks the moment a site changes
 * its markup and fails silently — the exact failure mode
 * docs/race-data-sources.md's "Why this is not scraped" section already
 * rules out for the CSVs generally. So the actual re-reading is a scheduled
 * agent's job (it has a browser and can use judgment); this script's job is
 * only to point it at the right rows.
 *
 * FOUR REASONS A ROW MAKES THE LIST:
 *
 *   1. `eventsWithNoEdition` — an event with zero rows at all. Checked every
 *      run rather than rotated, because the list is small (23 as of the
 *      bulk-research pass) and a rotation would need its own state to track
 *      "checked recently, still nothing" — not worth it at this size.
 *   2. `finishedWithNoNext` — an event whose only known edition has already
 *      run, with no later (event, year) row to replace it. The race almost
 *      certainly has a next edition somewhere; nobody has looked yet.
 *   3. `staleVerified` — `verified_at` older than STALE_DAYS. Tighter than
 *      the daily maintenance job's 90-day alert threshold (45, not 90) on
 *      purpose: this is the check meant to catch it *before* it becomes that
 *      alert, not react to the same alert a second time.
 *   4. `registrationWindowSoon` — a dated, upcoming edition whose
 *      registration opens or closes within REGISTRATION_HORIZON_DAYS. These
 *      are the rows where a stale date costs the most (AGENTS.md: "a wrong
 *      date sends somebody to a closed entry form"), so they get re-checked
 *      on a shorter clock than staleness alone would trigger.
 *
 * A row can land in more than one list — reported separately rather than
 * de-duplicated into one queue, because the reason it needs attention is
 * itself useful context for whoever (or whatever agent) re-reads it.
 *
 *   pnpm tsx scripts/refresh-race-editions.ts
 *   pnpm tsx scripts/refresh-race-editions.ts --json
 */
import fs from 'node:fs'
import path from 'node:path'

const STALE_DAYS = 45
const REGISTRATION_HORIZON_DAYS = 30

const asJson = process.argv.includes('--json')

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

const today = new Date().toISOString().slice(0, 10)
const shift = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
const staleBefore = shift(-STALE_DAYS)
const registrationHorizon = shift(REGISTRATION_HORIZON_DAYS)

const dataDir = path.resolve(import.meta.dirname, '..', 'data')
const events = parseCsv(fs.readFileSync(path.join(dataDir, 'race-events.csv'), 'utf8'))
const editions = parseCsv(fs.readFileSync(path.join(dataDir, 'race-editions.csv'), 'utf8'))

const editionsByEvent = new Map<string, Record<string, string>[]>()
for (const edition of editions) {
  const list = editionsByEvent.get(edition.event_key) ?? []
  list.push(edition)
  editionsByEvent.set(edition.event_key, list)
}

const eventsWithNoEdition = events
  .filter((e) => !editionsByEvent.has(e.key))
  .map((e) => ({ event_key: e.key, name: e.name, website: e.website || undefined }))

const finishedWithNoNext: { event_key: string; name: string; lastKnown: string; website?: string }[] = []
const staleVerified: { event_key: string; year: string; verified_at: string; source_url: string }[] = []
const registrationWindowSoon: {
  event_key: string
  year: string
  start_date: string
  registration_opens_at?: string
  registration_closes_at?: string
  source_url: string
}[] = []

for (const [eventKey, rows] of editionsByEvent) {
  const event = events.find((e) => e.key === eventKey)
  const dated = rows.filter((r) => r.start_date).sort((a, b) => a.start_date.localeCompare(b.start_date))
  const latest = dated[dated.length - 1]

  if (latest && latest.start_date < today) {
    finishedWithNoNext.push({
      event_key: eventKey,
      name: event?.name ?? eventKey,
      lastKnown: latest.start_date,
      website: event?.website || undefined,
    })
  }

  for (const row of dated) {
    // Already-passed rows are history, same as the daily maintenance job's
    // own rule — nothing to re-verify about a race that already happened.
    if (row.start_date < today) continue

    if (!row.verified_at || row.verified_at < staleBefore) {
      staleVerified.push({
        event_key: eventKey,
        year: row.year,
        verified_at: row.verified_at || '(never)',
        source_url: row.source_url,
      })
    }

    const opensSoon = row.registration_opens_at && row.registration_opens_at <= registrationHorizon && row.registration_opens_at >= today
    const closesSoon = row.registration_closes_at && row.registration_closes_at <= registrationHorizon && row.registration_closes_at >= today
    if (opensSoon || closesSoon) {
      registrationWindowSoon.push({
        event_key: eventKey,
        year: row.year,
        start_date: row.start_date,
        registration_opens_at: row.registration_opens_at || undefined,
        registration_closes_at: row.registration_closes_at || undefined,
        source_url: row.source_url,
      })
    }
  }
}

const worklist = { eventsWithNoEdition, finishedWithNoNext, staleVerified, registrationWindowSoon }
const total =
  eventsWithNoEdition.length + finishedWithNoNext.length + staleVerified.length + registrationWindowSoon.length

if (asJson) {
  console.log(JSON.stringify(worklist, null, 2))
} else {
  console.log(`Weekly editions refresh worklist (${total} row(s) across 4 categories):\n`)
  console.log(`eventsWithNoEdition (${eventsWithNoEdition.length}):`)
  for (const e of eventsWithNoEdition) console.log(`  ${e.event_key} — ${e.name}${e.website ? ` (${e.website})` : ' (no website)'}`)
  console.log(`\nfinishedWithNoNext (${finishedWithNoNext.length}):`)
  for (const e of finishedWithNoNext) console.log(`  ${e.event_key} — last known ${e.lastKnown}${e.website ? ` (${e.website})` : ''}`)
  console.log(`\nstaleVerified (${staleVerified.length}, older than ${STALE_DAYS} days):`)
  for (const e of staleVerified) console.log(`  ${e.event_key}/${e.year} — verified_at=${e.verified_at} (${e.source_url})`)
  console.log(`\nregistrationWindowSoon (${registrationWindowSoon.length}, within ${REGISTRATION_HORIZON_DAYS} days):`)
  for (const e of registrationWindowSoon) {
    console.log(
      `  ${e.event_key}/${e.year} — opens=${e.registration_opens_at ?? '-'} closes=${e.registration_closes_at ?? '-'} (${e.source_url})`,
    )
  }
}
