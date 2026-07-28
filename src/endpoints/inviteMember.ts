import type { Endpoint } from 'payload'
import { APIError } from 'payload'

import { isAdminUser } from '@/access'
import { isEmailConfigured } from '@/lib/email'
import {
  INVITE_TTL_MS,
  generatePlaceholderPassword,
  inviteEmailHTML,
  inviteLinkFor,
} from '@/lib/invite'

type InviteBody = {
  email?: string
  displayName?: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const inviteMemberEndpoint: Endpoint = {
  path: '/members/invite',
  method: 'post',
  handler: async (req) => {
    if (!req.user) {
      throw new APIError('Unauthorized', 401)
    }
    if (!isAdminUser(req.user)) {
      throw new APIError('Only admins can invite members', 403)
    }

    let body: InviteBody
    try {
      body = (await req.json?.()) as InviteBody
    } catch {
      throw new APIError('Invalid JSON body', 400)
    }

    const email = (body.email ?? '').trim().toLowerCase()
    const displayName = (body.displayName ?? '').trim()

    if (!EMAIL_PATTERN.test(email)) {
      throw new APIError('A valid email is required', 400)
    }

    const existing = await req.payload.find({
      collection: 'users',
      where: { email: { equals: email } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })

    if (existing.totalDocs > 0) {
      throw new APIError('That email already has an account', 409)
    }

    const user = await req.payload.create({
      collection: 'users',
      data: {
        email,
        password: generatePlaceholderPassword(),
        role: 'member',
        invitePending: true,
        invitedAt: new Date().toISOString(),
        invitedBy: req.user.id,
        displayName: displayName || undefined,
      },
      overrideAccess: true,
    })

    // Reuse Payload's own reset-password token rather than inventing a
    // second single-use-token mechanism. `expiration` is only honoured when
    // the collection does not define its own, which is why Users leaves
    // `auth.forgotPassword.expiration` unset.
    const token = await req.payload.forgotPassword({
      collection: 'users',
      data: { email },
      disableEmail: true,
      expiration: INVITE_TTL_MS,
      req,
    })

    const link = inviteLinkFor(req.payload.config.serverURL, token)

    let sent = false
    let emailError: string | undefined

    if (isEmailConfigured()) {
      try {
        await req.payload.sendEmail({
          to: email,
          subject: '邀請你成為野馬營作者',
          html: inviteEmailHTML(link, req.user.email),
        })
        sent = true
      } catch (error) {
        // Not fatal: the account and token exist, so fall back to handing
        // the link to the admin rather than stranding a half-made invite.
        emailError = error instanceof Error ? error.message : 'Unknown email error'
        req.payload.logger.error({ err: error }, 'Invite email failed to send')
      }
    }

    return Response.json(
      {
        userId: user.id,
        email,
        sent,
        emailError,
        // Only surfaced when the admin has to deliver it themselves.
        inviteLink: sent ? undefined : link,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
      },
      { status: 201 },
    )
  },
}
