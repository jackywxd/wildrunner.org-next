/**
 * One gallery document, as the public pages consume it — and nothing else.
 *
 * Extracted from src/lib/content.ts for the reason src/lib/media/site-video.ts
 * already gives: that file imports `@payload-config`, whose module evaluation
 * is a top-level await acquiring the Cloudflare context, so importing it boots
 * a miniflare. No unit spec can touch it, which is why the mapping that
 * decides an album's order had no test while it was in there.
 *
 * Everything here is pure and imports only types from Payload, so the unit
 * lane can exercise it directly (e2e/unit/gallery-mapping.spec.ts).
 */
import type { Gallery, Media } from '@/payload-types'

import { mediaDimensions, mediaImageSrc } from '@/lib/cf-image'
import { buildMusicPlaylist, type FallbackTrack } from '@/lib/media/album-music'
import type { SiteGallery, SiteMediaItem, SitePhoto, SiteVideo } from '@/lib/content-types'
import { editionIdOf, mediaToSiteVideo } from '@/lib/media/site-video'

/**
 * Exactly the media fields the public mappers below read, and no more.
 *
 * `owner` is the point: this file's header makes its absence from every
 * `select` the rule, because at depth >= 1 Payload populates the whole user
 * account behind every card on the page. Naming the fields positively rather
 * than relying on `depth: 0` is what lets the gallery query carry a `select`
 * at all.
 */
export type MediaCardDoc = Pick<
  Media,
  | "blurDataURL"
  | "createdAt"
  | "description"
  | "filename"
  | "filesize"
  | "height"
  | "id"
  | "legacyVideoId"
  | "mimeType"
  | "posterUrl"
  | "raceEdition"
  | "streamId"
  | "streamReady"
  | "title"
  | "url"
  | "width"
>;

/** Exactly what GALLERY_SELECT returns — notably no `owner`. */
export type GalleryDoc = Pick<
  Gallery,
  | "cover"
  | "createdAt"
  | "eventDate"
  | "featured"
  | "items"
  | "location"
  | "musicUrl"
  | "name"
  | "raceEdition"
  | "slug"
>;

export function isMedia(value: unknown): value is Media {
  return Boolean(value && typeof value === "object" && "url" in value);
}


export function mapMediaToSiteImage(media: Media | null | undefined) {
  const src = mediaImageSrc(media);
  if (!src) return undefined;
  const { width, height } = mediaDimensions(media);
  return { src, width, height };
}

export function mapMediaToPhoto(
  media: MediaCardDoc,
  featured: boolean,
): SitePhoto | null {
  const src = mediaImageSrc(media);
  if (!src) return null;
  const { width, height } = mediaDimensions(media);
  const filename = media.filename ?? src.split("/").pop() ?? "image";
  return {
    mediaId: media.id,
    filename,
    src,
    slug: src,
    featured,
    width,
    height,
    blurDataURL: media.blurDataURL ?? undefined,
    description: media.description ?? undefined,
    raceEditionId: editionIdOf(media.raceEdition),
    blurWidth: 20,
    blurHeight: Math.max(1, Math.round((height / width) * 20)),
    createdAt: media.createdAt,
  };
}

/**
 * Kept as a name in this file because the call sites read better for it, but
 * the mapping itself lives in @/lib/media/site-video — the article renderer
 * and the member's preview need the same conversion and cannot import this
 * file, which resolves the payload client at module scope.
 */
export function mapGalleryVideo(
  media: MediaCardDoc,
  videoId?: string | null,
): SiteVideo | null {
  return mediaToSiteVideo(media, videoId);
}

/**
 * One album's stored rows, kept in the order they are stored in.
 *
 * This used to split them by `media.mimeType` into `images` and `videos`,
 * which quietly undid what `galleries.items[]` exists for: one relation, one
 * `_order`, so a curator can arrange photos and videos together. The split
 * preserved each half's internal order and discarded the interleaving between
 * them. `kind` records the same mimeType test once, here, so no consumer has
 * to repeat it — see `SiteMediaItem` in src/lib/content-types.ts.
 *
 * A row whose media is missing is skipped, not counted. That can only happen
 * on a version row now — the live table cascades — but the guard stays because
 * `_galleries_v_version_items` deliberately keeps `ON DELETE set null` so a
 * deleted file does not rewrite history.
 */
export function mapPayloadGallery(
  doc: GalleryDoc,
  /**
   * The site-wide tracks, for an album that names none of its own. Defaults to
   * none, which is what a caller that has not read the global should get —
   * silence rather than a guess.
   */
  fallbackMusic: FallbackTrack[] = [],
): SiteGallery {
  const items: SiteMediaItem[] = [];
  const featuredStems: string[] = [];

  for (const row of doc.items ?? []) {
    const media = row.media;
    if (!isMedia(media)) continue;

    if (media.mimeType?.startsWith("video/")) {
      const video = mapGalleryVideo(media);
      if (video) items.push({ kind: "video", ...video });
      continue;
    }

    const photo = mapMediaToPhoto(media, Boolean(row.featured));
    if (!photo) continue;
    items.push({ kind: "photo", ...photo });
    if (row.featured) {
      featuredStems.push(photo.filename.replace(/\.[^.]+$/, ""));
    }
  }

  const coverMedia = isMedia(doc.cover) ? doc.cover : undefined;

  return {
    slug: doc.slug,
    name: doc.name,
    location: doc.location,
    created: doc.createdAt,
    eventDate: doc.eventDate,
    isFeatured: Boolean(doc.featured),
    featured: featuredStems,
    cover: coverMedia ? mapMediaToSiteImage(coverMedia) : null,
    // Ids, never the stored URLs — this is the boundary src/lib/youtube.ts
    // exists to hold. Empty for an album with no music and no fallback, and
    // also for one whose stored value stopped parsing, which is the safe
    // direction: no music rather than an arbitrary third-party frame.
    musicPlaylist: buildMusicPlaylist({
      slug: doc.slug,
      own: doc.musicUrl,
      fallback: fallbackMusic,
    }),
    // A bare id at depth 1: `raceEdition` is a relationship on the album, and
    // the album query populates its cover and items rather than walking on
    // into race-editions. `albumRaceEditionId` reads the album's own tag first
    // and the items' tags second — see its header for why both exist.
    raceEditionId:
      typeof doc.raceEdition === "number"
        ? doc.raceEdition
        : (doc.raceEdition?.id ?? undefined),
    items,
  };
}
