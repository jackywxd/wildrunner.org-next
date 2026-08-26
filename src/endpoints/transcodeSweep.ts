import type { Endpoint, PayloadRequest } from 'payload'
import { APIError } from 'payload'

import { isAdminUser } from '@/access'
import { startTranscode } from '@/lib/media/transcode-dispatch'
import {
  LEASE_TIMEOUT_MS,
  MAX_TRANSCODE_ATTEMPTS,
  leaseExpired,
  reclaim,
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

    const reclaimed: number[] = []
    const failed: number[] = []
    const redispatched: number[] = []

    for (const doc of candidates.docs) {
      if (doc.transcodeStatus === 'running') {
        if (!leaseExpired(doc, now)) continue

        const next = reclaim(doc)
        await req.payload.update({
          collection: 'media',
          id: doc.id,
          data: {
            transcodeAttempts: next.attempts,
            transcodeStatus: next.status,
          },
          overrideAccess: true,
          req,
        })

        if (next.status === 'failed') {
          failed.push(doc.id)
          continue
        }
        reclaimed.push(doc.id)
      }

      // Reaches here for a row that was already `queued`, or one just
      // handed back to `queued` above.
      if (await startTranscode(doc)) {
        redispatched.push(doc.id)
      }
    }

    return Response.json({
      checked: candidates.docs.length,
      failed,
      leaseTimeoutMs: LEASE_TIMEOUT_MS,
      maxAttempts: MAX_TRANSCODE_ATTEMPTS,
      reclaimed,
      redispatched,
    })
  },
}
