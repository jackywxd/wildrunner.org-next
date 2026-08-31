"use client";

import { useEffect, useMemo, useState } from "react";
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

/** Paint the first screenful immediately, then swap the rest in. */
const SEED_COUNT = 24;

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
  targetRowHeight = 220,
}: {
  items: SiteMediaItem[];
  targetRowHeight?: number;
}) {
  const [index, setIndex] = useState(-1);

  const all = useMemo(() => toGridPhotos(items), [items]);
  const [shown, setShown] = useState<GridPhoto[]>(() => all.slice(0, SEED_COUNT));

  useEffect(() => {
    setShown(all.slice(0, SEED_COUNT));
    if (all.length <= SEED_COUNT) return;
    const timer = setTimeout(() => setShown(all), 100);
    return () => clearTimeout(timer);
  }, [all]);

  // The lightbox indexes into exactly what the grid shows, so the two cannot
  // drift while the second stage is still pending.
  const slides: Slide[] = useMemo(
    () =>
      shown.map((item) =>
        item.kind === "video"
          ? {
              type: "video" as const,
              width: item.width,
              height: item.height,
              sources: [{ src: item.src, type: item.mimeType ?? "video/mp4" }],
            }
          : { src: item.src, width: item.width, height: item.height },
      ),
    [shown],
  );

  if (shown.length === 0) {
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
        photos={shown}
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
