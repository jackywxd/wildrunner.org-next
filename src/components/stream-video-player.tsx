"use client";

import type { SiteVideo } from "@/lib/content-types";
import { streamIframeSrc } from "@/lib/stream";

type StreamVideoPlayerProps = {
  video: SiteVideo;
  className?: string;
  compact?: boolean;
};

export function StreamVideoPlayer({
  video,
  className,
  compact = false,
}: StreamVideoPlayerProps) {
  const streamSrc = streamIframeSrc(video.streamId);

  if (!video.streamId || !video.streamReady) {
    return (
      <div
        className={
          className ??
          "flex aspect-video w-full items-center justify-center text-white"
        }
        data-testid="stream-processing"
      >
        视频正在由 Cloudflare Stream 转码，请稍后再试。
      </div>
    );
  }

  if (streamSrc) {
    return (
      <iframe
        src={streamSrc}
        title={video.filename}
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        className={
          className ??
          (compact
            ? "aspect-video h-[160px] w-full"
            : "aspect-video w-full min-h-[240px]")
        }
      />
    );
  }

  return null;
}
