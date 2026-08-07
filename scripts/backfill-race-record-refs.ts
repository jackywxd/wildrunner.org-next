/**
 * Fill in `race_records.edition`/`category` for rows written before
 * `populateRaceRecordRefs` existed.
 *
 * Every new write already resolves these (RaceRecords.ts's
 * `hooks.beforeChange`) — this is only for the handful of rows that predate
 * that hook. Reuses `resolveRaceRecordRefs` directly rather than
 * reimplementing the lookup, so the backfill and the live hook can never
 * disagree about what a given (eventId, distanceId, year) resolves to.
 *
 * Writes through `payload.db.updateOne`, not `payload.update` — the same
 * choice `backfill-media-filesize.ts` makes and for the same reason:
 * `payload.update` would re-run `setOwner`/`uniqueRaceRecord` against a
 * partial data object that carries none of the fields those hooks need, and
 * would fire `revalidateRaceRecord.afterChange` once per row for no reason.
 * This backfill only ever adds a value to a column that was NULL — it never
 * touches `eventId`/`distanceId`/`year`/`owner` — so there is nothing for
 * those hooks to usefully do here.
 *
 * Dry run unless `--write` is passed. Targets local D1 unless `--remote` is
 * passed, in which case `CLOUDFLARE_ENV` (staging|production) selects the
 * target — see `derive-race-editions.ts` for why the config import is
 * dynamic and deliberately placed after that resolution, and why a stray
 * ambient `CLOUDFLARE_ENV`/`NODE_ENV=production` left over from a previous
 * command refuses to run rather than being silently honoured.
 *
 *   pnpm tsx scripts/backfill-race-record-refs.ts                    # local, report only
 *   pnpm tsx scripts/backfill-race-record-refs.ts --write             # local, apply
 *   CLOUDFLARE_ENV=staging pnpm tsx scripts/backfill-race-record-refs.ts --remote --write
 */
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
  if (target === 'production') {
    delete process.env.CLOUDFLARE_ENV
  } else {
    process.env.CLOUDFLARE_ENV = target
  }
  console.log(`[backfill-race-record-refs] target: ${target} (remote)`)
} else if (process.env.CLOUDFLARE_ENV || process.env.NODE_ENV === 'production') {
  console.error(
    'CLOUDFLARE_ENV or NODE_ENV=production is set but --remote was not passed. ' +
      'Refusing to guess whether this run means the local database or a real ' +
      'one — pass --remote to target CLOUDFLARE_ENV explicitly, or unset it to ' +
      'run locally.',
  )
  process.exit(1)
}

async function main() {
  const { default: config } = await import('../src/payload.config')
  const { resolveRaceRecordRefs } = await import('../src/collections/hooks/populate-race-record-refs')
  const payload = await getPayload({ config })

  const { docs } = await payload.find({
    collection: 'race-records',
    limit: 0,
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { eventId: true, distanceId: true, year: true, edition: true, category: true },
  })

  const pending = docs.filter((doc) => !doc.edition || !doc.category)
  console.log(`race-records: ${docs.length} total, ${pending.length} missing edition and/or category`)

  const updates: { id: number | string; editionId?: number; categoryId?: number }[] = []
  const unresolved: string[] = []

  for (const doc of pending) {
    const eventId = doc.eventId
    const year = doc.year
    if (typeof eventId !== 'string' || eventId === '' || typeof year !== 'number') {
      unresolved.push(`id=${doc.id} (missing eventId/year — should be impossible, required fields)`)
      continue
    }
    const distanceId = typeof doc.distanceId === 'string' ? doc.distanceId : undefined
    const { editionId, categoryId } = await resolveRaceRecordRefs(payload, { eventId, distanceId, year })
    if (editionId === undefined && categoryId === undefined) {
      unresolved.push(`id=${doc.id} eventId=${eventId} distanceId=${distanceId ?? ''} year=${year}`)
      continue
    }
    updates.push({ id: doc.id, editionId, categoryId })
  }

  console.log(`resolved=${updates.length} unresolved=${unresolved.length}`)
  for (const row of unresolved) console.log(`  unresolved: ${row}`)

  if (!shouldWrite) {
    console.log('\nDry run. Pass --write to apply.')
    return
  }

  for (const update of updates) {
    const data: Record<string, number> = {}
    if (update.editionId !== undefined) data.edition = update.editionId
    if (update.categoryId !== undefined) data.category = update.categoryId
    await payload.db.updateOne({ collection: 'race-records', id: update.id, data })
  }
  console.log(`Updated ${updates.length} documents.`)
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
