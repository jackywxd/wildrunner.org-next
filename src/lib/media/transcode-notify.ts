import type { Payload, PayloadRequest } from 'payload'

import { isEmailConfigured } from '@/lib/email'
import { mediaDisplayName } from '@/lib/media-name'

/**
 * Tell a member their video could not be converted.
 *
 * ONLY FAILURE IS MAILED, and that asymmetry is the whole design. A member
 * does not wait for the transcode — the upload finishes as soon as the file
 * is in R2 and the encode happens minutes later in a container — so the
 * question is what they are told afterwards. On success the answer is
 * nothing: `transcodeResult` repoints `media.url` at the new file, so the
 * video simply plays and there is no action to take. A "your video is ready"
 * mail would ask for nothing, and a race gallery uploaded in one sitting
 * would send eight of them. Failure is the case that needs a person: the
 * original is still there, but it will never be converted, and only the
 * member can decide to upload something else.
 *
 * NEVER THROWS, and that is load-bearing rather than tidy. Both callers are
 * reporting a transcode's outcome, and a 500 raised by an unrelated mail
 * server would tell the container its report failed — leaving the row
 * `running` for the sweep to reclaim and re-run a job that genuinely failed.
 * A member who misses one email is a much smaller problem than a queue that
 * cannot record failure.
 *
 * `isEmailConfigured()` is checked rather than assumed: staging's
 * `RESEND_API_KEY` is deliberately empty (AGENTS.md records why), so on that
 * environment this has to be a quiet no-op, not an error.
 */
export async function notifyTranscodeFailed(args: {
  /** What the container reported, verbatim. Shown to the member — see
   *  `transcodeFailedEmailHTML` on why the raw text earns its place. */
  message?: string | null
  media: {
    alt?: string | null
    filename?: string | null
    id: number | string
    owner?: unknown
    title?: string | null
    url?: string | null
  }
  payload: Payload
  req?: PayloadRequest
}): Promise<boolean> {
  const { media, message, payload, req } = args

  try {
    if (!isEmailConfigured()) return false

    const ownerId =
      typeof media.owner === 'object' && media.owner !== null
        ? (media.owner as { id?: number | string }).id
        : (media.owner as number | string | null | undefined)

    // Nothing to send to. Every migrated video predates member ownership,
    // so this is the normal case for the existing corpus rather than a
    // fault worth logging loudly.
    if (ownerId === null || ownerId === undefined) return false

    // Read at depth 0 and take only the address. This is the one place a
    // member's email is touched outside the auth flow, and none of it is
    // returned to the caller or rendered anywhere — see AGENTS.md on why
    // `owner` is omitted from every public select.
    const owner = await payload.findByID({
      collection: 'users',
      id: ownerId,
      depth: 0,
      overrideAccess: true,
      req,
    })

    if (!owner?.email) return false

    const name = mediaDisplayName({ filename: media.filename, src: media.url, title: media.title })
    const link = `${(payload.config.serverURL ?? '').replace(/\/$/, '')}/members/media`

    await payload.sendEmail({
      to: owner.email,
      subject: `影片轉檔失敗：${name || `媒體 ${media.id}`}`,
      html: transcodeFailedEmailHTML(name || `媒體 ${media.id}`, link, message),
    })

    return true
  } catch (error) {
    payload.logger.error(
      { err: error },
      `transcode failure notice for media ${media.id} could not be sent`,
    )
    return false
  }
}

/** `<` in a filename would otherwise reach the recipient's mail client as markup. */
function escapeHTML(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * The reason is included verbatim, and deliberately.
 *
 * "轉檔失敗" on its own tells a member nothing they can act on, and the
 * reasons differ enormously in what they imply: a corrupt file is theirs to
 * fix by re-exporting, while "Maximum number of running container instances
 * exceeded" means try again later and says nothing about their video at all.
 * Hiding that difference turns every failure into the same shrug.
 *
 * It is fenced off in its own block rather than woven into a sentence, so it
 * reads as machine output — which is what it is, and what makes it worth
 * quoting back if they ask for help. Truncated because ffmpeg's stderr can
 * run long, and escaped because it is not ours to trust as markup.
 */
export function transcodeFailedEmailHTML(
  name: string,
  link: string,
  message?: string | null,
): string {
  const safeName = escapeHTML(name)
  const reason = (message ?? '').trim()
  const detail = reason
    ? `<p>失敗原因：</p>
    <pre style="background:#f4f4f5;padding:12px;border-radius:4px;white-space:pre-wrap;word-break:break-word;font-size:13px">${escapeHTML(
      reason.slice(0, 500),
    )}</pre>`
    : ''

  return `
    <p>你上傳的影片「${safeName}」轉檔失敗了。</p>
    <p>原始檔案還在，沒有被刪除，但它不會自動轉成 1080p H.264，在部分手機和瀏覽器上可能無法播放。</p>
    ${detail}
    <p>可以到媒體庫按「重新轉檔」再試一次；如果同一個檔案一再失敗，換一個匯出格式（H.264 的 MP4）通常就可以。</p>
    <p><a href="${escapeHTML(link)}">${escapeHTML(link)}</a></p>
  `
}
