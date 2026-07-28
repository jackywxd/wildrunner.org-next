import type { Access, FieldAccess, Where } from 'payload'

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
 * Read rule for draft-enabled content (posts, galleries).
 *
 * A member sees only their own work in the admin — not other members'
 * published content. The public site is unaffected: it queries through the
 * Local API, which defaults to `overrideAccess: true`, and enforces
 * visibility with an explicit `where: { _status: 'published' }` instead.
 * So a member's published post is still public; it just doesn't clutter
 * (or leak through) anyone else's admin list.
 */
export const ownedOnly: Access = ({ req: { user } }) => {
  if (isAdminUser(user)) return true

  // No session: the REST API is the only caller that lands here, and it
  // should still expose published content.
  if (!user) return { _status: { equals: 'published' } } as Where

  return { owner: { equals: user.id } } as Where
}

/**
 * Read rule for collections without a draft status (media, authors).
 *
 * Same shape as `ownedOnly` minus the published fallback — anonymous
 * readers keep full read access because these are the records the public
 * site resolves images and bylines from.
 */
export const ownedOnlyPublicRead: Access = ({ req: { user } }) => {
  if (isAdminUser(user)) return true
  if (!user) return true

  return { owner: { equals: user.id } }
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
