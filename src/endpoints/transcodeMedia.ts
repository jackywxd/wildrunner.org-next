import type { Endpoint } from 'payload'
import { APIError } from 'payload'

import { isAdminUser } from '@/access'
import { nextStatusForRequest } from '@/lib/media/transcode-state'
import { startTranscode } from '@/lib/media/transcode-dispatch'

/**
 * Queue a freshly uploaded video for transcoding to H.264 1080p.
 *
 * A dedicated endpoint the client calls after creating the document, NOT a
 * `media` afterChange hook — the same shape, and for the same reason, as
 * `processMediaImage.ts`. Read that file's header: the hook version of
 * post-upload work reliably failed because a `bucket.get()` for the object
 * written moments earlier in the *same* request came back null, in both dev
 * and production, while any genuinely separate request saw it immediately.
 * The mechanism was never pinned down; this avoids it structurally.
 *
 * NOT /media/:id/... — Payload's router treats any path whose first segment
 * matches a real collection slug as scoped to that collection's own
 * `endpoints` array, bypassing this global registration and answering 404.
 * Every custom endpoint here already avoids it the same way.
 *
 * Returns as soon as the job is queued. Transcoding a 4K video measures
 * around 2.6 minutes of encoding plus transfer, which is not something an
 * upload request can wait for; the container reports back by patching the
 * row, and the client polls `transcodeStatus`.
 */
export const transcodeMediaEndpoint: Endpoint = {
  path: '/members/media/:id/transcode',
  method: 'post',
  handler: async (req) => {
    if (!req.user) {
      throw new APIError('Unauthorized', 401)
    }

    const id = req.routeParams?.id
    if (typeof id !== 'string' && typeof id !== 'number') {
      throw new APIError('An id is required.', 400)
    }

    const doc = await req.payload.findByID({
      collection: 'media',
      id,
      depth: 0,
      overrideAccess: true,
      req,
    })

    const ownerId = typeof doc.owner === 'object' ? doc.owner?.id : doc.owner
    if (!isAdminUser(req.user) && ownerId !== req.user.id) {
      throw new APIError('Forbidden', 403)
    }

    const status = nextStatusForRequest(doc)

    // `skipped` for an image, `done` for something already transcoded. Both
    // are recorded rather than ignored, so the media library can tell "this
    // needs nothing" apart from "nobody has looked at this yet".
    if (status !== 'queued') {
      if (doc.transcodeStatus !== status) {
        await req.payload.update({
          collection: 'media',
          id,
          data: { transcodeStatus: status },
          overrideAccess: true,
          req,
        })
      }
      return Response.json({ queued: false, status })
    }

    await req.payload.update({
      collection: 'media',
      id,
      data: { transcodeStatus: 'queued' },
      overrideAccess: true,
      req,
    })

    // Best-effort, and deliberately not awaited to completion: if the
    // transcoder is unreachable the row simply stays `queued`, and the
    // scheduled sweep picks it up. Throwing here would report a *successful*
    // upload as failed, which is the mistake processMediaImage.ts's header
    // warns about.
    const dispatched = await startTranscode(doc)

    return Response.json({ queued: true, dispatched, status: 'queued' })
  },
}
