"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Lightbox, { type Slide } from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";

import Fullscreen from "yet-another-react-lightbox/plugins/fullscreen";
import Slideshow from "yet-another-react-lightbox/plugins/slideshow";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import Video from "yet-another-react-lightbox/plugins/video";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/plugins/thumbnails.css";

import PhotoAlbum, { type Photo, type RenderImageContext } from "react-photo-album";
import type { SiteMediaItem } from "@/lib/content-types";
import type { WallCursor } from "@/lib/media/gallery-index";
import { mediaDisplayName } from "@/lib/media-name";
import { NextJsImage } from "@/app/(site)/(public)/gallery/_components/NextJsImage";

/**
 * One grid for everything a gallery holds, in one order.
 *
 * Videos used to live in a horizontally scrolling strip above the photos, in
 * all three places a gallery is drawn. That strip is why a member's newest
 * upload was invisible: it was built as "album videos, then the rest of the
 * library", so an upload in no album landed 24th behind all 23 album videos,
 * on a rail nobody scrolls to the end of. Sorting it by date (#102) helped and
 * did not fix it — a separate rail is a separate order, and two orders is the
 * problem.
 *
 * WHY A VIDEO IS A PHOTO HERE. `react-photo-album` lays out a justified grid
 * from each item's width and height; it does not care what `render.image`
 * then draws in the box it computed. So a video enters the same album as a
 * 16:9 entry and is rendered as a card. That is what makes the interleaving
 * real rather than two containers stacked.
 *
 * WHY THE CARD DRAWS NO FRAME. Measured before this was written: of 27
 * gallery videos in production, 26 have no `width`/`height` and 27 have no
 * `blurDataURL`; the local corpus is 22 out of 22 for both. There is nothing
 * stored to draw. The alternatives were a `<video preload="metadata">` tile
 * showing its own first frame — 27 range requests on one page, and
 * unverifiable in this sandbox because every corpus video lives on a host it
 * cannot reach — or a real poster, which needs the transcoder container, a
 * field, a migration and a backfill. So the card is deliberately a card: dark,
 * labelled, unmistakably a video. A poster upgrades it later without moving
 * anything else.
 */
type GridPhoto = Photo & {
  kind: "photo" | "video";
  label: string;
  mimeType?: string;
};

/**
 * How far below the viewport the sentinel triggers the next fetch, so the
 * next page is already in hand by the time a visitor's scroll reaches it
 * rather than after — a positive margin front-loads the request instead of
 * racing it against the scroll.
 */
const PREFETCH_MARGIN = "800px";

/**
 * The box a video gets in the justified layout.
 *
 * 16:9 because it is the only defensible guess: the rows carry no dimensions
 * (see the header), and every video the transcoder has touched is 1920×1080.
 */
const VIDEO_W = 1600;
const VIDEO_H = 900;

function toGridPhotos(items: SiteMediaItem[]): GridPhoto[] {
  return items.map((item) =>
    item.kind === "photo"
      ? {
          src: item.src,
          width: item.width,
          height: item.height,
          blurDataURL: item.blurDataURL,
          kind: "photo" as const,
          label: item.filename,
        }
      : {
          src: item.src,
          width: VIDEO_W,
          height: VIDEO_H,
          kind: "video" as const,
          label: mediaDisplayName(item),
          mimeType: item.mimeType,
        },
  );
}

/**
 * The play glyph, inline rather than from Iconify.
 *
 * `@iconify-icon/react` fetches its icon data from api.iconify.design at
 * runtime, and this repo bundles nothing offline. Everywhere it is used today
 * that is a branch a reader rarely reaches — AlbumCards draws one only for an
 * album with no cover. A tile per video is not that: it would put a
 * third-party request on the first paint of the site's most-visited public
 * page, once per video, for one triangle. It also fails closed in a way that
 * is easy to miss — the console guard caught it here because the sandbox
 * cannot reach that host at all, which is the only reason it was visible.
 */
function PlayGlyph() {
  return (
    <svg
      aria-hidden="true"
      className="h-8 w-8"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.91 11.672a.375.375 0 0 1 0 .656l-5.603 3.113a.375.375 0 0 1-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112Z"
      />
    </svg>
  );
}

/**
 * A video's tile: the box the album computed, filled by us rather than by an
 * image.
 *
 * The size has to be declared here, exactly as `NextJsImage` declares it. The
 * album positions a tile by giving its wrapper a width and leaving the height
 * to the content, so `h-full` resolves against `auto` and collapses — measured
 * on a real album page, a card the layout had sized 445x250 rendered 445x58,
 * the height of a glyph plus a line of text. `aspectRatio` from the context is
 * what the photo path already uses, and it is the same two numbers the layout
 * solved for.
 */
function VideoCard({
  photo,
  width,
  height,
}: {
  photo: GridPhoto;
  width: number;
  height: number;
}) {
  return (
    <div
      className="flex cursor-pointer flex-col items-center justify-center gap-2 bg-neutral-900 text-white/80 transition-colors hover:bg-neutral-800"
      data-testid="gallery-video-tile"
      style={{ width: "100%", aspectRatio: `${width} / ${height}` }}
    >
      <PlayGlyph />
      <p className="max-w-[85%] truncate px-2 text-center text-xs">{photo.label}</p>
    </div>
  );
}

export function MediaGrid({
  items,
  nextCursor,
  targetRowHeight = 220,
}: {
  items: SiteMediaItem[];
  /**
   * Omit for a bounded list that never paginates — an album's own contents,
   * which PhotoGallery already has in full and always will (an album is
   * curator-sized, not visitor-scale). Pass it — `null` included, meaning
   * there is no next page yet — for the wall, and this turns on
   * scroll-triggered fetching against /api/gallery/wall. See that route's
   * header for why a page of the wall can only come from there.
   */
  nextCursor?: WallCursor | null;
  targetRowHeight?: number;
}) {
  const [index, setIndex] = useState(-1);
  const paginated = nextCursor !== undefined;

  const [accumulated, setAccumulated] = useState<SiteMediaItem[]>(items);
  const [cursor, setCursor] = useState<WallCursor | null>(nextCursor ?? null);
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !cursor) return;
    loadingRef.current = true;
    try {
      const params = new URLSearchParams({
        createdAt: cursor.createdAt,
        src: cursor.src,
      });
      const response = await fetch(`/api/gallery/wall?${params}`);
      if (!response.ok) return;
      const page = (await response.json()) as {
        items: SiteMediaItem[];
        nextCursor: WallCursor | null;
      };
      setAccumulated((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } finally {
      loadingRef.current = false;
    }
  }, [cursor]);

  // Not re-armed on `items`/`nextCursor` changing identity: GalleryPageClient
  // only ever mounts this fresh (the "全部相片" tab conditionally renders it,
  // so switching away and back remounts rather than re-props an existing
  // instance), so the lazy initial state above is the only sync this needs.
  useEffect(() => {
    if (!paginated || !cursor) return;
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: PREFETCH_MARGIN },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [paginated, cursor, loadMore]);

  const photos = useMemo(() => toGridPhotos(accumulated), [accumulated]);

  // The lightbox indexes into exactly what the grid shows, so a page that
  // arrives mid-view never shifts an index already open.
  const slides: Slide[] = useMemo(
    () =>
      photos.map((item) =>
        item.kind === "video"
          ? {
              type: "video" as const,
              width: item.width,
              height: item.height,
              sources: [{ src: item.src, type: item.mimeType ?? "video/mp4" }],
            }
          : { src: item.src, width: item.width, height: item.height },
      ),
    [photos],
  );

  if (photos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="gallery-all-photos-empty">
        還沒有相片或影片。
      </p>
    );
  }

  return (
    <>
      <PhotoAlbum
        layout="rows"
        targetRowHeight={targetRowHeight}
        photos={photos}
        render={{
          image: (props, context: RenderImageContext<GridPhoto>) =>
            context.photo.kind === "video" ? (
              <VideoCard
                photo={context.photo}
                width={context.width}
                height={context.height}
              />
            ) : (
              // A render function, not a component — react-photo-album calls
              // it with (props, context), so it is invoked rather than mounted.
              NextJsImage(props, context)
            ),
        }}
        defaultContainerWidth={1280}
        sizes={{
          size: "1168px",
          sizes: [
            { viewport: "(max-width: 768px)", size: "calc(100vw - 32px)" },
            { viewport: "(max-width: 1280px)", size: "calc(100vw - 64px)" },
          ],
        }}
        onClick={({ index: i }) => setIndex(i)}
      />

      {/* Invisible, and only present at all while there is somewhere to
          scroll to — `paginated && cursor` both drop once the wall is
          exhausted, which stops the observer effect above from re-arming
          against a node that no longer exists. */}
      {paginated && cursor && (
        <div ref={sentinelRef} aria-hidden="true" className="h-px" data-testid="gallery-wall-sentinel" />
      )}

      <Lightbox
        slides={slides}
        open={index >= 0}
        index={index}
        close={() => setIndex(-1)}
        plugins={[Fullscreen, Slideshow, Thumbnails, Video, Zoom]}
      />
    </>
  );
}

export default MediaGrid;
