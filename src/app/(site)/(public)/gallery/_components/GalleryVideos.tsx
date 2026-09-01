"use client";

import Link from "next/link";
import { Share2 } from "lucide-react";
import type { SiteVideo } from "@/lib/content-types";
import { mediaDisplayName } from "@/lib/media-name";
import { StreamVideoPlayer } from "@/components/stream-video-player";

type GalleryVideosProps = {
  videos: SiteVideo[];
  // Optional: when this strip is rendered inside one album, its share links
  // stay inside that album (/gallery/[slug]/v/[videoId]) so the page a reader
  // lands on can offer a way back to it. Without a slug the link falls back to
  // /gallery/m/[mediaId], which resolves the video on its own.
  gallerySlug?: string;
  /** Compact strip for gallery index; full width on detail */
  compact?: boolean;
};

export function GalleryVideos({
  videos,
  gallerySlug,
  compact = false,
}: GalleryVideosProps) {
  if (!videos?.length) return null;

  return (
    <div
      className={
        compact
          ? "flex gap-3 overflow-x-auto pb-1"
          : "flex flex-col gap-6"
      }
    >
      {videos.map((video, index) => {
        // Falls back to the media id when there is no album around this
        // video. That is the whole reason /gallery/m/[mediaId] exists: the
        // album-scoped route needs a slug, and a member's own upload is in no
        // album, so this used to render no share button at all. Points at
        // /gallery/m/ directly rather than the old /gallery/v/ — that path is
        // now just a compatibility redirect for links already shared under it.
        const shareHref = gallerySlug
          ? `/gallery/${gallerySlug}/v/${video.id}`
          : `/gallery/m/${video.mediaId}`;
        const label = mediaDisplayName(video);

        return (
          <div
            key={video.src}
            className={
              compact
                ? "shrink-0 w-[min(100%,420px)] overflow-hidden border border-border bg-black"
                : "w-full overflow-hidden border border-border bg-black"
            }
          >
            <StreamVideoPlayer
              video={video}
              compact={compact}
              className={
                compact
                  ? "aspect-video h-[160px] w-full object-contain"
                  : "aspect-video w-full"
              }
            />
            <div
              className={
                compact
                  ? "flex items-center justify-between gap-2 px-2 py-1"
                  : "flex items-center justify-between gap-2 px-3 py-2"
              }
            >
              <p className="truncate text-xs opacity-70">{label}</p>
              {shareHref && (
                <Link
                  href={shareHref}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-white/80 transition-opacity hover:bg-white/10 hover:text-white"
                  aria-label={`分享 ${label}`}
                  title="分享视频"
                >
                  <Share2 className="size-3.5" />
                  {!compact && <span>分享</span>}
                </Link>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default GalleryVideos;
