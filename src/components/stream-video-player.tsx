"use client";

import type { SiteVideo } from "@/lib/content-types";
import { mediaDisplayName } from "@/lib/media-name";
import { streamIframeSrc } from "@/lib/stream";

type StreamVideoPlayerProps = {
  video: SiteVideo;
  className?: string;
  compact?: boolean;
};

/**
 * Plays a gallery video, preferring Cloudflare Stream when the media has
 * been ingested and falling back to the original R2 file otherwise.
 *
 * The R2 path is the normal case right now: Stream is a paid per-minute
 * product and isn't in use, so `streamId` is null for every video. R2
 * serves them over HTTP with range support, which is enough for a browser's
 * native player — no adaptive bitrate, but no transcoding bill either. The
 * Stream branch is kept because ingesting later only requires filling in
 * `streamId`; nothing here needs to change.
 */
export function StreamVideoPlayer({
  video,
  className,
  compact = false,
}: StreamVideoPlayerProps) {
  const streamSrc = streamIframeSrc(video.streamId);
  const label = mediaDisplayName(video);
  const sizing = compact
    ? "aspect-video h-[160px] w-full"
    : "aspect-video w-full min-h-[240px]";

  if (video.streamId && video.streamReady && streamSrc) {
    return (
      <iframe
        src={streamSrc}
        title={label}
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        loading={compact ? "lazy" : undefined}
        className={className ?? sizing}
      />
    );
  }

  if (video.src) {
    return (
      <video
        data-testid="direct-video"
        src={video.src}
        controls
        playsInline
        // The compact strip is the gallery *index*, which renders every video
        // of every gallery — 108 of them today. `preload="metadata"` there
        // makes the browser open a request per video and holds the window
        // `load` event open indefinitely. It went unnoticed while the site
        // client-rendered everything (the strip mounted after `load` had
        // already fired); once the tree server-renders, it stalls the page.
        // The detail view shows one video and still preloads metadata so the
        // duration and first frame are there before play.
        preload={compact ? "none" : "metadata"}
        className={className ?? sizing}
      >
        <a href={video.src}>{label}</a>
      </video>
    );
  }

  // Ingested into Stream but still transcoding, and no original to fall
  // back on.
  return (
    <div
      className={
        className ??
        "flex aspect-video w-full items-center justify-center text-white"
      }
      data-testid="stream-processing"
    >
      视频正在转码，请稍后再试。
    </div>
  );
}
