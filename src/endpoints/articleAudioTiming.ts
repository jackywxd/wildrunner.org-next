import type { Endpoint } from 'payload'

import { getR2Bucket } from '@/lib/r2-bucket'
import { timingResponseParts } from '@/lib/reader/narration-timing'

/**
 * Where each line of a narration starts, for the page's follow-along.
 *
 * SAME-ORIGIN BECAUSE R2'S PUBLIC HOST SENDS NO CORS HEADERS — see
 * `articleAudioDownload.ts` for the measurement. The table is a few numbers per
 * line beside the MP3, so it is read from the bucket and handed back; it never
 * touches the database, and everything that decides what may be returned (the
 * key must be this post's, the table must describe the MP3 now in the bucket,
 * the status) lives in `narration-timing.ts` where it is unit-tested. This is
 * the wrapper only.
 *
 * It sets no `Cache-Control`: the `/api/:path*` rule in `next.config.ts` overrides
 * whatever a handler sets (production serves the download endpoint's
 * `immutable` as `private, no-store`), so a header here would be dead code.
 */
export const articleAudioTimingEndpoint: Endpoint = {
  path: '/article-audio/:id/timing',
  method: 'get',
  handler: async (req) => {
    const id = req.routeParams?.id
    const parts = await timingResponseParts(
      await getR2Bucket(),
      typeof id === 'string' || typeof id === 'number' ? id : '',
      req.searchParams.get('key'),
    )
    return new Response(parts.body, { status: parts.status, headers: parts.headers })
  },
}
