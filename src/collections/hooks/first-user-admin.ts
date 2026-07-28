import type { CollectionBeforeChangeHook } from 'payload'

/**
 * Force the very first user to be an admin.
 *
 * The `role` field is admin-only at the field level, so an unauthenticated
 * bootstrap create would have its role stripped and fall back to the
 * `member` default — locking everyone out of an empty install.
 */
export const ensureFirstUserIsAdmin: CollectionBeforeChangeHook = async ({
  data,
  operation,
  req,
}) => {
  if (operation !== 'create') return data

  const existing = await req.payload.find({
    collection: 'users',
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  if (existing.totalDocs === 0) {
    return { ...data, role: 'admin' }
  }

  return data
}
