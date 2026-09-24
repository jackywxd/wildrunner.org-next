import type { CollectionAfterChangeHook } from 'payload'

import { resetPostViews } from '../../lib/posts/views'

/**
 * A new post starts at zero reads, even when its id has been used before.
 *
 * Create only: an update is the same article and keeps its count. The reason
 * a brand-new post could otherwise arrive with reads — SQLite reusing the id
 * of a deleted newest post — is in `resetPostViews`.
 *
 * `payload.db.drizzle` is the adapter's own connection, typed loosely by
 * Payload's generic `BaseDatabaseAdapter`; the D1 adapter always has it.
 */
export const resetPostViewsOnCreate: CollectionAfterChangeHook = async ({
  doc,
  operation,
  req,
}) => {
  if (operation !== 'create') return doc

  const { drizzle } = req.payload.db as unknown as {
    drizzle: Parameters<typeof resetPostViews>[0]
  }
  await resetPostViews(drizzle, doc.id as number)

  return doc
}
