"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Lightbox, { type Slide } from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";

import Captions from "yet-another-react-lightbox/plugins/captions";
import "yet-another-react-lightbox/plugins/captions.css";
import Fullscreen from "yet-another-react-lightbox/plugins/fullscreen";
import Slideshow from "yet-another-react-lightbox/plugins/slideshow";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import Video from "yet-another-react-lightbox/plugins/video";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/plugins/thumbnails.css";

import { Share2 } from "lucide-react";
import PhotoAlbum, {
  type Photo,
  type RenderImageContext,
} from "react-photo-album";
import type { SiteMediaItem } from "@/lib/content-types";
import type { MediaKindFilter } from "@/lib/media/filters";
import {
  arrangeMedia,
  type WallCursor,
  type WallSort,
} from "@/lib/media/gallery-index";
import { mediaDisplayName } from "@/lib/media-name";
import {
  FilterChip,
  FilterSelect,
  KIND_LABELS,
} from "@/components/media/filters";
import { VideoPosterTile } from "@/components/media/VideoPosterTile";
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
 * WHAT A VIDEO'S CARD DRAWS is now `VideoPosterTile`, shared with the member
 * library — a real frame when the container has taken one, the dark labelled
 * card otherwise. That file carries the measurements. The rejected
 * alternative is still rejected: a `<video preload="metadata">` tile showing
 * its own first frame is one range request per video on the page.
 */
type GridPhoto = Photo & {
  kind: "photo" | "video";
  /** The share page's address — see the toolbar button in the lightbox below. */
  mediaId: number;
  label: string;
  /** `media.description`, shown as the lightbox caption. Usually absent. */
  description?: string;
  mimeType?: string;
  /** A video's own frame, when the transcoder has taken one. */
  poster?: string;
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
          mediaId: item.mediaId,
          label: item.filename,
          description: item.description,
        }
      : {
          src: item.src,
          width: VIDEO_W,
          height: VIDEO_H,
          kind: "video" as const,
          mediaId: item.mediaId,
          label: mediaDisplayName(item),
          description: item.description,
          mimeType: item.mimeType,
          poster: item.poster,
        },
  );
}

/**
 * The way back out of the grid to a single item's own page.
 *
 * WHY THIS EXISTS AT ALL. Videos used to carry a share button on the strip
 * that `MediaGrid` replaced (#105) — on /gallery and on every album page. The
 * strip went and the button went with it, so the only share affordance left
 * anywhere was the race page's own copy of that strip, and
 * `/gallery/m/[mediaId]` shipped afterwards with nothing linking to it. This
 * restores the entry point and gives photos, which never had one, the same.
 *
 * A link rather than a clipboard write, which is what the old strip did too:
 * the destination is a real page with its own OG tags, so landing there and
 * copying the address gives a rich preview — a copied grid URL would not.
 *
 * `yarl__button` is the lightbox's own toolbar class. Borrowing it rather
 * than restyling means this button stays aligned with `close` when the
 * library changes its toolbar metrics.
 */
function ShareButton({ mediaId, label }: { mediaId: number; label: string }) {
  return (
    <a
      className="yarl__button"
      href={`/gallery/m/${mediaId}`}
      aria-label={`分享 ${label}`}
      title="分享"
      data-testid="gallery-share"
    >
      <Share2 className="size-5" />
    </a>
  );
}

/**
 * A video's tile: the box the album computed, filled by the shared tile
 * rather than by an image.
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
      className="relative cursor-pointer"
      data-testid="gallery-video-tile"
      style={{ width: "100%", aspectRatio: `${width} / ${height}` }}
    >
      <VideoPosterTile
        poster={photo.poster}
        label={photo.label}
        data-testid="gallery-video-poster"
      />
    </div>
  );
}

/**
 * The orders on offer, which differ by what the grid is showing.
 *
 * The wall has no curator and no order but time; an album has both. See
 * `arrangeMedia` for why that distinction has to survive the filter shipping,
 * and `WallSort` for why `curated` is the absence of a sort rather than one
 * more of them.
 */
const WALL_SORTS: { value: WallSort; label: string }[] = [
  { value: "newest", label: "最新" },
  { value: "oldest", label: "最舊" },
];

const ALBUM_SORTS: { value: WallSort; label: string }[] = [
  // First, and the default, because it is the album's own order — see
  // WallSort's own note on why `curated` is the absence of a sort.
  { value: "curated", label: "相簿順序" },
  ...WALL_SORTS,
];

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
  const [kind, setKind] = useState<MediaKindFilter>("all");
  // The wall arrives newest-first and an album arrives in its curator's order,
  // so each starts at whatever its incoming list already is — the initial
  // render must not reorder anything.
  const [sort, setSort] = useState<WallSort>(paginated ? "newest" : "curated");
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !cursor) return;
    loadingRef.current = true;
    try {
      const params = new URLSearchParams({
        createdAt: cursor.createdAt,
        src: cursor.src,
        // The server re-arranges per request (it recomputes the whole union
        // anyway — see the route's header), so every page has to say what it
        // is a page OF. Without these the second page comes back unfiltered
        // and unsorted and lands underneath the first.
        kind,
        sort,
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
  }, [cursor, kind, sort]);

  /**
   * A filter changing is a new list, not a filtered old one.
   *
   * In an event handler rather than an effect on `[kind, sort]`, deliberately:
   * an effect would also fire on mount, throwing away the page the server
   * already rendered and re-fetching the identical thing on every first paint
   * of /gallery. The usual fix is a skip-the-first-run ref, which is a way of
   * writing down that the effect was the wrong shape. These values only ever
   * change because somebody clicked, so the click is where the work belongs.
   */
  const applyArrangement = useCallback(
    async (nextKind: MediaKindFilter, nextSort: WallSort) => {
      setKind(nextKind);
      setSort(nextSort);
      if (!paginated) return;

      // Reset before the fetch, not after: the grid must not keep showing
      // photos while 影片 is the selected chip, however briefly.
      setAccumulated([]);
      setCursor(null);
      setIndex(-1);
      loadingRef.current = true;
      try {
        const params = new URLSearchParams({ kind: nextKind, sort: nextSort });
        const response = await fetch(`/api/gallery/wall?${params}`);
        if (!response.ok) return;
        const page = (await response.json()) as {
          items: SiteMediaItem[];
          nextCursor: WallCursor | null;
        };
        setAccumulated(page.items);
        setCursor(page.nextCursor);
      } finally {
        loadingRef.current = false;
      }
    },
    [paginated],
  );

  // An album holds everything it will ever hold, so the same rule the server
  // applies to the wall runs here instead of a round trip. `arrangeMedia` with
  // `curated` returns the list untouched, which is what the first render of an
  // album must be.
  const shown = useMemo(
    () => (paginated ? accumulated : arrangeMedia(items, { kind, sort })),
    [paginated, accumulated, items, kind, sort],
  );

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

  const photos = useMemo(() => toGridPhotos(shown), [shown]);

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
              description: item.description,
            }
          : {
              src: item.src,
              width: item.width,
              height: item.height,
              description: item.description,
            },
      ),
    [photos],
  );

  // What the lightbox is showing right now, which is what its share button
  // must point at. Guarded rather than indexed blindly: `index` is -1 while
  // the lightbox is closed, and a page arriving mid-view can only ever grow
  // the array, never shorten it.
  const openPhoto = index >= 0 ? photos[index] : undefined;

  return (
    <>
      {/*
        Above the empty state, not inside the non-empty branch. A visitor who
        picks 影片 on an album with no videos would otherwise land on a bare
        sentence with no control left on screen to undo it — the filter that
        emptied the grid has to survive emptying it.
      */}
      <div
        className="mb-4 flex flex-wrap items-center gap-3"
        data-testid="gallery-media-filters"
      >
        <div className="flex gap-2">
          <FilterChip
            active={kind === "all"}
            onClick={() => void applyArrangement("all", sort)}
            data-testid="gallery-filter-kind-all"
          >
            {KIND_LABELS.all}
          </FilterChip>
          <FilterChip
            active={kind === "photo"}
            onClick={() => void applyArrangement("photo", sort)}
            data-testid="gallery-filter-kind-photo"
          >
            {KIND_LABELS.photo}
          </FilterChip>
          <FilterChip
            active={kind === "video"}
            onClick={() => void applyArrangement("video", sort)}
            data-testid="gallery-filter-kind-video"
          >
            {KIND_LABELS.video}
          </FilterChip>
        </div>
        <FilterSelect
          label="排序"
          value={sort}
          onChange={(next) => void applyArrangement(kind, next)}
          options={paginated ? WALL_SORTS : ALBUM_SORTS}
          data-testid="gallery-filter-sort"
        />
      </div>

      {photos.length === 0 ? (
        <p
          className="text-sm text-muted-foreground"
          data-testid="gallery-all-photos-empty"
        >
          {/* "還沒有" is a claim about the site, and it is wrong the moment a
              filter is on: a visitor who picked 影片 on an album of photos has
              not discovered that the site has no videos. */}
          {kind === "all" ? "還沒有相片或影片。" : "沒有符合條件的項目。"}
        </p>
      ) : (
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
      )}

      {/* Invisible, and only present at all while there is somewhere to
          scroll to — `paginated && cursor` both drop once the wall is
          exhausted, which stops the observer effect above from re-arming
          against a node that no longer exists. */}
      {paginated && cursor && (
        <div
          ref={sentinelRef}
          aria-hidden="true"
          className="h-px"
          data-testid="gallery-wall-sentinel"
        />
      )}

      <Lightbox
        slides={slides}
        open={index >= 0}
        index={index}
        close={() => setIndex(-1)}
        // Controlled: the share button has to address whatever is on screen
        // now, not whatever was clicked to open the lightbox, so the index
        // follows the viewer's own navigation.
        on={{ view: ({ index: i }) => setIndex(i) }}
        toolbar={{
          buttons: [
            ...(openPhoto
              ? [
                  <ShareButton
                    key="share"
                    mediaId={openPhoto.mediaId}
                    label={openPhoto.label}
                  />,
                ]
              : []),
            "close",
          ],
        }}
        // `showToggle` rather than a caption that cannot be dismissed: the
        // text sits over the picture, and somebody who came to look at the
        // picture has to be able to get it out of the way. `hidden` is left
        // false so a caption somebody wrote is seen at least once.
        captions={{ showToggle: true, descriptionTextAlign: "start" }}
        plugins={[Captions, Fullscreen, Slideshow, Thumbnails, Video, Zoom]}
      />
    </>
  );
}

export default MediaGrid;
