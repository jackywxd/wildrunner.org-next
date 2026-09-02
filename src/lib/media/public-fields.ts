/**
 * Did this media write change anything a public page renders?
 *
 * `media` is the most-written collection on the site and most of those writes
 * are invisible: `unusedMediaSweep` stamps `unusedSince` on potentially every
 * row it examines, weekly, and the transcode endpoints step `transcodeState`
 * through several values per video. A revalidation hook that fires on all of
 * them would spend hundreds of cache invalidations a week on rows whose
 * rendered output did not move.
 *
 * So the hook asks this first. The list is `MediaCardDoc` — the type whose own
 * header says it is "exactly the media fields the public mappers read, and no
 * more" (src/lib/media/gallery-mapping.ts) — plus the two fields that reach a
 * page by another route:
 *
 *   usage   not read by a mapper at all; it is the `where` that decides
 *           whether the row is on the photo wall in the first place.
 *   alt     rendered by RacePhotoWall and by the rich-text upload converter.
 *
 * `description` is in `MediaCardDoc` and so arrives with the list, but it is
 * worth naming here anyway: it is the one field a member edits *expecting* to
 * see the result on a cached page, and /gallery caches for an hour. Left out,
 * a caption written now would appear at some point within the hour with
 * nothing to explain the wait.
 *
 * `posterUrl` WAS MISSING AND SHOULD NOT HAVE BEEN. It is in `MediaCardDoc`,
 * the wall's tile draws it, and the lightbox's player and thumbnail strip do
 * too — so it is read by a public page, which is the whole test for
 * membership here. Its absence meant the one write nobody is watching for:
 * the transcoder finishes minutes after an upload and reports a frame back
 * through `/poster-result`, and that write invalidated nothing, so the poster
 * appeared whenever some unrelated change happened to bust the path. The
 * exclusion list below says the fields there are excluded "because no public
 * page reads it"; this one never met that description.
 *
 * Kept here rather than inline in the hook because the hook file imports
 * `next/cache` transitively, and this is the half with branches worth pinning.
 *
 * Deliberately NOT in the list, each because no public page reads it:
 * `unusedSince`, `transcodeState`, `contentFingerprint`, `originalFilesize`,
 * `owner`, `prefix`, `sizes`, `thumbnailURL`, `updatedAt`. A transcode that
 * finishes still triggers, because finishing rewrites `url`, `width` and
 * `height`.
 */

/** The fields whose value the public site can show. */
export const PUBLIC_MEDIA_FIELDS = [
  'alt',
  'blurDataURL',
  'description',
  'filename',
  'filesize',
  'height',
  'legacyVideoId',
  'mimeType',
  'posterUrl',
  'raceEdition',
  'streamId',
  'streamReady',
  'url',
  'usage',
  'width',
] as const

/**
 * A relationship arrives as a bare id or as a populated object depending on
 * the depth of the request that triggered the write, so `raceEdition` cannot
 * be compared with `!==` — the same tag saved twice at different depths would
 * read as a change every time.
 */
function comparable(value: unknown): unknown {
  if (value && typeof value === 'object' && 'id' in value) {
    return (value as { id: unknown }).id
  }
  return value ?? null
}

export function publicMediaFieldsChanged(
  doc: Record<string, unknown>,
  previousDoc: Record<string, unknown> | undefined,
): boolean {
  // A create has no previous document, and a newly public file is exactly the
  // case this exists for.
  if (!previousDoc) return true

  return PUBLIC_MEDIA_FIELDS.some(
    (field) => comparable(doc[field]) !== comparable(previousDoc[field]),
  )
}
