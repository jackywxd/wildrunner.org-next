import type { CollectionAfterChangeHook } from 'payload'

import { ensureAuthorForUser } from '../../lib/author-alias'

/**
 * Give every new account an author record to publish under.
 *
 * Create-only: ownership of a byline never moves implicitly, and the guard
 * also stops the `users` update inside `ensureAuthorForUser` from
 * re-entering this hook.
 */
export const ensureAuthorIdentity: CollectionAfterChangeHook = async ({
  doc,
  operation,
  req,
}) => {
  if (operation !== 'create') return doc

  try {
    const authorId = await ensureAuthorForUser({
      payload: req.payload,
      req,
      user: doc,
    })
    return { ...doc, author: authorId }
  } catch (error) {
    // An account without a byline is recoverable (an admin can set one);
    // failing the invite that created it is not.
    req.payload.logger.error({ err: error }, 'Failed to create author for user')
    return doc
  }
}
