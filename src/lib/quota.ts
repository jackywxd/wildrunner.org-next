import type { Payload, PayloadRequest } from 'payload'

/**
 * 100 GB per member. THE ONLY PLACE THIS NUMBER LIVES.
 *
 * Ten times what it was, and raised alongside video in the article editor
 * rather than for its own sake. The arithmetic that decided it: production's
 * 27 videos average 410.3 MB, and a transcoded video occupies R2 **twice** —
 * `sumStoredBytes` below counts `filesize` and `originalFilesize` together
 * because the pre-transcode original is kept forever by design. So a member
 * who writes with video spends roughly a gigabyte an article, and the old
 * 10 GB was about ten of them before the library had to be pruned.
 *
 * WHY THERE IS NO LONGER AN ENVIRONMENT VARIABLE. `defaultQuotaMb()` used to
 * read `MEMBER_STORAGE_QUOTA_MB` and fall back to this constant — so this
 * constant was the branch taken when nobody else had spoken, and in every
 * deployed environment somebody had. `wrangler.jsonc` set the variable to
 * "10240" in production *and* staging, `src/collections/Users.ts` printed a
 * hardcoded '10240' beside it, and the dotenv materialised from
 * `secrets.PRODUCTION_DOTENV` set it a third time and got inlined at build.
 * Raising this line to 100 GB therefore changed nothing anybody could see:
 * the storage bar went on reading "10.00 GB", which is exactly what a working
 * storage bar looks like. It was found by a person looking at the page.
 *
 * Four writers and one reader is not a configuration, it is four chances to
 * disagree silently. So the value is code now: one constant, changed in one
 * place, reviewable in a diff. What is lost is retuning the quota without a
 * deploy — which was never really available anyway, since two of those four
 * writers were checked-in files that need a deploy to take effect.
 *
 * Still a number and not "unlimited", deliberately: the quota is what stops
 * one account from filling the bucket. `users.storageQuotaMb` remains the
 * per-account exception, and it is a real one — an admin sets it on the
 * account it is meant for, where it is visible.
 */
export const DEFAULT_QUOTA_MB = 100 * 1024

export function defaultQuotaMb(): number {
  return DEFAULT_QUOTA_MB
}

export function quotaBytesFor(user: { storageQuotaMb?: number | null }): number {
  const override = user.storageQuotaMb
  const mb = typeof override === 'number' && override > 0 ? override : defaultQuotaMb()
  return mb * 1024 * 1024
}

/**
 * Sum of what a user's media actually occupies in R2.
 *
 * Deliberately not a running counter: a counter drifts (a failed delete, a
 * migration, a hand-edited row) and the drift is silent — nobody notices
 * until the quota math stops making sense. Recomputing from the source of
 * truth costs one query per upload, and uploads are infrequent enough that
 * the cost doesn't matter.
 *
 * Uses the Local API with `select` rather than a raw SUM query: it stays
 * on Payload's documented surface instead of reaching into the D1/drizzle
 * adapter's internals, at the cost of summing in JS. Fine at hundreds of
 * files per user; would need revisiting well before tens of thousands.
 */
export async function usedBytesFor(
  payload: Payload,
  userId: number,
  req?: PayloadRequest,
): Promise<number> {
  const result = await payload.find({
    collection: 'media',
    where: { owner: { equals: userId } },
    select: { filesize: true, originalFilesize: true },
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req,
  })

  return sumStoredBytes(result.docs)
}

/**
 * What a set of media rows occupies in R2.
 *
 * Both sizes, because a transcoded video is two objects in the bucket.
 * `filesize` holds the transcoded file once a video converts, and the
 * original is kept forever by design (see `originalUrl` on Media). Summing
 * only `filesize` meant the quota FELL after a transcode while real usage
 * rose — a member could reach the ceiling, wait for their videos to convert,
 * and upload to it again, with nothing bounding what R2 actually held.
 *
 * Separated from the query so the arithmetic can be tested without a
 * database. It is the half that fails silently: a wrong total still looks
 * like a perfectly ordinary number on the storage bar.
 */
export function sumStoredBytes(
  docs: { filesize?: number | null; originalFilesize?: number | null }[],
): number {
  return docs.reduce((total, doc) => {
    const served = typeof doc.filesize === 'number' ? doc.filesize : 0
    const kept = typeof doc.originalFilesize === 'number' ? doc.originalFilesize : 0
    return total + served + kept
  }, 0)
}
