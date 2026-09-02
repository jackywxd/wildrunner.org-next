import type { Endpoint } from 'payload'
import { APIError } from 'payload'

import { publicMediaUrl } from '@/lib/media-url'
import { posterKey, versionedPosterUrl } from '@/lib/media/transcode-state'

/**
 * Where the container reports the frame a member picked.
 *
 * Authenticated by the same shared secret as `/transcode-result`, and for the
 * same reason: the caller is a container, which has no user and no cookie. An
 * unset `TRANSCODE_SECRET` refuses everything rather than defaulting to open.
 *
 * WHY THIS IS NOT `/transcode-result`. That endpoint requires a transcode
 * status and writes it, and there is no value of `transcodeStatus` that means
 * "somebody only chose a picture". Routing a poster request through it would
 * report `skipped` — the container encoded nothing, because it was never
 * asked to — and relabel a genuinely transcoded video as one that never
 * needed transcoding. `scripts/backfill-video-posters.ts` already refuses to
 * re-queue `done` rows to avoid exactly that, and this endpoint is what makes
 * the refusal unnecessary rather than merely careful.
 *
 * So this writes `posterUrl` and nothing else. `transcodeStatus`, `filename`,
 * `url`, `filesize` are all untouched, whatever the video's state.
 */
export const posterResultEndpoint: Endpoint = {
  path: '/members/media/:id/poster-result',
  method: 'post',
  handler: async (req) => {
    const expected = process.env.TRANSCODE_SECRET
    const provided = req.headers.get('x-transcode-secret')
    if (!expected || provided !== expected) {
      throw new APIError('Unauthorized', 401)
    }

    const id = req.routeParams?.id
    if (typeof id !== 'string' && typeof id !== 'number') {
      throw new APIError('An id is required.', 400)
    }

    const body = (await req.json?.()) as
      | { message?: string; ok?: boolean; posterKey?: string; seconds?: number }
      | undefined

    if (!body?.ok) {
      // A failure is logged and acknowledged, not written. There is no
      // `posterStatus` column and adding one would be inventing state for a
      // button the member can simply press again — the recovery story here is
      // the member, not a sweep. Answering 200 matters: a non-2xx makes the
      // container treat the report as undelivered and throw, which buys
      // nothing when there is no lease to reclaim.
      req.payload.logger.warn(
        `poster capture failed for media ${id}: ${body?.message ?? 'no reason given'}`,
      )
      return Response.json({ ok: true, recorded: false })
    }

    // Checked against what this id is allowed to occupy, exactly as
    // `transcodeResult` checks `body.key`: the value lands in a URL the site
    // will serve, so an arbitrary one repoints the poster at an arbitrary
    // object.
    const expectedKey = posterKey(id)
    if (body.posterKey !== expectedKey) {
      req.payload.logger.warn(
        `ignoring poster for media ${id}: key was ${body.posterKey}, expected ${expectedKey}`,
      )
      throw new APIError(`posterKey must be ${expectedKey}`, 400)
    }

    // Versioned, because the key never changes. Without it the member picks a
    // new frame, the object is overwritten, and both the browser and the edge
    // go on serving the old one — which for this feature is indistinguishable
    // from it not working. See `versionedPosterUrl`.
    await req.payload.update({
      collection: 'media',
      id,
      data: { posterUrl: versionedPosterUrl(publicMediaUrl(expectedKey), Date.now()) },
      overrideAccess: true,
      req,
    })

    return Response.json({ ok: true, recorded: true })
  },
}
