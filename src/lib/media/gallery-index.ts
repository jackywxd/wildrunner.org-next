/**
 * Everything /gallery draws, reduced to it before it is sent.
 *
 * The page used to hand the client every album with every one of its `items`
 * plus the whole flat wall, and the client reduced that with four `useMemo`s.
 * Both halves of that were wrong. The reduction is deterministic, so doing it
 * per visitor in a browser buys nothing; and the input it reduces *from* was
 * already in the RSC payload, so the memoisation saved render time while
 * saving no bytes at all. Measured on the seeded corpus, /gallery was 663 KB
 * carrying 820 `blurDataURL`s and 840 `createdAt`s for ~420 photos — each row
 * serialised twice, once inside an album and once in the wall.
 *
 * Pure and importing only types, so the unit lane can exercise it: the union
 * below is the part with a rule in it, and the rule is easy to lose.
 */
import type {
  SiteAlbumCard,
  SiteGallery,
  SiteMediaItem,
  SitePhoto,
  SiteVideo,
} from '@/lib/content-types'
import { photosOf, videosOf } from '@/lib/media/gallery-items'

/** The featured shelf has always been capped; the cap moves here with it. */
const FEATURED_LIMIT = 20

/**
 * `src` is an optional tiebreak, not just the sort key `unionBySrc` already
 * requires it for: a batch import can give several rows the exact same
 * `createdAt`, and without a deterministic second key the array has no single
 * stable order — which `wallPage`'s cursor depends on to find its place
 * exactly rather than guessing.
 */
const newestFirst = (
  a: { createdAt: string; src?: string },
  b: { createdAt: string; src?: string },
) => {
  const byTime = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  if (byTime !== 0) return byTime
  return (a.src ?? '').localeCompare(b.src ?? '')
}

/**
 * One album's card. The contents stay behind, at /gallery/[slug].
 *
 * `created` falls back to the album's own timestamp: a race album is
 * synthesised from a query and `buildRaceGallery` already sets it to its
 * newest media, so both kinds sort on the same axis.
 */
export function albumCard(gallery: SiteGallery): SiteAlbumCard {
  return {
    slug: gallery.slug,
    name: gallery.name,
    cover: gallery.cover ?? null,
    photoCount: photosOf(gallery.items).length,
    videoCount: videosOf(gallery.items).length,
    created: gallery.created,
  }
}

/**
 * Album membership and `media.usage` are two different routes to "this is
 * public", and the union of them is what the wall shows.
 *
 * NOT the same as "just send the library". An editor can put a file whose
 * `usage` is `attachment` into a curated album; it is then in the album and
 * not on the wall, and dropping this union would take it off the page it is
 * curated onto. Deduped by `src`, the one identifier both sources carry and
 * the key the grid already renders on.
 */
export function unionBySrc<T extends { src: string; createdAt: string }>(
  fromAlbums: T[],
  fromLibrary: T[],
): T[] {
  const seen = new Set<string>()
  const combined: T[] = []
  for (const item of [...fromAlbums, ...fromLibrary]) {
    if (seen.has(item.src)) continue
    seen.add(item.src)
    combined.push(item)
  }
  return combined.sort(newestFirst)
}

export type GalleryIndexData = {
  albums: SiteAlbumCard[]
  featuredPhotos: SitePhoto[]
  /**
   * The wall, photos and videos in one list, newest first.
   *
   * Was two lists. Two lists is what put a member's newest video 24th: the
   * page could only render them as a separate strip, and a strip has to be
   * ordered somehow — it was ordered by source. One list has one order, and
   * the order is time.
   */
  items: SiteMediaItem[]
}

/** Where a page of the wall left off — the last item's own identity, not an offset. */
export type WallCursor = { createdAt: string; src: string }

export type WallPage = {
  items: SiteMediaItem[]
  /** `null` means there is nothing more. */
  nextCursor: WallCursor | null
}

/** How many items `/api/gallery/wall` and the initial page both hand out at once. */
export const WALL_PAGE_SIZE = 60

/**
 * One page of the wall, sliced from the array `buildGalleryIndex` already
 * produced — never a second query. See this file's header: the wall is a
 * union of two sources, and only `buildGalleryIndex` gets that union right.
 * A route that paginated `media.find` on its own would quietly drop every
 * album-curated item whose own `usage` is not `gallery` past page one — not
 * a performance bug, a content-correctness one, and nothing would catch it
 * on a corpus that doesn't happen to have such a row.
 *
 * The cursor is the last item's own `(createdAt, src)`, not an offset. Two
 * requests a visitor makes can be minutes apart, and a photo can publish or
 * get withdrawn in that window; an offset shifts under that and produces a
 * skipped or repeated row. This cursor re-finds its place in whatever the
 * array looks like *now* and returns what comes after — the only definition
 * of "next page" that survives concurrent writes. If the cursor's own item
 * is gone (withdrawn since the last page was fetched), it falls back to the
 * first item that would sort after it, using the same comparator the array
 * is already sorted by.
 */
export function wallPage(
  items: SiteMediaItem[],
  cursor: WallCursor | null,
  pageSize: number = WALL_PAGE_SIZE,
): WallPage {
  let start = 0
  if (cursor) {
    const at = items.findIndex(
      (item) => item.createdAt === cursor.createdAt && item.src === cursor.src,
    )
    if (at >= 0) {
      start = at + 1
    } else {
      const after = items.findIndex((item) => newestFirst(item, cursor) > 0)
      start = after >= 0 ? after : items.length
    }
  }

  const page = items.slice(start, start + pageSize)
  const last = page[page.length - 1]
  const nextCursor: WallCursor | null =
    last && start + pageSize < items.length
      ? { createdAt: last.createdAt, src: last.src }
      : null

  return { items: page, nextCursor }
}

export function buildGalleryIndex(
  galleries: SiteGallery[],
  libraryPhotos: SitePhoto[],
  libraryVideos: SiteVideo[],
): GalleryIndexData {
  const albumPhotos = galleries.flatMap((gallery) => photosOf(gallery.items))
  const albumVideos = galleries.flatMap((gallery) => videosOf(gallery.items))

  return {
    albums: galleries
      .map(albumCard)
      .filter((card) => card.photoCount > 0 || card.videoCount > 0)
      .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime()),
    featuredPhotos: albumPhotos
      .filter((photo) => photo.featured)
      .slice(0, FEATURED_LIMIT),
    // Unioned per kind first, because dedupe is by `src` and a photo and a
    // video can never collide on one; then merged and re-sorted so the wall
    // is one sequence in time rather than two lists stapled together.
    items: [
      ...unionBySrc(albumPhotos, libraryPhotos).map(
        (photo): SiteMediaItem => ({ kind: 'photo', ...photo }),
      ),
      ...unionBySrc(albumVideos, libraryVideos).map(
        (video): SiteMediaItem => ({ kind: 'video', ...video }),
      ),
    ].sort(newestFirst),
  }
}
