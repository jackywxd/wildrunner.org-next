import type { Endpoint, PayloadRequest } from 'payload'
import { APIError } from 'payload'

import { isAdminUser } from '@/access'
import { startTranscode } from '@/lib/media/transcode-dispatch'
import { notifyTranscodeFailed } from '@/lib/media/transcode-notify'
import {
  LEASE_TIMEOUT_MS,
  MAX_CONCURRENT_TRANSCODES,
  MAX_TRANSCODE_ATTEMPTS,
  planSweep,
} from '@/lib/media/transcode-state'

/**
 * Reclaim transcode jobs whose container died without reporting.
 *
 * This is not defensive programming; it is the direct consequence of a
 * documented platform property. Cloudflare states that it "does not
 * guarantee that any container instance will run for any set period of
 * time" — a host restart or a rollout sends `SIGTERM` and `SIGKILL`s
 * fifteen minutes later. A container killed mid-encode has no opportunity
 * to report anything, so the row it left behind says `running` forever and
 * the member's video is never transcoded, with nothing on screen to say so.
 *
 * Without this endpoint the queue has no way to notice that. It is the half
 * of the lease that makes `running` mean "someone is working on this" rather
 * than "someone once started this".
 *
 * Also re-dispatches rows that are merely `queued`: the dispatch call in
 * `transcodeMediaEndpoint` is best-effort, so a transcoder that was down at
 * upload time leaves a correctly-queued row nobody has picked up.
 *
 * PACED TO THE CONTAINER LIMIT, and `planSweep` decides that rather than this
 * handler — read its header for the production measurement that made it
 * necessary. The short version: this loop used to dispatch every queued row
 * on every run, so ten videos against three container slots produced nine
 * refusals and one transcode, over and over. What it dispatches now is bounded
 * by how many containers are actually free.
 *
 * TRIGGERED BY GitHub Actions, like raceScheduleMaintenance — and for the
 * reason its header records: a Cloudflare Cron Trigger needs a `scheduled`
 * handler exported from the Worker, and OpenNext generates that entrypoint.
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
  // An admin session is allowed too, so the sweep can be run by hand from a
  // browser while debugging without the secret to hand.
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

export const transcodeSweepEndpoint: Endpoint = {
  path: '/members/media/transcode-sweep',
  method: 'post',
  handler: async (req) => {
    authorise(req)

    const now = new Date()

    // Both states in one query. `queued` rows are re-dispatched as they are;
    // `running` rows are only touched once their lease has actually expired,
    // which `leaseExpired` decides from `updatedAt` — reclaiming a live job
    // would put a second container on the same file.
    const candidates = await req.payload.find({
      collection: 'media',
      depth: 0,
      limit: 100,
      pagination: false,
      sort: 'updatedAt',
      where: {
        transcodeStatus: { in: ['queued', 'running'] },
      },
      overrideAccess: true,
      req,
    })

    // Decided in one pass, before anything is written, so the dispatch budget
    // is computed against a single consistent view of the queue.
    const plan = planSweep(candidates.docs, now)

    const reclaimed: number[] = []
    const failed: number[] = []
    const redispatched: number[] = []

    for (const { attempts, row, status } of plan.reclaim) {
      await req.payload.update({
        collection: 'media',
        id: row.id,
        data: { transcodeAttempts: attempts, transcodeStatus: status },
        overrideAccess: true,
        req,
      })

      if (status === 'failed') {
        // The other way a transcode ends up failed, and the quieter one:
        // the container died without reporting, so nothing has told the
        // member anything at all. Same notice as the reported failure —
        // from where they sit the outcome is identical.
        await notifyTranscodeFailed({
          media: row,
          // The container never reported, so there is no message from it
          // — this is the sweep's own account of what happened, which is
          // more useful to a member than an empty reason block.
          message: `轉檔逾時，已重試 ${MAX_TRANSCODE_ATTEMPTS} 次仍未完成。`,
          payload: req.payload,
          req,
        })
        failed.push(row.id)
        continue
      }
      reclaimed.push(row.id)
    }

    for (const doc of plan.dispatch) {
      if (await startTranscode(doc)) {
        redispatched.push(doc.id)
      }
    }

    return Response.json({
      capacity: MAX_CONCURRENT_TRANSCODES,
      checked: candidates.docs.length,
      failed,
      // Counted and reported because the old numbers could not distinguish a
      // quiet queue from a saturated one: `redispatched` only ever meant "the
      // Worker accepted the request", and `accept` is fire-and-forget, so a
      // run that started one job and bounced nine reported ten. `waiting` is
      // the backlog this run deliberately did not touch.
      inFlight: plan.inFlight,
      leaseTimeoutMs: LEASE_TIMEOUT_MS,
      maxAttempts: MAX_TRANSCODE_ATTEMPTS,
      reclaimed,
      redispatched,
      waiting: plan.waiting,
    })
  },
}
