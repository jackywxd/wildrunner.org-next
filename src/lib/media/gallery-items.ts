/**
 * Reading one half out of an album's single ordered list.
 *
 * `SiteGallery.items` replaced `images` and `videos` so the curator's order
 * survives to the page (see the field's header in src/lib/content-types.ts).
 * Some callers still legitimately want only one kind — a count, the OG image,
 * the featured shelf — and doing that with an inline `filter` plus a cast at
 * each of them is how the two lists grow back.
 *
 * Pure, and importing only types, so a client component can use it: the
 * gallery index and the album page both run in the browser.
 */
import type { SiteMediaItem, SitePhoto, SiteVideo } from '@/lib/content-types'

/** The photos, in album order. */
export function photosOf(items: SiteMediaItem[]): SitePhoto[] {
  return items.filter((item) => item.kind === 'photo')
}

/** The videos, in album order. */
export function videosOf(items: SiteMediaItem[]): SiteVideo[] {
  return items.filter((item) => item.kind === 'video')
}
