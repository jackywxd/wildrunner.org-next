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
  SitePhoto,
  SiteVideo,
} from '@/lib/content-types'
import { photosOf, videosOf } from '@/lib/media/gallery-items'

/** The featured shelf has always been capped; the cap moves here with it. */
const FEATURED_LIMIT = 20

const newestFirst = (a: { createdAt: string }, b: { createdAt: string }) =>
  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()

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
  photos: SitePhoto[]
  videos: SiteVideo[]
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
    photos: unionBySrc(albumPhotos, libraryPhotos),
    videos: unionBySrc(albumVideos, libraryVideos),
  }
}
