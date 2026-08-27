import type { Payload, PayloadRequest } from 'payload'

const DEFAULT_QUOTA_MB = 10 * 1024

export function defaultQuotaMb(): number {
  const configured = Number(process.env.MEMBER_STORAGE_QUOTA_MB)
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_QUOTA_MB
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
