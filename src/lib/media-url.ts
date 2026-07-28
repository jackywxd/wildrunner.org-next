/**
 * Builds the same absolute R2 CDN URL shape the Velite migration used
 * (`veliteUtils.ts`'s `publicUrlForKey`), so member-uploaded and migrated
 * media are indistinguishable to every consumer downstream.
 *
 * Without this, new uploads get Payload's default relative
 * `/api/media/file/<name>` — see `generateFilePathOrURL.js`'s
 * `!url.startsWith(serverURL || '')` check (fixed for the migrated data in
 * 9bbfbf5, but that fix only changes how an *existing* absolute url is
 * classified; it does nothing for uploads, which never had one to begin
 * with). A relative URL breaks two things: next/image's IMAGES-binding
 * optimizer, which self-fetches through the Worker, and Cloudflare Stream
 * ingest, which needs a URL it can fetch directly rather than one relative
 * to a request context it doesn't have.
 */
export function publicMediaUrl(filename: string): string {
  const base = process.env.R2_PUBLIC_URL
  if (!base) return `/${filename}`

  return `${base.replace(/\/$/, '')}/${filename
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`
}
