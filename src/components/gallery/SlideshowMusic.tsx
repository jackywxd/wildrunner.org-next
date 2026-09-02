"use client";

import { youTubeEmbedUrl } from "@/lib/youtube";

/**
 * An album's background music, playing or not playing.
 *
 * MOUNTED TO PLAY, UNMOUNTED TO STOP. There is no player object here and no
 * `postMessage` protocol: `playing` decides whether the iframe exists at all,
 * and an iframe that exists carries `autoplay=1`.
 *
 * That is a deliberate choice against two alternatives that both looked
 * better on paper:
 *
 *   - YouTube's **IFrame Player API** (`https://www.youtube.com/iframe_api`)
 *     gives real play/pause on one player. It also means loading a script
 *     from `youtube.com` on a page that otherwise talks only to
 *     `youtube-nocookie.com` — and the whole reason `youTubeEmbedUrl` picks
 *     the quieter host (src/lib/youtube.ts) is that this site shows no cookie
 *     banner. Paying for pause with a third-party script is the wrong trade.
 *   - **`postMessage` with `enablejsapi=1`** and no API script is the popular
 *     middle road, and it is an undocumented handshake whose behaviour on
 *     `youtube-nocookie.com` this repo would be guessing at. A player that
 *     silently ignores commands looks exactly like one that is working — the
 *     failure this codebase keeps writing down.
 *
 * WHAT THE CHOICE COSTS, said plainly: stopping and starting again restarts
 * the track from the beginning rather than resuming. For music behind a
 * slideshow that is a small thing, and it is visible rather than mysterious.
 *
 * WHY AUTOPLAY IS ALLOWED TO MAKE SOUND. `playing` only ever becomes true as
 * a direct result of a click — pressing the lightbox's own slideshow button,
 * or the music toggle beside it. The browser's autoplay policy grants a page
 * with user activation the right to start audio, and `allow="autoplay"`
 * delegates that to the frame. Nothing here plays on load.
 *
 * `aria-hidden` and off-screen rather than `display: none`: a hidden iframe is
 * a documented target for browser throttling, and this one has to keep
 * running while the visitor looks at photos. It draws nothing — the player
 * chrome is off and the box is one pixel — so it is scenery, not content.
 */
export function SlideshowMusic({
  videoId,
  playing,
}: {
  videoId: string;
  playing: boolean;
}) {
  if (!playing) return null;

  // Built from the id, never from anything stored — see src/lib/youtube.ts.
  // `loop` needs `playlist` set to the same id; that is YouTube's own rule for
  // looping a single video rather than a trick.
  const src = `${youTubeEmbedUrl(videoId)}?autoplay=1&loop=1&playlist=${videoId}&controls=0&playsinline=1`;

  return (
    <iframe
      data-testid="slideshow-music"
      data-video-id={videoId}
      title="相簿背景音樂"
      src={src}
      allow="autoplay"
      aria-hidden="true"
      tabIndex={-1}
      className="pointer-events-none fixed left-0 top-0 h-px w-px opacity-0"
    />
  );
}
