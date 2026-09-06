import type { Endpoint, PayloadRequest } from 'payload'
import { APIError } from 'payload'
import { getCloudflareContext } from '@opennextjs/cloudflare'

import { isAdminUser } from '@/access'
import { speakArticle } from '@/lib/ai/speak'
import { spokenScript } from '@/lib/ai/spoken-script'
import { getR2Bucket } from '@/lib/r2-bucket'
import { articleAudioKey, articleScript } from '@/lib/reader/article-audio'

/**
 * Narrate one article and put the result where the page can find it.
 *
 * NOT /posts/:id/... — Payload's router scopes any path whose first segment
 * matches a collection slug to that collection's own `endpoints`, answering
 * 404 for a global registration. Every custom endpoint here avoids it the
 * same way.
 *
 * THERE IS NO ENDPOINT THAT *SERVES* THE AUDIO, and that is deliberate. R2 is
 * already published at `R2_PUBLIC_URL` for every image and video on the site,
 * so the object at `article-audio/<id>-<hash>.mp3` is reachable the moment it
 * is written — `publicMediaUrl` builds the same URL shape the page already
 * uses for media. A serving endpoint would be a second copy of that with a
 * Worker invocation attached to every play.
 *
 * ADMIN OR THE MAINTENANCE SECRET, not the post's owner. Unlike a transcode,
 * which a member starts by uploading their own file, every call here spends
 * MiniMax credits on the account — so this is shaped like the sweeps
 * (`transcodeSweep`, `unusedMediaSweep`) rather than like `transcodeMedia`.
 *
 * IDEMPOTENT BY DEFAULT. The key contains a hash of the script, so an article
 * whose narration already exists is answered `skipped` without calling
 * anything. `?force=true` regenerates the same key — which is what to reach
 * for after changing the voice or the rewrite prompt, since neither of those
 * changes the article and therefore neither changes the key.
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

export const articleAudioEndpoint: Endpoint = {
  path: '/article-audio/:id',
  method: 'post',
  handler: async (req) => {
    authorise(req)

    const id = req.routeParams?.id
    if (typeof id !== 'string' && typeof id !== 'number') {
      throw new APIError('An id is required.', 400)
    }

    const post = await req.payload.findByID({
      collection: 'posts',
      id,
      // depth 0 for the reason the member editor uses it: at depth >= 1
      // Payload's upload feature replaces every `value` in `content` with the
      // whole Media document, and `articleSegments` would then walk a tree
      // that is mostly media metadata. It reads text nodes, so the difference
      // is silent — the script would simply be missing its images' captions'
      // worth of nothing, and cost a great deal more memory to build.
      depth: 0,
      overrideAccess: true,
      req,
    })

    const script = articleScript(post.title ?? '', post.content)
    if (!script.trim()) {
      throw new APIError('This article has nothing to say.', 400)
    }

    const { env } = await getCloudflareContext({ async: true })
    const ai = (env as unknown as { AI?: Ai }).AI
    if (!ai) {
      throw new APIError('The AI binding is not available here.', 503)
    }

    // The rewrite first, because its output is what gets both hashed and
    // spoken. Doing it the other way round would key the audio by text that
    // is not the text in it.
    const spoken = await spokenScript(ai, script)
    const key = articleAudioKey(post.id, spoken)

    const bucket = await getR2Bucket()
    const force = req.searchParams.get('force') === 'true'
    if (!force && (await bucket.head(key))) {
      return Response.json({ key, skipped: true, chars: spoken.length })
    }

    const audio = await speakArticle(ai, spoken)
    await bucket.put(key, audio, {
      httpMetadata: {
        contentType: 'audio/mpeg',
        // Immutable because the key changes whenever the words do — the hash
        // is in it. A reader who has the file has the right file forever.
        cacheControl: 'public, max-age=31536000, immutable',
      },
    })

    // The script beside the audio, under the same key, so a narration that
    // reads wrongly can be diagnosed by reading what was actually sent rather
    // than by regenerating and hoping. Two kilobytes against an MP3.
    await bucket.put(`${key}.txt`, spoken, {
      httpMetadata: { contentType: 'text/plain; charset=utf-8' },
    })

    return Response.json({
      key,
      bytes: audio.byteLength,
      chars: spoken.length,
      rewritten: spoken !== script,
    })
  },
}
