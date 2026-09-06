import type { Endpoint, PayloadRequest } from 'payload'
import { APIError } from 'payload'
import { getCloudflareContext } from '@opennextjs/cloudflare'

import { isAdminUser } from '@/access'
import { getR2Bucket } from '@/lib/r2-bucket'
import { articleAudioKey, articleScript } from '@/lib/reader/article-audio'
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
     * WHAT COUNTS AS "ALREADY NARRATED" IS THE UNREWRITTEN SCRIPT'S KEY, and
     * that is a deliberate approximation. The real key is the hash of the
     * *rewritten* script, which is only knowable after paying for the rewrite
     * — so a survey that wanted to be exact would cost the thing it is meant
     * to let you decide about.
     *
     * The consequence is stated rather than hidden: an article narrated from a
     * rewritten script is listed as missing here, and `narrateArticle` then
     * rewrites it, computes the real key and answers `skipped` without calling
     * the voice. So the dry run over-reports work by one rewrite pass per already
     * narrated article, and `apply=true` never re-pays MiniMax for one. The
     * count of MP3s is right; the count of rewrites is a ceiling.
     */
    const pending: Candidate[] = []
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
        if (await bucket.head(articleAudioKey(post.id, script))) continue
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
