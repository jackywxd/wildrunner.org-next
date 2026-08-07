/**
 * Gate `data/race-editions.csv` before anything imports it.
 *
 * Same reasoning as validate-catalogue.ts, applied to a different table: once
 * imported, a wrong row is either a public claim on /races (a wrong date,
 * pointing somebody at a form that isn't open yet) or a foreign key a
 * member's race record points at. So checks run *before* the import, and a
 * failure stops it.
 *
 * DIFFERENT FROM validate-catalogue.ts IN ONE WAY THAT MATTERS: events and
 * categories are near-permanent identity data, imported once and rarely
 * touched again. Editions are refreshed weekly — dates confirmed, seasons
 * added, registration windows updated — so this file is meant to be run
 * against a CSV that changes constantly, not just during a one-time review
 * pass.
 *
 *   pnpm tsx scripts/validate-race-editions.ts
 *   pnpm tsx scripts/validate-race-editions.ts --require-verified
 */
import fs from 'node:fs'
import path from 'node:path'

import { EARLIEST_RACE_YEAR } from '../src/lib/races/catalogue'

const DATA_DIR = path.resolve(import.meta.dirname, '..', 'data')
const requireVerified = process.argv.includes('--require-verified')

const REGISTRATION_TYPES = new Set(['first-come', 'lottery', 'qualifier', 'invitational'])
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

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

const problems: string[] = []
const warnings: string[] = []
const fail = (message: string) => problems.push(message)
const warn = (message: string) => warnings.push(message)

function read(file: string): Record<string, string>[] {
  const target = path.join(DATA_DIR, file)
  if (!fs.existsSync(target)) {
    console.error(`missing ${target}`)
    process.exit(1)
  }
  return parseCsv(fs.readFileSync(target, 'utf8'))
}

const events = read('race-events.csv')
const eventKeys = new Set(events.map((e) => e.key))
const editions = read('race-editions.csv')

const latestYear = new Date().getUTCFullYear() + 1
const seenPair = new Set<string>()

for (const row of editions) {
  const label = `${row.event_key || '?'}/${row.year || '?'}`

  if (!row.event_key) {
    fail(`editions: a row has no event_key`)
  } else if (!eventKeys.has(row.event_key)) {
    fail(`editions: "${row.event_key}" is not an event key`)
  }

  const year = Number(row.year)
  if (!row.year || !Number.isInteger(year)) {
    fail(`editions: ${label} year is not an integer`)
  } else if (year < EARLIEST_RACE_YEAR || year > latestYear) {
    fail(`editions: ${label} year must be between ${EARLIEST_RACE_YEAR} and ${latestYear}`)
  }

  const pair = `${row.event_key}/${row.year}`
  if (seenPair.has(pair)) fail(`editions: duplicate ${pair}`)
  seenPair.add(pair)

  for (const field of [
    'start_date',
    'end_date',
    'registration_opens_at',
    'registration_closes_at',
    'verified_at',
  ] as const) {
    const value = row[field]
    if (value && !DATE_RE.test(value)) {
      fail(`editions: ${label} ${field} "${value}" is not YYYY-MM-DD`)
    }
  }

  // A multi-day event's end can't precede its start. String comparison is
  // valid for YYYY-MM-DD (AGENTS.md, "Conventions") — no Date parsing here.
  if (row.start_date && row.end_date && row.end_date < row.start_date) {
    fail(`editions: ${label} end_date is before start_date`)
  }
  if (row.end_date && !row.start_date) {
    fail(`editions: ${label} has end_date but no start_date`)
  }
  if (
    row.registration_opens_at &&
    row.registration_closes_at &&
    row.registration_closes_at < row.registration_opens_at
  ) {
    fail(`editions: ${label} registration_closes_at is before registration_opens_at`)
  }

  for (const field of ['url', 'registration_url', 'source_url'] as const) {
    const value = row[field]
    if (value && !/^https?:\/\//.test(value)) {
      fail(`editions: ${label} ${field} "${value}" must start with http(s)://`)
    }
  }

  if (row.registration_type && !REGISTRATION_TYPES.has(row.registration_type)) {
    fail(
      `editions: ${label} registration_type "${row.registration_type}" is not one of ` +
        `${[...REGISTRATION_TYPES].join(', ')}`,
    )
  }

  // A dated row makes a public claim on /races — it needs to be traceable.
  // An undated row is a historical placeholder (RaceEditions.ts's own header:
  // "an edition may exist with a year and nothing else") and asserts nothing
  // a source could confirm.
  if (row.start_date && !row.source_url) {
    fail(`editions: ${label} has a start_date but no source_url`)
  }
  if (row.start_date && !row.verified_at) {
    warn(`editions: ${label} has a start_date but was never verified`)
  }
}

if (requireVerified) {
  const unverified = editions.filter((r) => r.start_date && !r.verified_at)
  if (unverified.length > 0) {
    fail(
      `${unverified.length} dated editions have no verified_at. Import refuses to run ` +
        `with --require-verified.`,
    )
  }
}

console.log(`${editions.length} editions.`)
for (const message of warnings) console.warn(`warn  ${message}`)
for (const message of problems) console.error(`FAIL  ${message}`)

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s). Not safe to import.`)
  process.exit(1)
}
console.log(warnings.length > 0 ? `\nOK, with ${warnings.length} warning(s).` : '\nOK.')
