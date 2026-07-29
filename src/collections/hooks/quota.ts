import type { CollectionBeforeOperationHook } from 'payload'
import { APIError } from 'payload'

import { isAdminUser } from '../../access'
import { usedBytesFor, quotaBytesFor } from '../../lib/quota'

const formatMb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1)

/**
 * Reject an upload that would push a member over their storage quota.
 *
 * `beforeOperation` runs before Payload's own upload handling — by the time
 * a `beforeChange` hook would see this document, the file is already
 * written to R2. Rejecting here means a denied upload leaves nothing
 * behind to clean up.
 *
 * That last part only holds for the built-in path. A file uploaded straight
 * to R2 is already stored by the time the document is created, so a
 * rejection here leaves the object behind as an orphan. The admin component
 * checks the quota before it starts uploading so this is rare, but the check
 * here is the authoritative one and cannot move earlier — the size is only
 * trustworthy once it has been read back off R2. Orphans are swept by
 * `scripts/find-orphan-media.ts`.
 */
export const enforceStorageQuota: CollectionBeforeOperationHook = async ({
  args,
  operation,
  req,
}) => {
  if (operation !== 'create') return args
  if (!req.user || isAdminUser(req.user)) return args

  // A file-bearing upload reports its own size; a document created for a
  // file uploaded straight to R2 has none, and carries the size in `data`.
  // That number is trustworthy because `verifyDirectUpload` runs first in
  // this same beforeOperation chain and overwrites it with R2's own
  // `head().size` — reading it before that hook ran would let a member
  // declare any size they liked and store past their allowance.
  const data = args.data as { filesize?: unknown } | undefined
  const size =
    req.file?.size ?? (typeof data?.filesize === 'number' ? data.filesize : undefined)
  if (size === undefined) return args

  const [used, quota] = await Promise.all([
    usedBytesFor(req.payload, req.user.id, req),
    Promise.resolve(quotaBytesFor(req.user)),
  ])

  if (used + size > quota) {
    throw new APIError(
      `Storage quota exceeded: ${formatMb(used)} MB used of ${formatMb(quota)} MB. This file is ${formatMb(size)} MB.`,
      413,
    )
  }

  return args
}
