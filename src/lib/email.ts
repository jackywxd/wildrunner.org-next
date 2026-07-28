import type { EmailAdapter } from 'payload'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

/**
 * Whether outbound email can actually be delivered.
 *
 * Callers use this to decide between sending an invite and handing the
 * admin a link to pass along themselves — the invite flow stays usable
 * before Resend's domain verification is done.
 */
export const isEmailConfigured = (): boolean => Boolean(process.env.RESEND_API_KEY)

const fromAddress = () => process.env.RESEND_FROM_ADDRESS || 'noreply@wildrunner.org'
const fromName = () => process.env.RESEND_FROM_NAME || '野馬營'

type ResendResponse = { id?: string; message?: string }

/**
 * Minimal Resend adapter. Workers cannot open SMTP connections, so the
 * nodemailer adapter Payload ships with is not an option — this posts to
 * Resend's HTTP API instead.
 */
export const resendAdapter: EmailAdapter<ResendResponse> = () => ({
  name: 'resend',
  defaultFromAddress: fromAddress(),
  defaultFromName: fromName(),
  sendEmail: async (message) => {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not set')
    }

    type Recipient = string | { address?: string } | undefined
    const to: Recipient[] = Array.isArray(message.to) ? message.to : [message.to]

    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: message.from ?? `${fromName()} <${fromAddress()}>`,
        to: to.map((entry) => (typeof entry === 'string' ? entry : entry?.address)),
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    })

    const body = (await response.json().catch(() => ({}))) as ResendResponse

    if (!response.ok) {
      throw new Error(
        `Resend rejected the message (${response.status}): ${body.message ?? 'unknown error'}`,
      )
    }

    return body
  },
})
