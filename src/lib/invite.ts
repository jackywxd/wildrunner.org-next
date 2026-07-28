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

export function inviteLinkFor(serverURL: string, token: string): string {
  return `${serverURL.replace(/\/$/, '')}/admin/reset/${token}`
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
