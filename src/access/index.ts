import type { Access, FieldAccess } from 'payload'

import type { User } from '@/payload-types'

/**
 * Shared access-control helpers.
 *
 * Payload enforces access at three independent layers — collection,
 * field, and global. A rule missing from any one of them is a hole, so
 * every restriction below has a matching negative test in
 * `e2e/members/roles.spec.ts`.
 */

export const isAdminUser = (user: unknown): boolean =>
  Boolean(user && (user as User).role === 'admin')

export const isAdmin: Access = ({ req: { user } }) => isAdminUser(user)

export const isAdminFieldLevel: FieldAccess = ({ req: { user } }) => isAdminUser(user)

export const isAuthenticated: Access = ({ req: { user } }) => Boolean(user)

/**
 * Admins reach every document; everyone else is constrained to their own.
 * Returning a query (rather than false) keeps list views working — the
 * member simply sees a single row.
 */
export const isAdminOrSelf: Access = ({ req: { user } }) => {
  if (!user) return false
  if (isAdminUser(user)) return true

  return {
    id: {
      equals: user.id,
    },
  }
}

/**
 * Read rule for draft-enabled content: the public sees published documents,
 * a member additionally sees everything they own (including their drafts),
 * and other members' drafts stay hidden.
 */
export const ownedOrPublished: Access = ({ req: { user } }) => {
  if (isAdminUser(user)) return true

  const published = { _status: { equals: 'published' } }
  if (!user) return published

  return {
    or: [{ owner: { equals: user.id } }, published],
  }
}

/** Write rule: admins anywhere, members only on documents they own. */
export const isOwner: Access = ({ req: { user } }) => {
  if (!user) return false
  if (isAdminUser(user)) return true

  return {
    owner: {
      equals: user.id,
    },
  }
}
