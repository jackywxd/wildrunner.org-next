/**
 * Queue every video that has no poster, so the transcoder takes one.
 *
 * WHY THIS SCRIPT WRITES A STATUS AND NOTHING ELSE. A poster can only be made
 * by ffmpeg, ffmpeg only exists inside the transcoder's container, and that
 * container is only reachable from a deployed Worker — `startTranscode()`
 * returns false in dev and CI because the `TRANSCODER` service binding is
 * absent there. So a script cannot make a poster, and a script that tried to
 * dispatch one would be writing a second dispatcher next to the one that
 * already works.
 *
 * What already works is the queue: `transcodeSweep` finds every row that is
 * `queued` and hands it to the transcoder, with leases, attempt counting and
 * retries around it. This script therefore does the one thing the queue
 * cannot do for itself — decide which rows belong in it — and stops. The
 * sweep is the `Transcode sweep` workflow, and STAGING IS NOT ON ITS TIMER:
 * the schedule only ever sweeps production, so a staging backfill sits at
 * `queued` until somebody dispatches that workflow with environment=staging.
 * (There is no `pnpm transcode:sweep` script. An earlier version of this
 * header named one; it never existed, and the 23 rows a staging backfill
 * queued had nothing at all that would have picked them up.)
 *
 * The container takes the frame BEFORE it decides whether to encode (see
 * transcode.sh), so a video that is already h264/1080p costs one probe and
 * one frame rather than a re-encode. That is what makes running this over the
 * whole corpus cheap.
 *
 * WHAT IT DELIBERATELY LEAVES ALONE: rows already `done`. Re-queuing one
 * would get a poster, but `transcodeResult` writes `skipped` when the
 * container encodes nothing, so a video that really was transcoded would come
 * back labelled as one that never needed to be — a worse record than the
 * missing poster. Those rows are counted and listed instead, for a human to
 * decide about.
 *
 * ORDER OF OPERATIONS, per environment:
 *
 *   1. Deploy, so `media.poster_url` exists.
 *   2. Confirm the ledger caught up — a read, and it touches nothing:
 *      npx wrangler d1 execute <db> --remote \
 *        --command "SELECT name FROM payload_migrations ORDER BY id DESC LIMIT 3;"
 *   3. pnpm media:posters:<env>                # report only
 *   4. pnpm media:posters:<env> -- --write
 *   5. Dispatch `.github/workflows/transcode-sweep.yml` against this
 *      environment — required on staging, optional on production where the
 *      timer gets there eventually — then re-query:
 *      npx wrangler d1 execute <db> --remote --command \
 *        "SELECT COUNT(*) FROM media WHERE mime_type LIKE 'video/%' AND poster_url IS NOT NULL;"
 *
 * Step 3 is NOT read-only against a deployed database, which is the trap
 * worth naming twice: these scripts run with `NODE_ENV=production`, and
 * `@payloadcms/db-d1-sqlite`'s connect() applies every pending migration on
 * connect whatever the script then does. See AGENTS.md, "NODE_ENV=production
 * applies migrations. On connect."
 *
 *   pnpm media:posters                 # local, report only
 *   pnpm media:posters:staging
 *   pnpm media:posters:prod -- --write
 */
import { getPayload } from 'payload'
import config from '@payload-config'

const shouldWrite = process.argv.includes('--write')

async function main() {
  const payload = await getPayload({ config })

  const { docs } = await payload.find({
    collection: 'media',
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: { filename: true, mimeType: true, posterUrl: true, transcodeStatus: true },
    where: { mimeType: { like: 'video' } },
  })

  const queue: (number | string)[] = []
  const alreadyDone: string[] = []
  const tally = { hasPoster: 0, inFlight: 0, queue: 0, wasTranscoded: 0 }

  for (const doc of docs) {
    if (doc.posterUrl) {
      tally.hasPoster += 1
      continue
    }
    // Already on its way through the queue. Re-marking it would reset the
    // lease `transcodeSweep` measures staleness against, which is how a live
    // job ends up running twice.
    if (doc.transcodeStatus === 'queued' || doc.transcodeStatus === 'running') {
      tally.inFlight += 1
      continue
    }
    if (doc.transcodeStatus === 'done') {
      tally.wasTranscoded += 1
      alreadyDone.push(`${doc.id} ${doc.filename ?? '(no filename)'}`)
      continue
    }
    queue.push(doc.id)
    tally.queue += 1
  }

  console.log(
    `videos=${docs.length} -> to queue=${tally.queue} already have a poster=${tally.hasPoster} ` +
      `in flight=${tally.inFlight} transcoded before posters existed=${tally.wasTranscoded}`,
  )

  if (alreadyDone.length > 0) {
    console.log(
      `\n${alreadyDone.length} video(s) are \`done\` with no poster, and are NOT queued here: ` +
        'the container would encode nothing and report `skipped`, overwriting a true `done`. ' +
        'Re-run one by hand from the member library if its poster matters. id / filename:',
    )
    for (const line of alreadyDone.slice(0, 25)) console.log(`  ${line}`)
    if (alreadyDone.length > 25) console.log(`  … and ${alreadyDone.length - 25} more`)
  }

  if (!shouldWrite) {
    console.log('\nDry run. Pass --write to apply.')
    return
  }

  // Straight to the adapter, for the reason backfill-media-usage.ts gives:
  // `payload.update` fires afterChange, and `streamIngestOnUpload` would try
  // to push every one of these videos into Cloudflare Stream.
  for (const id of queue) {
    await payload.db.updateOne({
      collection: 'media',
      id,
      data: { transcodeStatus: 'queued' },
    })
  }

  // Read back from the database rather than trusting the loop, per AGENTS.md:
  // a script that has finished its writes and one that thinks it has are
  // indistinguishable from its own success message.
  const queuedNow = await payload.count({
    collection: 'media',
    where: { transcodeStatus: { equals: 'queued' } },
  })
  console.log(
    `\nqueued ${queue.length}; the database now reports ${queuedNow.totalDocs} row(s) queued. ` +
      'The scheduled sweep dispatches them — nothing here does.',
  )
}

// Booting Payload from the CLI leaves something on the event loop, so a
// script that has finished its work still never returns. See AGENTS.md.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
