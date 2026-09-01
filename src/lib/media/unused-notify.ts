/**
 * Tell a member their files are scheduled for deletion.
 *
 * This is the half of the two-stage sweep that makes it safe. The mark on
 * `media.unusedSince` is only a date in a column nobody looks at; the mail
 * is what turns it into a decision somebody can make. If this stops working,
 * the sweep quietly becomes an unannounced weekly delete — so a failure here
 * is logged loudly even though it is swallowed.
 *
 * ONE MAIL PER OWNER PER RUN, not one per file. A member who spent an
 * afternoon uploading a race album a year ago has dozens of files marked in
 * the same sweep, and dozens of separate mails would be indistinguishable
 * from a bug — the kind of thing that trains people to filter the sender,
 * which would defeat the notice entirely.
 *
 * NEVER THROWS, for the reason `transcode-notify.ts` gives: the caller is
 * partway through a sweep that has already written marks to the database,
 * and an unrelated mail failure must not abandon it. But unlike that one,
 * whether this succeeded is *returned and reported* — the sweep's response
 * counts the notices it could not send, because "marked but never told" is
 * the state that turns this feature into silent data loss.
 *
 * `isEmailConfigured()` is checked rather than assumed: staging's
 * `RESEND_API_KEY` is deliberately empty (AGENTS.md records why), so there
 * this has to be a quiet no-op rather than an error.
 */
import type { Payload, PayloadRequest } from 'payload'

import { isEmailConfigured } from '@/lib/email'
import { mediaDisplayName } from '@/lib/media-name'

/**
 * `skipped` is not a failure: no mail configured, or an owner with no
 * address. `failed` is — somebody's files are marked with nobody told.
 */
export type NotifyOutcome = 'failed' | 'sent' | 'skipped'

export type MarkedFile = {
  filename?: string | null
  id: number
  title?: string | null
  url?: string | null
}

/** `<` in a filename would otherwise reach the recipient's mail client as markup. */
function escapeHTML(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** `"YYYY-MM-DD"`, matching how every other date on this site is written and compared. */
function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function unusedMediaEmailHTML(
  files: MarkedFile[],
  deleteAfter: Date,
  link: string,
): string {
  const list = files
    .map((file) => {
      const name = mediaDisplayName({ filename: file.filename, src: file.url, title: file.title }) || `媒體 ${file.id}`
      return `<li>${escapeHTML(name)}</li>`
    })
    .join('')

  return `
    <p>你的媒體庫裡有 ${files.length} 個檔案，上傳超過一年，目前沒有被任何文章、相簿或比賽相片牆使用。</p>
    <p>如果到 <strong>${isoDay(deleteAfter)}</strong> 之前仍然沒有被使用，系統會自動刪除它們以釋出儲存空間。</p>
    <ul>${list}</ul>
    <p>想保留的話，把它插進任何一篇文章或相簿、或是在媒體庫裡標記它屬於哪一場比賽，就會自動取消刪除，不需要再做別的事。</p>
    <p><a href="${escapeHTML(link)}">${escapeHTML(link)}</a></p>
  `
}

/**
 * Mail one owner about everything of theirs marked in this run.
 *
 * Three outcomes rather than a boolean, because two of the ways a notice
 * does not go out are entirely legitimate and one is a silent scheduled
 * deletion. `skipped` covers a deployment with no mail configured — staging's
 * `RESEND_API_KEY` is deliberately empty (AGENTS.md records why) — and an
 * owner row with no address. `failed` means Resend was asked and refused.
 *
 * Collapsing those into one value is what makes a warning worthless: a sweep
 * that reported "could not notify" on every staging run would train everyone
 * to ignore the one production run where it mattered.
 */
export async function notifyUnusedMedia(args: {
  deleteAfter: Date
  files: MarkedFile[]
  ownerId: number | string
  payload: Payload
  req?: PayloadRequest
}): Promise<NotifyOutcome> {
  const { deleteAfter, files, ownerId, payload, req } = args

  try {
    if (!isEmailConfigured() || files.length === 0) return 'skipped'

    // Read at depth 0 and take only the address. A member's email is
    // touched in very few places outside the auth flow, and none of it is
    // returned to the caller — see AGENTS.md on why `owner` is omitted from
    // every public select.
    const owner = await payload.findByID({
      collection: 'users',
      id: ownerId,
      depth: 0,
      overrideAccess: true,
      req,
    })

    if (!owner?.email) return 'skipped'

    const link = `${(payload.config.serverURL ?? '').replace(/\/$/, '')}/members/media`

    await payload.sendEmail({
      to: owner.email,
      subject: `野馬營：${files.length} 個未使用的檔案將於 ${isoDay(deleteAfter)} 刪除`,
      html: unusedMediaEmailHTML(files, deleteAfter, link),
    })

    return 'sent'
  } catch (error) {
    payload.logger.error(
      { err: error },
      `unused-media notice for user ${ownerId} could not be sent — ${files.length} files are marked for deletion with nobody told`,
    )
    return 'failed'
  }
}
