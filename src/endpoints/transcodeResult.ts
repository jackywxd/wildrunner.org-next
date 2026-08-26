import type { Endpoint } from 'payload'
import { APIError } from 'payload'

import { publicMediaUrl } from '@/lib/media-url'

/**
 * Where the transcoder reports back.
 *
 * Authenticated by a shared secret, not by a session: the caller is a
 * container, which has no user and no cookie. The secret is the only thing
 * standing between this and an unauthenticated write that repoints any
 * media row at an arbitrary URL, so a missing or mismatched secret is a
 * flat 401 — and an unset `TRANSCODE_SECRET` refuses everything rather than
 * defaulting to open.
 *
 * NOT /media/:id/... — Payload's router scopes any path whose first segment
 * matches a collection slug to that collection's own `endpoints`, answering
 * 404 for a global registration. Same reason every other custom endpoint
 * here lives under /members/.
 */
export const transcodeResultEndpoint: Endpoint = {
  path: '/members/media/:id/transcode-result',
  method: 'post',
  handler: async (req) => {
    const expected = process.env.TRANSCODE_SECRET
    const provided = req.headers.get('x-transcode-secret')

    // An unset secret must fail closed. Treating "no secret configured" as
    // "no check needed" would leave this endpoint open on any environment
    // where the variable was forgotten.
    if (!expected || provided !== expected) {
      throw new APIError('Unauthorized', 401)
    }

    const id = req.routeParams?.id
    if (typeof id !== 'string' && typeof id !== 'number') {
      throw new APIError('An id is required.', 400)
    }

    const body = (await req.json?.()) as
      | {
          bytes?: number
          height?: number
          key?: string
          message?: string
          status?: string
          width?: number
        }
      | undefined

    const status = body?.status
    if (status !== 'running' && status !== 'done' && status !== 'failed') {
      throw new APIError('status must be running, done or failed', 400)
    }

    // `running` is the lease being taken out, and it carries no results.
    // Touching the row is the point: `updatedAt` moves, which is what the
    // sweep measures staleness against.
    if (status !== 'done') {
      await req.payload.update({
        collection: 'media',
        id,
        data: { transcodeStatus: status },
        overrideAccess: true,
        req,
      })
      return Response.json({ ok: true, status })
    }

    if (!body?.key) {
      throw new APIError('key is required when status is done', 400)
    }

    const existing = await req.payload.findByID({
      collection: 'media',
      id,
      depth: 0,
      overrideAccess: true,
      req,
    })

    await req.payload.update({
      collection: 'media',
      id,
      data: {
        filename: body.key,
        // Recorded once and never overwritten: a second successful run must
        // not replace the true original with the previous transcode.
        originalUrl: existing.originalUrl ?? existing.url,
        transcodeStatus: 'done',
        url: publicMediaUrl(body.key),
        ...(typeof body.bytes === 'number' ? { filesize: body.bytes } : {}),
        ...(typeof body.height === 'number' ? { height: body.height } : {}),
        ...(typeof body.width === 'number' ? { width: body.width } : {}),
      },
      overrideAccess: true,
      req,
    })

    return Response.json({ ok: true, status: 'done' })
  },
}
