import type { Endpoint } from 'payload'
import { APIError } from 'payload'

/**
 * Change your own password, having proved you know the current one.
 *
 * WHY AN ENDPOINT AND NOT A PATCH. `PATCH /api/users/<id>` with a `password`
 * already works — `isAdminOrSelf` permits it and Payload hashes whatever it is
 * given. What it does *not* do is ask for the current password: Payload has no
 * such concept, and `grep -rn currentPassword node_modules/payload/dist`
 * returns nothing. So the straightforward implementation lets anyone holding a
 * live session change the password without knowing the old one.
 *
 * That matters more here than it would elsewhere. `Users.auth.tokenExpiration`
 * is 30 days and *absolute*, and the members area never calls
 * `/api/users/refresh-token` — the collection's own comment spells this out.
 * A session on a borrowed or forgotten laptop therefore stays valid for up to
 * a month, and without this check it would be enough to take the account.
 *
 * VERIFIED WITH `payload.login`, which is the documented surface.
 * `authenticateLocalStrategy({ doc, password })` would check the hash without
 * the round trip, but it is not exported from the package entry and
 * `package.json`'s `exports` map has no path that reaches it — and reaching
 * into vendor internals is exactly what the version-lock section of AGENTS.md
 * was written about.
 *
 * THE COST OF THAT CHOICE, stated because it is real: `login` calls
 * `addSessionToUser`, so each successful password change leaves one extra row
 * in `users.sessions`. One row per change is not worth a custom hash check to
 * avoid; if `sessions` ever needs pruning it will be for the e2e suite's
 * hundreds of logins, not for this.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: revoke the account's other sessions.
 * "Changing your password signs out your other devices" is the right
 * behaviour and it is a separate change — it needs somewhere to tell the
 * member it happened, and it must not sign out the very session doing the
 * changing.
 */
export const changePasswordEndpoint: Endpoint = {
  path: '/members/change-password',
  method: 'post',
  handler: async (req) => {
    const user = req.user
    if (!user) {
      throw new APIError('Unauthorized', 401)
    }

    const body = (await req.json?.()) as
      | { currentPassword?: unknown; newPassword?: unknown }
      | undefined
    const currentPassword = body?.currentPassword
    const newPassword = body?.newPassword

    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      throw new APIError('currentPassword and newPassword are required', 400)
    }
    // Payload itself enforces no minimum. Eight is the floor the login form
    // and the reset page also state, so the three agree.
    if (newPassword.length < 8) {
      throw new APIError('新密碼至少要 8 個字元', 400)
    }

    try {
      await req.payload.login({
        collection: 'users',
        data: { email: user.email, password: currentPassword },
      })
    } catch {
      // Deliberately not distinguishing "wrong password" from anything else
      // the login might have objected to: the member can only act on one of
      // those answers, and the others would be guesswork on their behalf.
      throw new APIError('目前的密碼不正確', 403)
    }

    await req.payload.update({
      collection: 'users',
      id: user.id,
      data: { password: newPassword },
      // The member is changing their own password, which `isAdminOrSelf`
      // already allows; overrideAccess stays false so that stays the rule
      // rather than being asserted twice in different places.
      overrideAccess: false,
      user,
      req,
    })

    return Response.json({ ok: true })
  },
}
