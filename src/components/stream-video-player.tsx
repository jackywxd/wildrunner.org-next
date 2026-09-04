"use client";

import type { CSSProperties, RefObject } from "react";
import type { SiteVideo } from "@/lib/content-types";
import { mediaDisplayName } from "@/lib/media-name";
import { streamIframeSrc } from "@/lib/stream";

type StreamVideoPlayerProps = {
  video: SiteVideo;
  className?: string;
  compact?: boolean;
  /**
   * What to say while Cloudflare Stream is still transcoding.
   *
   * A required prop, not a dictionary read, for the same reason as
   * `YouTubeEmbed`'s `title`: this player renders under `(public)`, under the
   * member dashboard, and under `(print)` — and only the first of those has a
   * `DictionaryProvider` above it. `useDictionary()` here threw
   * `V-PICKFRAME-T2` on CI, in the member media dialog, which is a tree the
   * public site's provider has never wrapped.
   */
  transcodingLabel: string;
  /**
   * Passed straight through to whichever element is rendered.
   *
   * Needed because Payload's JSX converter wraps whatever a converter returns
   * in `React.cloneElement(node, { key, style })`, with `style` derived from
   * the Lexical node's own `format` and `indent`. `next/image` accepts a
   * `style` prop, so the image branch of the rich-text `upload` converter has
   * always honoured alignment; without this, a centred or indented video
   * would silently lose it.
   */
  style?: CSSProperties;
  /**
   * Handed through to the `<video>` element on the R2 path, so a caller can
   * read what the member is actually looking at — `currentTime` is the only
   * place the chosen poster frame exists (MediaDetailDialog).
   *
   * Deliberately not forwarded to the Stream `<iframe>` branch: an iframe on
   * another origin exposes no playback position, so a caller holding this ref
   * gets `null` there and must say the feature is unavailable rather than
   * guess a time. `streamId` is null for every video today, so that branch is
   * theoretical — but silently reading 0 would not be.
   */
  videoRef?: RefObject<HTMLVideoElement | null>;
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
  style,
  transcodingLabel,
  videoRef,
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
        style={style}
      />
    );
  }

  if (video.src) {
    return (
      <video
        ref={videoRef}
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
        style={style}
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
      style={style}
    >
      {transcodingLabel}
    </div>
  );
}
