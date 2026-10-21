/**
 * Place every race event on the footprint map: `race-events.lat/lng`.
 *
 * WHAT THIS IS FOR. The hooks (src/collections/hooks/geocode-race-event.ts)
 * place an event when it is created or when an edition gains a location. They
 * cannot reach the rows that already exist — the catalogue was inserted by
 * two migrations with raw SQL, which fires no hook — nor retry a lookup that
 * failed in transit. This does both, one event at a time.
 *
 * WHICH EVENTS: no point yet, or `geoStatus = failed`. Never `manual` — a
 * person put that dot there — and never one that already has a point, so
 * re-running is cheap and a run that died halfway resumes where it stopped.
 * `no-place` and `not-found` are retried too, because they have no point; a
 * run is the way to find out whether an edition has since gained a location.
 *
 * `--retry-not-found` widens that by one case and no more: an event whose
 * `geoStatus` is `not-found` is processed even if it still carries a point.
 * The default skips it, since "has a point" is how the script tells a placed
 * event from an unplaced one, and a failed *refresh* keeps the old dot with
 * an honest status (resolveAndWriteEvent) — which is exactly an event with a
 * point and `not-found`. It exists for the day the geocoder's behaviour
 * changes underneath rows that were judged by the old one (Nominatim's
 * country codes: HKG and REU were all `not-found` until `osmCountryCode`),
 * so those rows can be asked again on purpose. `manual` is still never
 * touched, and neither is `ok`. The run prints the events it will process,
 * by key and status, before it processes any.
 *
 * ONE REQUEST A SECOND comes from `nominatim.ts` itself (Nominatim's usage
 * policy), and the model is asked once per event, never in a burst — Workers
 * AI allows about 20 calls a minute on Kimi.
 *
 * REAL OR STAND-IN. The same gate as the model endpoints, `realAIAvailable()`:
 * a plain local run reads `data/race-event-places.csv` and calls no one. That
 * is what `db:reset:local` uses to give the corpus coordinates. To geocode for
 * real from a laptop, set `AI_IN_DEV=true`; the :staging and :prod variants
 * run with NODE_ENV=production and are always real. Note a local real run has
 * no Workers AI binding (it is `remote: true` in wrangler.jsonc and local
 * runs do not open remote sessions), so an event with no edition location is
 * reported `failed` locally, not guessed at.
 *
 * `--export` rewrites data/race-event-places.csv from the database after the
 * run. That file is the reviewable record of where the map's dots are and the
 * stand-in's source of truth; the diff is what a person accepts.
 *
 * REPORT, DO NOT TRUST THE VERDICT. A row reported failed may already be
 * written (AGENTS.md, "A row reported as failed may already be written"): D1
 * has no transaction to roll it back and the error may come from the round
 * trip. So a failed row is read back and its stored status printed beside the
 * error, and the totals count what the database holds, not what the client
 * said.
 *
 *   pnpm geocode:events [--retry-not-found] [--export]              # local
 *   pnpm geocode:events:staging [--retry-not-found] [--export]      # staging D1 — run by Jacky
 *   pnpm geocode:events:prod [--retry-not-found] [--export]         # production D1 — run by Jacky
 *
 * The flags reach the script as they stand: pnpm 10 forwards everything after
 * the script name (`pnpm geocode:events:staging --retry-not-found`); a `--`
 * before them is passed through too, and the script ignores it.
 */
import fs from 'node:fs'
import path from 'node:path'

import { getPayload } from 'payload'

const exportCsv = process.argv.includes('--export')
const retryNotFound = process.argv.includes('--retry-not-found')
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
  console.log(`[geocode-race-events] target: ${target} (remote)`)
} else if (process.env.CLOUDFLARE_ENV || process.env.NODE_ENV === 'production') {
  console.error(
    'CLOUDFLARE_ENV or NODE_ENV=production is set but --remote was not passed. ' +
      'Refusing to guess whether this run means the local database or a real ' +
      'one — pass --remote to target CLOUDFLARE_ENV explicitly, or unset it to ' +
      'run locally.',
  )
  process.exit(1)
}

function causeChain(error: unknown): string {
  const parts: string[] = []
  let current: unknown = error
  for (let depth = 0; depth < 6 && current instanceof Error; depth += 1) {
    if (!parts.includes(current.message)) parts.push(current.message)
    current = current.cause
  }
  return parts.join(' <- ')
}

async function main() {
  const { default: config } = await import('../src/payload.config')
  const { geoMode, resolveAndWriteEvent } = await import('../src/lib/geo/geocode-event')
  const { serializePlaceCsv } = await import('../src/lib/geo/place-csv')
  const payload = await getPayload({ config })

  const mode = geoMode()
  console.log(`[geocode-race-events] mode: ${mode}${mode === 'stand-in' ? ' (data/race-event-places.csv, no network)' : ''}`)

  // The model's binding, only when it will be used. `remoteBindings` follows
  // the target the same way payload.config.ts does it; a local real run gets
  // a binding that cannot reach Workers AI, and says so per event.
  let ai: Ai | undefined
  let disposeProxy: (() => Promise<void>) | undefined
  if (mode === 'real') {
    const { getPlatformProxy } = await import('wrangler')
    const proxy = await getPlatformProxy<{ AI?: Ai }>({
      environment: process.env.CLOUDFLARE_ENV,
      remoteBindings: remote,
    })
    ai = proxy.env.AI
    disposeProxy = () => proxy.dispose()
  }

  const events = await payload.find({
    collection: 'race-events',
    depth: 0,
    limit: 0,
    pagination: false,
    sort: 'key',
    overrideAccess: true,
  })

  const manual = events.docs.filter((event) => event.geoSource === 'manual')
  const targets = events.docs.filter(
    (event) =>
      event.geoSource !== 'manual' &&
      (typeof event.lat !== 'number' ||
        event.geoStatus === 'failed' ||
        (retryNotFound && event.geoStatus === 'not-found')),
  )
  console.log(
    `[geocode-race-events] ${events.totalDocs} events: ${targets.length} to place, ` +
      `${manual.length} manual (left alone), ${events.totalDocs - targets.length - manual.length} already placed` +
      (retryNotFound ? ' (--retry-not-found: not-found events included)' : ''),
  )
  // Before anything is written, so a run that is about to do the wrong thing
  // can be stopped by reading its first screen.
  for (const event of targets) {
    console.log(
      `  will process ${event.key}: geoStatus=${event.geoStatus ?? 'empty'} ` +
        `${typeof event.lat === 'number' ? `has point ${event.lat},${event.lng}` : 'no point'}`,
    )
  }

  const counts = { ok: 0, 'no-place': 0, 'not-found': 0, failed: 0 }
  const problems: string[] = []

  for (const event of targets) {
    try {
      const result = await resolveAndWriteEvent(payload, event.id, { ai, mode })
      if (!result.written) {
        console.log(`  - ${event.key}: skipped (${result.reason})`)
        continue
      }
      counts[result.outcome.geoStatus] += 1
      const where =
        result.outcome.geoStatus === 'ok'
          ? `${result.outcome.geoPlace} ${result.outcome.lat},${result.outcome.lng} [${result.outcome.geoSource}]`
          : (result.outcome.detail ?? '')
      console.log(`  ${result.outcome.geoStatus === 'ok' ? '+' : '!'} ${event.key}: ${result.outcome.geoStatus} ${where}`)
    } catch (error) {
      // The row may already be written, whatever the client said. Read it.
      const stored = await payload
        .findByID({ collection: 'race-events', id: event.id, depth: 0, overrideAccess: true })
        .then((row) => `stored geoStatus=${row.geoStatus ?? 'empty'} lat=${row.lat ?? 'empty'}`)
        .catch(() => 'could not read the row back')
      counts.failed += 1
      problems.push(`${event.key}: ${causeChain(error)} (${stored})`)
      console.log(`  ! ${event.key}: write failed — ${stored}`)
    }
  }

  // What the database holds now, not what the loop believed.
  const after = await payload.find({
    collection: 'race-events',
    depth: 0,
    limit: 0,
    pagination: false,
    sort: 'key',
    overrideAccess: true,
  })
  const byStatus = new Map<string, number>()
  for (const event of after.docs) {
    const status = event.geoStatus ?? 'unattempted'
    byStatus.set(status, (byStatus.get(status) ?? 0) + 1)
  }
  console.log(
    `\n[geocode-race-events] this run: ok=${counts.ok} no-place=${counts['no-place']} ` +
      `not-found=${counts['not-found']} failed=${counts.failed}`,
  )
  console.log(
    `[geocode-race-events] database now: ${[...byStatus].map(([status, n]) => `${status}=${n}`).join(' ')} ` +
      `(of ${after.totalDocs}; ${after.docs.filter((e) => typeof e.lat === 'number').length} have a point)`,
  )
  for (const line of problems) console.log(`  failed: ${line}`)

  if (exportCsv) {
    const rows = after.docs
      .filter((event) => typeof event.lat === 'number' && typeof event.lng === 'number')
      .flatMap((event) =>
        event.geoSource
          ? [
              {
                eventKey: event.key,
                place: event.geoPlace ?? '',
                lat: event.lat as number,
                lng: event.lng as number,
                source: event.geoSource,
                geocodedAt: event.geocodedAt ?? '',
              },
            ]
          : (console.log(`  ? ${event.key}: has a point but no geoSource — left out of the export`), []),
      )
    const file = path.resolve(import.meta.dirname, '..', 'data', 'race-event-places.csv')
    fs.writeFileSync(file, serializePlaceCsv(rows))
    console.log(`[geocode-race-events] wrote ${rows.length} rows to ${path.relative(process.cwd(), file)}`)
  }

  await disposeProxy?.()
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
