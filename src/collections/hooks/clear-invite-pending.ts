import type { CollectionAfterLoginHook } from 'payload'

/**
 * An invite is "accepted" once the person actually signs in.
 *
 * Watching the reset-password operation instead would be more literal, but
 * an admin can also hand out a password directly — a successful login is the
 * one signal that covers every route in. It also decides which wording the
 * forgot-password email uses, so leaving it set would make a later password
 * reset read as a fresh invitation.
 */
export const clearInvitePending: CollectionAfterLoginHook = async ({ req, user }) => {
  if (!user?.invitePending) return user

  try {
    await req.payload.update({
      collection: 'users',
      id: user.id,
      data: { invitePending: false },
      overrideAccess: true,
      req,
    })
  } catch (error) {
    // Bookkeeping only — never turn a valid sign-in into a failed one.
    req.payload.logger.error({ err: error }, 'Failed to clear invitePending')
    return user
  }

  return { ...user, invitePending: false }
}
