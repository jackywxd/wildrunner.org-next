"use client";

import { Play } from "lucide-react";
import { useState } from "react";

/**
 * A short screen recording in the member help page, shown as its poster with
 * a play button until somebody asks for it.
 *
 * The poster-and-button rather than a bare `<video controls>`: seven clips on
 * one page, each a megabyte, would all start loading on a phone that opened
 * the page to read one paragraph. Nothing is fetched until the tap
 * (`preload="none"` after it too, until the element exists). Muted and
 * `playsInline` so iOS plays it where it is instead of going full screen —
 * the recordings have no sound to lose.
 *
 * The clips are WebM because the repository keeps MP4 in Git LFS and every
 * deploy checks out without LFS (see public/help/README.md). Safari has
 * played WebM since iOS 17.4; the poster and the steps written beside every
 * clip are the fallback for anything older.
 */
export function HelpClip({
  src,
  poster,
  title,
  duration,
  start = 0,
}: {
  src: string;
  poster: string;
  title: string;
  /** Shown on the button, e.g. "0:25", so a reader knows the cost of a tap. */
  duration: string;
  /**
   * Seconds to skip. Each recording opens on the page loading — up to nine
   * seconds of white — and there is no encoder in the pipeline to trim it,
   * so playback starts past it with a media fragment (`#t=`).
   */
  start?: number;
}) {
  const [playing, setPlaying] = useState(false);

  return (
    <figure className="my-4">
      <div className="relative mx-auto aspect-[390/844] max-h-[70dvh] w-full max-w-[300px] overflow-hidden border border-border bg-secondary">
        {playing ? (
          <video
            autoPlay
            className="h-full w-full object-contain"
            controls
            data-testid="help-clip-video"
            muted
            playsInline
            poster={poster}
            src={start ? `${src}#t=${start}` : src}
          />
        ) : (
          <button
            aria-label={`播放影片：${title}（${duration}）`}
            className="group relative block h-full w-full"
            data-testid="help-clip-play"
            onClick={() => setPlaying(true)}
            type="button"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a static poster from public/help; the image loader is for media, not bundled assets */}
            <img alt="" className="h-full w-full object-cover" loading="lazy" src={poster} />
            <span className="absolute inset-0 bg-foreground/25 transition-colors group-hover:bg-foreground/35" />
            <span className="absolute left-1/2 top-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[9999px] bg-primary text-primary-foreground shadow-lg">
              <Play aria-hidden className="ml-1 size-8" fill="currentColor" />
            </span>
            <span className="absolute bottom-2 right-2 bg-foreground/80 px-2 py-0.5 text-tag font-medium tabular-nums text-background">
              ▶ {duration}
            </span>
          </button>
        )}
      </div>
      <figcaption className="mt-2 text-center text-sm text-muted-foreground">
        影片示範：{title}
      </figcaption>
    </figure>
  );
}
