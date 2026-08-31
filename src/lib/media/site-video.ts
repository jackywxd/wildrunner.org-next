/**
 * One media row, as the thing `StreamVideoPlayer` can play.
 *
 * This exists because the same conversion had already been written twice and
 * was about to be written twice more. `mapGalleryVideo` in src/lib/content.ts
 * is the original; `MediaDetailDialog` carries a hand-copied version whose
 * comment explains exactly why it could not reuse the original — "that file
 * resolves the payload client at module scope, which has no place in a client
 * bundle". That reasoning is right, and the answer to it is a module with no
 * server dependencies rather than a fourth copy.
 *
 * So: `@/payload-types` is imported for types only, and the two helpers used
 * here are pure. Safe from a server component, a client component, or a
 * script.
 *
 * WHAT IT DROPS, said out loud because this is now the single definition for
 * every caller: a video with no `url` returns null, including one that exists
 * only in Cloudflare Stream. `StreamVideoPlayer`'s first branch needs just
 * `streamId && streamReady` and would happily play it. That combination is
 * unreachable today — `STREAM_INGEST` is off and `streamId` is null on every
 * row, as stream-video-player.tsx's own header records — and the behaviour is
 * preserved rather than "fixed" so this extraction changes nothing that ships.
 * If Stream is ever turned on, this is the line to revisit.
 */
import type { Media } from '@/payload-types'
import type { SiteVideo } from '@/lib/content-types'
import { mediaImageSrc } from '@/lib/cf-image'
import { videoIdFromFilename } from '@/lib/videoId'

/** Everything the mapping reads. A full `Media` satisfies it structurally. */
export type VideoMediaDoc = Pick<
  Media,
  | 'createdAt'
  | 'filename'
  | 'filesize'
  | 'id'
  | 'legacyVideoId'
  | 'mimeType'
  | 'streamId'
  | 'streamReady'
  | 'url'
>

/**
 * `videoId` is the share-page id and the caller decides it.
 *
 * Left unset it falls back to the media's own `legacyVideoId` and then to a
 * filename slug — the order `getGalleryVideo` resolves in, so a link built
 * from this is a link that page can look up. See `media.legacyVideoId`'s
 * header in src/collections/Media.ts for why that column exists at all.
 */
export function mediaToSiteVideo(
  media: VideoMediaDoc,
  videoId?: string | null,
): SiteVideo | null {
  const src = mediaImageSrc(media)
  if (!src) return null

  const filename = media.filename ?? 'video'
  const id = videoId?.trim() || media.legacyVideoId?.trim() || videoIdFromFilename(filename)

  return {
    mediaId: media.id,
    id,
    createdAt: media.createdAt,
    filename,
    src,
    slug: filename,
    mimeType: media.mimeType ?? 'video/mp4',
    size: media.filesize ?? undefined,
    extension: filename.includes('.') ? filename.split('.').pop()! : undefined,
    streamId: media.streamId,
    streamReady: Boolean(media.streamReady),
  }
}
