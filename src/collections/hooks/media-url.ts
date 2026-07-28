import type { CollectionBeforeChangeHook } from 'payload'

import { publicMediaUrl } from '../../lib/media-url'

/**
 * Give a genuinely new upload an absolute R2 CDN url, matching what the
 * Velite migration wrote for existing media.
 *
 * Runs as a collection-level `beforeChange`, which executes after Payload's
 * own `generateFileData` (so `data.filename` is already the final,
 * dedup-suffixed name) but before the cloud-storage plugin's field-level
 * `beforeChange` on `url` (so setting `data.url` here is what that hook
 * sees as its `value` and leaves untouched, since no `generateFileURL`
 * adapter option is configured — see payload.config.ts for why not).
 *
 * `data.filename` is only present when this operation actually carries a
 * file (`generateFileData` returns early otherwise), and `data.url` is only
 * already set for the "paste URL to upload" path, which is disabled
 * (`upload.pasteURL: false`) — so the guard only ever fires for a real new
 * upload, never for a metadata-only edit or a migrated row.
 *
 * Deployed Workers only. Everywhere else the upload goes to miniflare's
 * *local* R2, and nothing serves that at R2_PUBLIC_URL — pointing there
 * would hand back a URL that 404s for a file that was never uploaded to
 * the real bucket. Dev and CI keep Payload's own /api/media/file/<name>
 * route, which the app itself serves, so the URL resolves in every
 * environment.
 */
export const setMediaUrl: CollectionBeforeChangeHook = ({ data }) => {
  if (process.env.NODE_ENV !== 'production') return data

  if (data.filename && !data.url) {
    return { ...data, url: publicMediaUrl(data.filename) }
  }
  return data
}
