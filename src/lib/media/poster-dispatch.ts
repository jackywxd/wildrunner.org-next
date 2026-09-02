import { posterFrameJob } from '@/lib/media/transcode-state'
import { getCloudflareContext } from '@opennextjs/cloudflare'

/**
 * Ask the transcoder for one frame, at the moment a member chose.
 *
 * The same service binding and the same shared secret as
 * `transcode-dispatch.ts` — read that file's header for why the transcoder is
 * a separate Worker at all — pointed at `/poster` instead of `/transcode`.
 *
 * WHAT IS DIFFERENT, AND IT IS THE WHOLE REASON THIS IS NOT A FLAG ON
 * `startTranscode`. That path is best-effort by design: a dispatch that fails
 * leaves the row `queued` and the scheduled sweep picks it up later, because
 * nobody is watching an upload finish. This one has a member looking at a
 * dialog waiting for a picture to change, and there is no queued state for
 * "wants a different poster" — so a failure here has to come back as a
 * failure and be shown, not swallowed into a retry nobody scheduled.
 *
 * So this returns a reason rather than a boolean. The caller turns it into an
 * HTTP status; the member gets told the transcoder is unavailable instead of
 * watching an unchanged poster and guessing.
 */
export type PosterDispatchResult =
  | { ok: true }
  | { ok: false; reason: 'no-transcoder' | 'no-secret' | 'bad-source' | 'rejected' }

export async function startPosterCapture(
  media: { id: number | string; url?: string | null },
  seconds: number,
): Promise<PosterDispatchResult> {
  // ENVIRONMENT BEFORE ROW, and the order is the whole difference between a
  // useful message and a misleading one. Both checks fail in dev and CI: the
  // service binding is absent, and an upload there gets a relative `url`
  // because `R2_PUBLIC_URL` is unset. Asking about the row first answered
  // "this file has no source the transcoder can read" — which reads as "your
  // video is broken" when the truth is that there is no transcoder here at
  // all. Measured, not guessed: that is exactly what V-PICKFRAME-T1 saw.
  const { env } = await getCloudflareContext({ async: true })
  const transcoder = (env as unknown as { TRANSCODER?: Fetcher }).TRANSCODER
  if (!transcoder) {
    // Reported rather than swallowed, so the member is told the feature is
    // unavailable here instead of pressing a button that silently does
    // nothing — which is exactly how the poster backfill hid for days.
    return { ok: false, reason: 'no-transcoder' }
  }

  const secret = process.env.TRANSCODE_SECRET
  if (!secret) {
    console.warn(`poster dispatch for media ${media.id} skipped: TRANSCODE_SECRET is not set`)
    return { ok: false, reason: 'no-secret' }
  }

  const job = posterFrameJob(media, seconds)
  if (!job) {
    // Now that a transcoder exists, this really is about the row: either no
    // absolute URL for the container to fetch, or a time the player never
    // reported. Neither is something a retry fixes.
    console.warn(
      `poster dispatch for media ${media.id} skipped: url=${media.url ?? 'unset'} seconds=${seconds}`,
    )
    return { ok: false, reason: 'bad-source' }
  }

  try {
    const response = await transcoder.fetch('https://transcoder/poster', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-transcode-secret': secret,
      },
      body: JSON.stringify(job),
    })

    if (!response.ok) {
      console.warn(`poster dispatch for media ${media.id} returned ${response.status}`)
      return { ok: false, reason: 'rejected' }
    }

    return { ok: true }
  } catch (error) {
    console.warn(
      `poster dispatch for media ${media.id} failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
    return { ok: false, reason: 'rejected' }
  }
}
