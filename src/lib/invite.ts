/** Invite links stay valid for a week — long enough to survive a weekend. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Throwaway password for an invited account.
 *
 * The invitee never learns it: they set their own via the reset-password
 * token. It only has to be unguessable so the account is not usable in the
 * window before that happens.
 */
export function generatePlaceholderPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Where both emailed password links land: the invitation, and an ordinary
 * reset. `Users.auth.forgotPassword.generateEmailHTML` branches on
 * `invitePending` to choose the wording, but calls this for the URL either
 * way, so one destination has to serve both — which is why the page it points
 * at says 設定密碼 rather than 重設密碼.
 *
 * IT USED TO POINT AT `/admin/reset/<token>`. That is Payload's own screen,
 * inside the admin app: English chrome, and a `users` collection that is
 * `hidden` for everyone who is not an admin. So the one moment a new member
 * met this site was a tour of software built for somebody else's job.
 *
 * `/admin/reset/<token>` IS NOT REMOVED, and could not safely be — it is
 * Payload's route, not ours, and invitation tokens live for a week
 * (`INVITE_TTL_MS`), so links already sitting in inboxes when this shipped
 * still point there and still have to work.
 */
export function inviteLinkFor(serverURL: string, token: string): string {
  return `${serverURL.replace(/\/$/, '')}/members/reset/${token}`
}

export function inviteEmailHTML(link: string, invitedByEmail?: string): string {
  const from = invitedByEmail ? `（邀請人：${invitedByEmail}）` : ''
  return `
    <p>你被邀請成為「野馬營」的作者${from}。</p>
    <p>點擊下方連結設定密碼，之後就能登入後台發表文章與相簿：</p>
    <p><a href="${link}">${link}</a></p>
    <p>這個連結 7 天內有效，只能使用一次。如果你沒有預期收到這封信，忽略即可。</p>
  `
}
