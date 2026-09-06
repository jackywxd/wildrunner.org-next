import type { Endpoint, PayloadRequest } from 'payload'
import { APIError } from 'payload'
import { getCloudflareContext } from '@opennextjs/cloudflare'

import { isAdminUser } from '@/access'
import { getR2Bucket } from '@/lib/r2-bucket'
import {
  articleAudioKeyForPost,
  articleScript,
  orphanAudioKeys,
} from '@/lib/reader/article-audio'
import { narrateArticle } from '@/lib/reader/narrate'

/**
 * Narrate every published article that has not been narrated yet.
 *
 * DRY RUN UNLESS `?apply=true`, and the default is copied from
 * `unusedMediaSweep` for a related reason. That one defaults to reporting
 * because it *destroys*; this one defaults to reporting because it *spends* —
 * every article costs a MiniMax call plus a rewrite call per ten lines, and the
 * report is what makes that number visible before it is spent rather than
 * afterwards on a bill.
 *
 * The report deliberately gives characters and not dollars. MiniMax is priced
 * per thousand characters ($0.10 per 1k for `speech-2.8-hd` at the time of
 * writing), and a rate hardcoded here would be a second place for that number
 * to live — which is exactly how `MEMBER_STORAGE_QUOTA_MB` came to disagree
 * with itself in four files. Characters are the thing this can actually
 * measure; the rate belongs wherever it is looked up.
 *
 * TRIGGERED THE SAME WAY THE OTHER SWEEPS ARE — an admin session for looking,
 * a maintenance secret for a scheduled run — because a Cloudflare Cron Trigger
 * needs a `scheduled` handler exported from the Worker and OpenNext generates
 * that entrypoint.
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

/**
 * How many articles one run may narrate.
 *
 * THE LIMIT IS THE REQUEST, not the rate limit or the money, and the first
 * version had this wrong in a way that only production showed. It was five,
 * chosen from Kimi's requests-per-minute — and with Kimi taking 106-178
 * seconds per ten lines, five articles was over an hour inside one HTTP
 * request. `apply=true` on production returned nothing at all and wrote
 * nothing at all, while the dry run answered in three seconds.
 *
 * With the rewrite on Mistral and its chunks issued in parallel
 * (`spoken-script.ts`), an article measures about ten seconds of rewriting
 * plus six and a half of MiniMax — call it twenty. Three is a minute, which
 * sits under Cloudflare's ~100s edge timeout with room for an article longer
 * than any in the corpus.
 *
 * Articles are narrated in turn rather than together on purpose: the chunks
 * inside one article already run concurrently, and three articles at once
 * would be forty-odd simultaneous model calls for no gain the clock can see.
 *
 * A backlog drains over consecutive runs — `remaining` in the response says
 * how many are left, so a caller can simply call again.
 */
const MAX_PER_RUN = 3

/** How many posts to read per page. Bodies are large — see `references.ts`. */
const PAGE_SIZE = 50

type Candidate = { id: number | string; title: string; chars: number }

export const articleAudioSweepEndpoint: Endpoint = {
  path: '/article-audio-sweep',
  method: 'post',
  handler: async (req) => {
    authorise(req)

    const apply = req.searchParams.get('apply') === 'true'
    const bucket = await getR2Bucket()

    /**
     * THE SURVEY IS NOW EXACT, and it was not always. The key used to be
     * hashed from the rewritten script, so this scan could only approximate it
     * — and the same mismatch meant the article page could never find the
     * audio either. `articleAudioKeyForPost` is the single answer now, so what
     * this reports missing is exactly what `apply=true` will generate.
     */
    const pending: Candidate[] = []
    const wanted = new Set<string>()
    let scanned = 0
    let page = 1
    for (;;) {
      const result = await req.payload.find({
        collection: 'posts',
        where: { _status: { equals: 'published' } },
        select: { title: true, content: true },
        depth: 0,
        limit: PAGE_SIZE,
        page,
        overrideAccess: true,
        req,
      })

      for (const post of result.docs) {
        scanned += 1
        const script = articleScript(post.title ?? '', post.content)
        if (!script.trim()) continue
        const key = articleAudioKeyForPost(post)
        // Every published post's key, not only the missing ones: this set is
        // what `orphanReport` measures the bucket against below.
        wanted.add(key)
        if (await bucket.head(key)) continue
        pending.push({ id: post.id, title: post.title ?? '', chars: script.length })
      }

      if (!result.hasNextPage) break
      page += 1
    }

    const chars = pending.reduce((total, item) => total + item.chars, 0)
    if (!apply) {
      return Response.json({
        applied: false,
        scanned,
        pending: pending.length,
        chars,
        wouldNarrate: pending.slice(0, MAX_PER_RUN).map((item) => item.id),
        maxPerRun: MAX_PER_RUN,
        ...(await orphanReport(bucket, wanted)),
      })
    }

    const { env } = await getCloudflareContext({ async: true })
    const ai = (env as unknown as { AI?: Ai }).AI
    if (!ai) {
      throw new APIError('The AI binding is not available here.', 503)
    }

    const narrated: unknown[] = []
    const failed: { id: number | string; reason: string }[] = []
    for (const candidate of pending.slice(0, MAX_PER_RUN)) {
      const post = await req.payload.findByID({
        collection: 'posts',
        id: candidate.id,
        depth: 0,
        overrideAccess: true,
        req,
      })
      try {
        narrated.push({ id: candidate.id, ...(await narrateArticle(ai, bucket, post)) })
      } catch (error) {
        // One article's failure must not end the run: the next one may be
        // fine, and a sweep that stops at the first bad row is a sweep that
        // never reaches the rest of the backlog. Reported per article so the
        // reason travels with the id.
        failed.push({
          id: candidate.id,
          reason: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return Response.json({
      applied: true,
      scanned,
      pending: pending.length,
      narrated,
      failed,
      remaining: Math.max(0, pending.length - MAX_PER_RUN),
    })
  },
}

/**
 * What is under `article-audio/` that no published article asks for.
 *
 * REPORTED, NEVER DELETED, and the default is the one `unusedMediaSweep`
 * argues for at length: this destroys nothing, so anyone who reaches the URL
 * to find out what is there gets an answer rather than a consequence.
 *
 * WHY THE PREFIX NEEDS ITS OWN ACCOUNTING. `unusedMediaSweep` walks `media`
 * rows and reclaims objects nothing references — and narration has no row at
 * all, which is the whole point of `articleAudioKeyForPost`. That is why this
 * prefix was kept away from that job, and the cost of the separation is that
 * nothing was reclaiming it either. Three orphans appeared within a day of the
 * feature shipping, from one key-shaped mistake. An edited article, a changed
 * voice or a changed prompt each leave another.
 *
 * A `.txt` IS NOT ITS OWN OBJECT HERE. The script is stored as `<key>.txt`
 * beside the audio, so it is judged by the key it belongs to — otherwise every
 * healthy narration would report a companion orphan.
 *
 * AN UNPUBLISHED ARTICLE'S NARRATION IS LISTED, and that is honest rather than
 * ideal: the scan above sees published posts only, so a draft that once had
 * audio shows up here. Nothing serves that audio while the post is a draft,
 * and republishing regenerates under the same key — so the entry is a fact
 * about now, not a recommendation to delete.
 */
async function orphanReport(
  bucket: R2Bucket,
  wanted: Set<string>,
): Promise<{ orphans: string[]; orphanBytes: number }> {
  const sizes = new Map<string, number>()
  let cursor: string | undefined

  do {
    const listed = await bucket.list({ prefix: 'article-audio/', cursor })
    for (const object of listed.objects) sizes.set(object.key, object.size)
    cursor = listed.truncated ? listed.cursor : undefined
  } while (cursor)

  const orphans = orphanAudioKeys([...sizes.keys()], wanted)
  return {
    orphans,
    orphanBytes: orphans.reduce((total, key) => total + (sizes.get(key) ?? 0), 0),
  }
}
