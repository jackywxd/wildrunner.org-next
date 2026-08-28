import type { Endpoint, PayloadRequest } from 'payload'
import { APIError } from 'payload'

import { isAdminUser } from '@/access'
import { collectReferencedMediaIds } from '@/lib/media/references'
import { notifyUnusedMedia, type MarkedFile } from '@/lib/media/unused-notify'
import { GRACE_MS, MIN_AGE_MS, decide } from '@/lib/media/unused'

/**
 * Delete media nobody has used for a year — in two stages, a week apart.
 *
 * Each run resolves every reference in the database once
 * (src/lib/media/references.ts), then asks src/lib/media/unused.ts what to
 * do with each media row. A row that is unreferenced and over a year old is
 * *marked* and its owner mailed; only a later run, once the grace period has
 * passed, deletes it. Nothing is ever deleted on the run that first notices
 * it.
 *
 * TRIGGERED BY GitHub Actions, like transcodeSweep and
 * raceScheduleMaintenance, and for the reason their headers record: a
 * Cloudflare Cron Trigger needs a `scheduled` handler exported from the
 * Worker, and OpenNext generates that entrypoint.
 *
 * DRY RUN UNLESS `?apply=true`. That default is the opposite of the other
 * two sweeps and it is deliberate: they reclaim leases and recompute
 * schedules, both of which can be re-run harmlessly, while this one destroys
 * files. Anyone who reaches this URL with an admin session and no query
 * string — which is how it will be looked at when someone wants to know what
 * it would do — gets a report instead of a deletion.
 *
 * WHAT IT DOES NOT DELETE: a transcoded video's pre-transcode original.
 * `Media.originalUrl` is documented as never removed automatically, and
 * `@payloadcms/storage-r2` only deletes the object named by `filename`, so
 * deleting such a row leaves its original behind in R2. The response counts
 * those under `originalsLeftInR2` rather than quietly widening this job into
 * the human decision AGENTS.md reserves — `pnpm media:orphans` is what
 * collects them, and it already lists them because nothing points at them
 * once the document is gone.
 */

function secretMatches(supplied: string, expected: string): boolean {
  if (supplied.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < supplied.length; i += 1) {
    diff |= supplied.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return diff === 0
}

function authorise(req: PayloadRequest): void {
  // An admin session is allowed too, so the sweep can be inspected by hand
  // from a browser without the secret to hand.
  if (isAdminUser(req.user)) return

  const expected = process.env.RACE_MAINTENANCE_SECRET
  if (!expected) {
    throw new APIError('RACE_MAINTENANCE_SECRET is not configured', 500)
  }
  const supplied = req.headers.get('x-maintenance-secret')
  if (!supplied || !secretMatches(supplied, expected)) {
    throw new APIError('Unauthorized', 401)
  }
}

/** How many media documents to read per page. Matches the resolver's own paging. */
const PAGE_SIZE = 100

/**
 * The most files one run may delete.
 *
 * A blast radius, not a performance limit. Every deletion here is
 * irreversible and driven by a computed verdict, so the question worth
 * designing for is what happens when that computation is wrong — and the
 * answer should be "fifty files and a number in the response that nobody
 * can miss", not "the media library". A legitimate backlog simply drains
 * over the following weeks.
 */
const MAX_DELETIONS_PER_RUN = 50

export const unusedMediaSweepEndpoint: Endpoint = {
  path: '/members/media/unused-sweep',
  method: 'post',
  handler: async (req) => {
    authorise(req)

    const apply = req.searchParams.get('apply') === 'true'
    const now = new Date()

    const scan = await collectReferencedMediaIds(req.payload, req)

    // A scan that read no documents cannot distinguish "nothing references
    // these files" from "the scan is broken", and those two have very
    // different consequences. A site with no posts and no galleries has
    // nothing worth sweeping anyway, so refusing costs nothing and removes
    // the single failure mode that would empty the library.
    const scanned = Object.values(scan.counts).reduce((sum, count) => sum + count, 0)
    if (scanned === 0) {
      return Response.json({
        apply,
        deleted: [],
        marked: [],
        message:
          'Reference scan read no documents. Refusing to mark or delete anything: ' +
          'an empty scan looks identical to a broken one.',
        referenceCounts: scan.counts,
        unmarked: [],
      })
    }

    const marked: number[] = []
    const unmarked: number[] = []
    const deleted: number[] = []
    const waiting: { deleteAfter: string; id: number }[] = []
    const markedByOwner = new Map<number | string, MarkedFile[]>()
    let unowned = 0
    let originalsLeftInR2 = 0
    let deletionCapReached = false

    let page = 1
    for (;;) {
      const batch = await req.payload.find({
        collection: 'media',
        depth: 0,
        limit: PAGE_SIZE,
        overrideAccess: true,
        page,
        req,
        sort: 'createdAt',
      })

      for (const doc of batch.docs) {
        const decision = decide({ doc, now, referenced: scan.ids })

        if (decision.action === 'keep') {
          if (!decision.clearMark) continue
          unmarked.push(doc.id)
          if (apply) {
            await req.payload.update({
              collection: 'media',
              data: { unusedSince: null },
              depth: 0,
              id: doc.id,
              overrideAccess: true,
              req,
            })
          }
          continue
        }

        if (decision.action === 'wait') {
          waiting.push({ deleteAfter: decision.deleteAfter.toISOString(), id: doc.id })
          continue
        }

        if (decision.action === 'mark') {
          marked.push(doc.id)
          const ownerId =
            typeof doc.owner === 'object' && doc.owner !== null
              ? (doc.owner as { id?: number | string }).id
              : (doc.owner as number | string | null | undefined)

          if (ownerId === null || ownerId === undefined) {
            unowned += 1
          } else {
            const files = markedByOwner.get(ownerId) ?? []
            files.push({ filename: doc.filename, id: doc.id, url: doc.url })
            markedByOwner.set(ownerId, files)
          }

          if (apply) {
            await req.payload.update({
              collection: 'media',
              data: { unusedSince: now.toISOString() },
              depth: 0,
              id: doc.id,
              overrideAccess: true,
              req,
            })
          }
          continue
        }

        // decision.action === 'delete'
        if (deleted.length >= MAX_DELETIONS_PER_RUN) {
          deletionCapReached = true
          continue
        }
        if (doc.originalUrl) originalsLeftInR2 += 1
        deleted.push(doc.id)
        if (apply) {
          // Payload's delete is what removes the R2 object: the cloud-storage
          // plugin hangs its own afterDelete off this collection. Deleting
          // the row directly through the database would strand the file.
          await req.payload.delete({
            collection: 'media',
            depth: 0,
            id: doc.id,
            overrideAccess: true,
            req,
          })
        }
      }

      if (!batch.hasNextPage) break
      page += 1
    }

    // Mail after the marks are written, not before: a member who follows the
    // link immediately should find the state the mail describes.
    const deleteAfter = new Date(now.getTime() + GRACE_MS)
    let notified = 0
    let notifyFailed = 0
    let notifySkipped = 0
    if (apply) {
      for (const [ownerId, files] of markedByOwner) {
        const outcome = await notifyUnusedMedia({
          deleteAfter,
          files,
          ownerId,
          payload: req.payload,
          req,
        })
        if (outcome === 'sent') notified += 1
        else if (outcome === 'failed') notifyFailed += 1
        // `skipped` is the normal state anywhere mail is not configured —
        // staging's Resend key is deliberately empty — so it is reported
        // apart from failure rather than folded into it.
        else notifySkipped += 1
      }
    }

    if (deletionCapReached) {
      req.payload.logger.warn(
        `unused media sweep hit the ${MAX_DELETIONS_PER_RUN}-file deletion cap; ` +
          'the rest are left for the next run',
      )
    }

    return Response.json({
      apply,
      deleted,
      deletionCapReached,
      graceMs: GRACE_MS,
      marked,
      markedOwners: markedByOwner.size,
      minAgeMs: MIN_AGE_MS,
      notified,
      notifyFailed,
      notifySkipped,
      originalsLeftInR2,
      referenceCounts: scan.counts,
      referencedMedia: scan.ids.size,
      unmarked,
      unowned,
      waiting,
    })
  },
}
