/**
 * Which track an album plays, and where that answer comes from.
 *
 * Two sources: the album's own `musicUrl` — `galleries.musicUrl` for a curated
 * album, `race-editions.musicUrl` for a race's — and the site-wide list. The
 * album's own goes first and the rest of the list follows it, so every album
 * has somewhere to continue to rather than looping one track for the length of
 * a slideshow.
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
 * The site-wide list as ids, in the admin's own order, with the unusable
 * entries dropped.
 *
 * Dropped *before* anything else looks at the list rather than after, so one
 * bad row cannot become a silent gap in the middle of a playlist. That matters
 * more than it looks: the list is typed in by hand, and the failure it
 * prevents is "track 3 does nothing and nobody can see why".
 */
function fallbackIds(tracks: FallbackTrack[] | null | undefined): string[] {
  const ids: string[] = []
  for (const track of tracks ?? []) {
    const id = track.url ? youTubeVideoId(track.url) : null
    if (id) ids.push(id)
  }
  return ids
}

/**
 * Where in the site-wide list an album starts.
 *
 * DETERMINISTIC, NOT RANDOM, and that is the design decision worth keeping
 * from the single-track version. A random start would make the same album
 * open on a different song every visit — which reads as a bug to a visitor
 * who liked the first one, and cannot be asserted by any test. Keying on the
 * slug spreads albums across the list and stays put.
 */
function startIndex(slug: string, length: number): number {
  return length === 0 ? 0 : hash(slug) % length
}

/**
 * Everything this album can play, in the order it will play it.
 *
 * A LIST RATHER THAN ONE TRACK, which is what the feature was first built as.
 * One track meant a slideshow of two hundred photos heard the same ninety
 * seconds on a loop, and it meant "next" had nowhere to go. The site-wide
 * tracks are all in here now, so an album that names its own music still has
 * somewhere to continue to when it ends.
 *
 * The order:
 *
 *   1. the album's own music, when it has any
 *   2. the site-wide list, rotated so this album starts at its own place in it
 *
 * Deduped, because an album whose own music is also in the site list would
 * otherwise play it twice in a row — and because `loop` over a list with a
 * repeat in it is a list that stutters.
 *
 * Empty means silence, and every caller treats it that way: no music, and no
 * control offered for it.
 */
export function buildMusicPlaylist(input: {
  slug: string
  own: string | null | undefined
  fallback: FallbackTrack[] | null | undefined
}): string[] {
  const own = input.own ? youTubeVideoId(input.own) : null
  const rest = fallbackIds(input.fallback)

  // Rotated rather than sliced: every track stays in the list, this album just
  // starts somewhere else in it. Slicing would mean an album near the end of
  // the list could only ever play the last two.
  const start = startIndex(input.slug, rest.length)
  const rotated = [...rest.slice(start), ...rest.slice(0, start)]

  const ordered = own ? [own, ...rotated] : rotated
  return [...new Set(ordered)]
}
