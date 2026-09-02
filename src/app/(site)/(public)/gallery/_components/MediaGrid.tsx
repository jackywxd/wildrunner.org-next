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

import { Music, Share2, VolumeX } from "lucide-react";
import PhotoAlbum, {
  type Photo,
  type RenderImageContext,
} from "react-photo-album";
import type { SiteMediaItem } from "@/lib/content-types";
import type { MediaKindFilter } from "@/lib/media/filters";
import {
  arrangeMedia,
  type RaceFilterOption,
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
import { SlideshowMusic } from "@/components/gallery/SlideshowMusic";
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

/** The 賽事 select's "no filter" value — a string, because a `<select>` has
 *  no other kind of value, and `null` is what the arrangement wants. */
const ANY_RACE = "";

/**
 * Where a visitor's "I do not want the music" survives to.
 *
 * `sessionStorage`, not state and not `localStorage`. Not state, because a
 * visitor who muted one album and opened another should not have to mute it
 * again — that is the same decision, not a new one. Not `localStorage`,
 * because a preference expressed once should not silence every album a year
 * later on a machine they have forgotten about; a tab is the right lifetime
 * for "not right now".
 */
const MUTE_KEY = "wr:gallery-music-muted";

function readMuted(): boolean {
  try {
    return window.sessionStorage.getItem(MUTE_KEY) === "1";
  } catch {
    // Private windows and blocked site data both throw on access rather than
    // returning null. Not knowing the preference means playing, which is what
    // an album with music is for.
    return false;
  }
}

function writeMuted(muted: boolean) {
  try {
    window.sessionStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // Losing the preference is a smaller failure than refusing the click.
  }
}

/**
 * The mute control, and the only reason background music is allowed at all.
 *
 * WCAG 1.4.2: any audio that plays for more than three seconds must have a
 * way to stop it. A slideshow is minutes long, so this is not a courtesy — it
 * is the condition on the feature. It borrows `yarl__button` so it stays
 * aligned with the lightbox's own toolbar the way `ShareButton` does.
 *
 * `data-playing` is what a test can read: whether *we* believe music should
 * be sounding. Deliberately not a claim about YouTube's player — that is the
 * vendor's, over the network, and asserting it would make the suite depend on
 * reaching youtube-nocookie.com.
 */
function MusicButton({
  playing,
  onToggle,
}: {
  playing: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="yarl__button"
      onClick={onToggle}
      aria-label={playing ? "關閉背景音樂" : "播放背景音樂"}
      title={playing ? "關閉背景音樂" : "播放背景音樂"}
      data-testid="gallery-music-toggle"
      data-playing={playing}
    >
      {playing ? <Music className="size-5" /> : <VolumeX className="size-5" />}
    </button>
  );
}

export function MediaGrid({
  items,
  musicVideoId = null,
  nextCursor,
  races = [],
  targetRowHeight = 220,
}: {
  items: SiteMediaItem[];
  /**
   * The YouTube id this album plays behind its slideshow, if an admin set one.
   *
   * Album pages only. The wall has no album and therefore no music, and a
   * virtual race album has no row to store one on — see
   * `src/lib/race-gallery.ts`.
   */
  musicVideoId?: string | null;
  /**
   * The races present in what this grid is showing.
   *
   * Empty means no control is drawn, which is the right answer for a grid
   * whose items carry no race at all — and the state a freshly seeded
   * database is in. Passed in rather than derived here because deriving it
   * needs the editions' *names*, which only the server has; the items carry
   * ids alone, on purpose (see `SitePhoto.raceEditionId`).
   */
  races?: RaceFilterOption[];
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

  /**
   * Whether the visitor has silenced the music. Read from `sessionStorage`
   * lazily rather than in an effect: an effect would render once unmuted and
   * then correct itself, which for audio means a burst of sound the visitor
   * already said they did not want.
   */
  const [muted, setMuted] = useState(() =>
    typeof window === "undefined" ? false : readMuted(),
  );
  /** Whether the slideshow is running — the thing the music follows. */
  const [slideshowRunning, setSlideshowRunning] = useState(false);

  const [accumulated, setAccumulated] = useState<SiteMediaItem[]>(items);
  const [cursor, setCursor] = useState<WallCursor | null>(nextCursor ?? null);
  const [kind, setKind] = useState<MediaKindFilter>("all");
  const [race, setRace] = useState<number | null>(null);
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
        ...(race === null ? {} : { race: String(race) }),
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
  }, [cursor, kind, sort, race]);

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
    async (
      nextKind: MediaKindFilter,
      nextSort: WallSort,
      nextRace: number | null,
    ) => {
      setKind(nextKind);
      setSort(nextSort);
      setRace(nextRace);
      if (!paginated) return;

      // Reset before the fetch, not after: the grid must not keep showing
      // photos while 影片 is the selected chip, however briefly.
      setAccumulated([]);
      setCursor(null);
      setIndex(-1);
      loadingRef.current = true;
      try {
        const params = new URLSearchParams({
          kind: nextKind,
          sort: nextSort,
          ...(nextRace === null ? {} : { race: String(nextRace) }),
        });
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
    () => (paginated ? accumulated : arrangeMedia(items, { kind, sort, race })),
    [paginated, accumulated, items, kind, sort, race],
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

  /**
   * The four conditions the music waits on, in one expression rather than
   * spread over effects that each set a flag.
   *
   * `openPhoto?.kind !== "video"` is the one that is easy to miss and
   * impossible to ignore once heard: a video slide plays its own sound, and
   * two audio tracks at once is not background music, it is a fault. Leaving
   * the video resumes the album's track — from the beginning, which is the
   * cost `SlideshowMusic`'s header names.
   */
  const musicPlaying =
    Boolean(musicVideoId) &&
    !muted &&
    index >= 0 &&
    slideshowRunning &&
    openPhoto?.kind !== "video";

  /**
   * The toggle both mutes and starts.
   *
   * Muting while it plays is the WCAG requirement. Un-muting *before* the
   * slideshow has been started is the other half: a visitor who pressed the
   * music button expects music, and telling them to go and press a different
   * button first would be a control that does nothing.
   */
  const toggleMusic = useCallback(() => {
    setMuted((wasMuted) => {
      const nextMuted = !wasMuted;
      writeMuted(nextMuted);
      if (!nextMuted) setSlideshowRunning(true);
      return nextMuted;
    });
  }, []);

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
            onClick={() => void applyArrangement("all", sort, race)}
            data-testid="gallery-filter-kind-all"
          >
            {KIND_LABELS.all}
          </FilterChip>
          <FilterChip
            active={kind === "photo"}
            onClick={() => void applyArrangement("photo", sort, race)}
            data-testid="gallery-filter-kind-photo"
          >
            {KIND_LABELS.photo}
          </FilterChip>
          <FilterChip
            active={kind === "video"}
            onClick={() => void applyArrangement("video", sort, race)}
            data-testid="gallery-filter-kind-video"
          >
            {KIND_LABELS.video}
          </FilterChip>
        </div>
        <FilterSelect
          label="排序"
          value={sort}
          onChange={(next) => void applyArrangement(kind, next, race)}
          options={paginated ? WALL_SORTS : ALBUM_SORTS}
          data-testid="gallery-filter-sort"
        />
        {/* Only when there is something to choose between. A select holding
            one option is a control that cannot change the answer. */}
        {races.length > 0 && (
          <FilterSelect
            label="賽事"
            value={race === null ? ANY_RACE : String(race)}
            onChange={(next) =>
              void applyArrangement(
                kind,
                sort,
                next === ANY_RACE ? null : Number(next),
              )
            }
            options={[
              { value: ANY_RACE, label: "所有比賽" },
              ...races.map((option) => ({
                value: String(option.id),
                label: `${option.label}（${option.count}）`,
              })),
            ]}
            data-testid="gallery-filter-race"
          />
        )}
      </div>

      {photos.length === 0 ? (
        <p
          className="text-sm text-muted-foreground"
          data-testid="gallery-all-photos-empty"
        >
          {/* "還沒有" is a claim about the site, and it is wrong the moment a
              filter is on: a visitor who picked 影片 on an album of photos has
              not discovered that the site has no videos. */}
          {kind === "all" && race === null
            ? "還沒有相片或影片。"
            : "沒有符合條件的項目。"}
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
        on={{
          view: ({ index: i }) => setIndex(i),
          // The music follows the slideshow, which is what "背景音樂" means —
          // and it is also what makes the sound legal to start: these fire
          // from the visitor pressing the lightbox's own play button, so the
          // page has the user activation an autoplaying frame needs.
          slideshowStart: () => setSlideshowRunning(true),
          slideshowStop: () => setSlideshowRunning(false),
          // Closing is not a pause. Leaving the lightbox with music still
          // playing behind the page would be the worst version of this
          // feature.
          exiting: () => setSlideshowRunning(false),
        }}
        toolbar={{
          buttons: [
            ...(musicVideoId
              ? [
                  <MusicButton
                    key="music"
                    playing={musicPlaying}
                    onToggle={toggleMusic}
                  />,
                ]
              : []),
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

      {/* Outside the lightbox, so closing it unmounts this through
          `musicPlaying` going false rather than through the portal being torn
          down — one rule deciding the sound, not two. */}
      {musicVideoId && (
        <SlideshowMusic videoId={musicVideoId} playing={musicPlaying} />
      )}
    </>
  );
}

export default MediaGrid;
