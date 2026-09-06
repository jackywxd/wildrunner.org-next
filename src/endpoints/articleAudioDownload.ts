import type { Endpoint } from 'payload'

import { getR2Bucket } from '@/lib/r2-bucket'
import { audioFilename, contentDisposition } from '@/lib/print/filename'
import { articleAudioKeyForPost } from '@/lib/reader/article-audio'

/**
 * The narration, as a file with a name.
 *
 * WHY THIS EXISTS WHEN THE AUDIO IS ALREADY PUBLIC. The player points straight
 * at R2 — `article-audio/…mp3` is served from `images.wildrunner.org` and the
 * page needs no Worker to play it. A *download* cannot work that way, and both
 * halves of the reason were measured against the real object rather than
 * assumed:
 *
 *   $ curl -sI https://images.wildrunner.org/article-audio/22-3fdcea01.mp3
 *   content-type: audio/mpeg
 *   cache-control: public, max-age=31536000, immutable
 *   accept-ranges: bytes
 *
 * No `content-disposition`, so a plain link plays the file instead of saving
 * it. And no `access-control-allow-origin`, so the other common trick —
 * `fetch()` the bytes and hand a Blob to `<a download>` — is refused by CORS
 * before it starts. `<a download>` on a cross-origin URL is ignored by every
 * browser regardless.
 *
 * So the one header that makes a download a download has to come from our own
 * origin, which means the bytes come back through here. It costs a Worker
 * invocation per download and nothing per play, which is the right way round:
 * most visitors who listen never save.
 *
 * PUBLISHED ONLY, checked explicitly rather than left to access rules. This
 * endpoint is deliberately open — it serves bytes that are already public — but
 * "already public" is a claim about the *published* article's narration, and a
 * draft's would not be.
 */
export const articleAudioDownloadEndpoint: Endpoint = {
  path: '/article-audio/:id/download',
  method: 'get',
  handler: async (req) => {
    const id = req.routeParams?.id
    if (typeof id !== 'string' && typeof id !== 'number') {
      return Response.json({ error: '找不到這篇文章。' }, { status: 404 })
    }

    let post
    try {
      post = await req.payload.findByID({
        collection: 'posts',
        id,
        depth: 0,
        overrideAccess: true,
        req,
      })
    } catch {
      return Response.json({ error: '找不到這篇文章。' }, { status: 404 })
    }

    if (post._status !== 'published') {
      return Response.json({ error: '這篇文章還沒有發布。' }, { status: 404 })
    }

    const bucket = await getR2Bucket()
    const object = await bucket.get(articleAudioKeyForPost(post))
    if (!object) {
      // Member-facing, because it is: an article can be edited between the
      // page rendering its player and somebody pressing save, and the edit
      // changes the key. Saying so is better than a bare 404 the button would
      // have to invent a sentence for.
      return Response.json(
        { error: '這篇文章的語音還沒有產生，或是文章剛剛被編輯過。' },
        { status: 404 },
      )
    }

    return new Response(object.body, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': contentDisposition(audioFilename(post.title ?? '')),
        // The same immutability the object itself carries: the key changes
        // whenever the words do, so a saved file is never the wrong one.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  },
}
