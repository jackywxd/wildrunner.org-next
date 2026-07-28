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
 */
export const enforceStorageQuota: CollectionBeforeOperationHook = async ({
  args,
  operation,
  req,
}) => {
  if (operation !== 'create') return args
  if (!req.user || isAdminUser(req.user)) return args

  const file = req.file
  if (!file) return args

  const [used, quota] = await Promise.all([
    usedBytesFor(req.payload, req.user.id, req),
    Promise.resolve(quotaBytesFor(req.user)),
  ])

  if (used + file.size > quota) {
    throw new APIError(
      `Storage quota exceeded: ${formatMb(used)} MB used of ${formatMb(quota)} MB. This file is ${formatMb(file.size)} MB.`,
      413,
    )
  }

  return args
}
