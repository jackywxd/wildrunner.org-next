import type { Endpoint } from 'payload'
import { APIError } from 'payload'

import { isAdminUser } from '@/access'
import { startPosterCapture } from '@/lib/media/poster-dispatch'

/**
 * "Use the frame I am looking at as the cover."
 *
 * The member scrubs the player in the media dialog, presses a button, and the
 * client sends the player's own `currentTime`. The container takes that frame
 * and reports it back to `/poster-result`.
 *
 * WHY THE TIME COMES FROM THE CLIENT. It is the only place that knows it: the
 * frame the member means is the one their player is displaying, and no
 * server-side heuristic can recover that. It is also harmless to get wrong —
 * the worst case is a cover picture from the wrong moment, which the member
 * fixes by pressing the button again. `posterFrameJob` clamps it and the
 * transcoder re-validates it, so the value never reaches ffmpeg's argv
 * unchecked.
 *
 * NOT /media/:id/... — Payload's router scopes any path whose first segment
 * matches a collection slug to that collection's own `endpoints`, answering
 * 404 for a global registration. Same reason every other custom endpoint here
 * lives under /members/.
 */
export const posterFrameEndpoint: Endpoint = {
  path: '/members/media/:id/poster',
  method: 'post',
  handler: async (req) => {
    if (!req.user) {
      throw new APIError('Unauthorized', 401)
    }

    const id = req.routeParams?.id
    if (typeof id !== 'string' && typeof id !== 'number') {
      throw new APIError('An id is required.', 400)
    }

    const body = (await req.json?.()) as { seconds?: unknown } | undefined
    const seconds = typeof body?.seconds === 'number' ? body.seconds : Number(body?.seconds)
    if (!Number.isFinite(seconds)) {
      throw new APIError('seconds must be a number', 400)
    }

    const doc = await req.payload.findByID({
      collection: 'media',
      id,
      depth: 0,
      overrideAccess: true,
      req,
    })

    // Ownership, checked the same way `transcodeMedia.ts` checks it: a member
    // may only re-cover their own file, and an admin may do it anywhere.
    const ownerId = typeof doc.owner === 'object' ? doc.owner?.id : doc.owner
    if (!isAdminUser(req.user) && ownerId !== req.user.id) {
      throw new APIError('Forbidden', 403)
    }

    if (!(doc.mimeType ?? '').startsWith('video/')) {
      throw new APIError('Only a video has a poster frame.', 400)
    }

    const dispatched = await startPosterCapture(doc, seconds)
    if (!dispatched.ok) {
      // 503, not 500: nothing is wrong with the request or the row. The
      // transcoder is unreachable or unconfigured, which is a temporary
      // property of the environment and something the member can act on by
      // trying later. `bad-source` is the exception and stays a 400.
      if (dispatched.reason === 'bad-source') {
        throw new APIError('This file has no source the transcoder can read.', 400)
      }
      throw new APIError('The transcoder is not available right now.', 503)
    }

    // Accepted, not done. The container takes the frame and patches the row
    // through `/poster-result`; the client re-reads the document to see it,
    // exactly as it does for `transcodeStatus`.
    return Response.json({ accepted: true, seconds })
  },
}
