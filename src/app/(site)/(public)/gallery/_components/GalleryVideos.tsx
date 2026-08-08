"use client";

import Link from "next/link";
import { Share2 } from "lucide-react";
import type { SiteVideo } from "@/lib/content-types";
import { StreamVideoPlayer } from "@/components/stream-video-player";

type GalleryVideosProps = {
  videos: SiteVideo[];
  // Optional: the share page (/gallery/[slug]/v/[videoId]) only resolves a
  // video by looking it up inside a specific gallery's own videos[] array —
  // a video reached only via a race tag (no gallery membership) has no
  // slug to build that link with, and no share link renders for it.
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
        const shareHref = gallerySlug ? `/gallery/${gallerySlug}/v/${video.id}` : undefined;

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
              <p className="truncate text-xs opacity-70">{video.filename}</p>
              {shareHref && (
                <Link
                  href={shareHref}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-white/80 transition-opacity hover:bg-white/10 hover:text-white"
                  aria-label={`分享 ${video.filename}`}
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
