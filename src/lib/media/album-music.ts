/**
 * Which track an album plays, and where that answer comes from.
 *
 * Three sources, in order: the album's own `musicUrl`, the race edition's when
 * the album is a race's, and the site-wide fallback list. Only the last one
 * has a rule worth writing down, and it is the reason this is a module rather
 * than a `??` chain at the call site.
 *
 * EVERY VALUE THAT LEAVES HERE IS AN ELEVEN-CHARACTER ID, never a stored
 * string. The `src` of a third-party frame is the one place a stray value in
 * the database becomes an arbitrary embedded origin on our own page, so the
 * parse happens on the way out and `null` is the answer for anything that does
 * not parse — see `src/lib/youtube.ts`. A validator sits in front of both
 * columns, but a validator can be relaxed, bypassed by a script write, or
 * predate a row; this cannot.
 */
import { youTubeVideoId } from '@/lib/youtube'

/** One entry of the site-wide list, as stored. */
export type FallbackTrack = { url?: string | null }

/**
 * A stable index into a list, derived from a string.
 *
 * djb2, because it needs to be short, dependency-free and identical on the
 * server and in the browser — not because it needs to be good. Nothing here is
 * security-sensitive; what is required is only that the same slug always picks
 * the same track.
 */
function hash(value: string): number {
  let h = 5381
  for (let i = 0; i < value.length; i += 1) {
    // `| 0` keeps this in 32-bit integer arithmetic, so the same slug hashes
    // identically wherever it runs rather than drifting once the value grows
    // past what a float can hold exactly.
    h = ((h << 5) + h + value.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/**
 * The fallback track for an album, or `null` when the list is empty.
 *
 * DETERMINISTIC, NOT RANDOM, and that is the whole design decision. A random
 * pick would make the same album sound different on every visit — which reads
 * as a bug to a visitor who liked the first one, and cannot be asserted by any
 * test. Keying on the slug gives every album a track of its own, spreads them
 * across the list, and stays put.
 *
 * Entries that do not parse as a single YouTube video are dropped *before* the
 * pick rather than after, so one bad row cannot silence an album by winning
 * the draw. That matters more than it looks: the admin list is edited by hand,
 * and the failure it prevents is "album 7 has no music and nobody can see why".
 */
export function pickFallbackMusic(
  slug: string,
  tracks: FallbackTrack[] | null | undefined,
): string | null {
  const ids: string[] = []
  for (const track of tracks ?? []) {
    const id = track.url ? youTubeVideoId(track.url) : null
    if (id) ids.push(id)
  }
  if (ids.length === 0) return null
  return ids[hash(slug) % ids.length]
}

/**
 * The album's own music, whatever named it.
 *
 * `own` is `galleries.musicUrl` for a curated album and
 * `race-editions.musicUrl` for a race's — the caller knows which it has, and
 * the precedence between them never arises because an album is one or the
 * other.
 */
export function resolveAlbumMusic(input: {
  slug: string
  own: string | null | undefined
  fallback: FallbackTrack[] | null | undefined
}): string | null {
  const own = input.own ? youTubeVideoId(input.own) : null
  if (own) return own
  return pickFallbackMusic(input.slug, input.fallback)
}
