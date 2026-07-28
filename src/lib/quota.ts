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
 * Sum of `media.filesize` owned by a user.
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
    select: { filesize: true },
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req,
  })

  return result.docs.reduce(
    (total, doc) => total + (typeof doc.filesize === 'number' ? doc.filesize : 0),
    0,
  )
}
