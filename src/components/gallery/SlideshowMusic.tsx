"use client";

import { createPortal } from "react-dom";

import { youTubeEmbedUrl } from "@/lib/youtube";

/**
 * An album's background music: a playlist, playing or not playing.
 *
 * MOUNTED TO PLAY, UNMOUNTED TO STOP, and re-mounted to change track. There is
 * no player object here and no `postMessage` protocol: `playing` decides
 * whether the iframe exists at all, `index` decides which track it starts on,
 * and an iframe that exists carries `autoplay=1`.
 *
 * That is a deliberate choice against two alternatives that both looked
 * better on paper:
 *
 *   - YouTube's **IFrame Player API** (`https://www.youtube.com/iframe_api`)
 *     gives real play/pause, `nextVideo()` and a resumable position. It also
 *     means loading a script from `youtube.com` on a page that otherwise talks
 *     only to `youtube-nocookie.com` — and the whole reason `youTubeEmbedUrl`
 *     picks the quieter host (src/lib/youtube.ts) is that this site shows no
 *     cookie banner.
 *   - **`postMessage` with `enablejsapi=1`** and no API script is the popular
 *     middle road, and it is an undocumented handshake whose behaviour on
 *     `youtube-nocookie.com` this repo would be guessing at. A player that
 *     silently ignores commands looks exactly like one that is working — the
 *     failure this codebase keeps writing down.
 *
 * WHAT THE CHOICE COSTS, said plainly: every stop and start begins a track
 * from zero, and so does every skip. For a playlist behind a slideshow that
 * is a small thing — a skip is *meant* to start something — and it is visible
 * rather than mysterious.
 *
 * WHY IT IS VISIBLE. This started as a 1×1, transparent, `pointer-events:
 * none` frame — audio with no UI. On a Mac that worked; on an iPhone it was
 * silent. iOS grants the right to make sound to a gesture that lands on the
 * media itself and does not hand a parent page's gesture to a cross-origin
 * frame, so a frame that is one pixel wide, transparent and untappable is one
 * the required gesture can never reach. Making it real and tappable is what
 * gives that gesture somewhere to land. **That has not fixed iOS as of this
 * writing** — the report is that the player appears and does not start — so
 * the mechanism above is at best incomplete. It is kept because it costs a
 * desktop nothing and because a tappable player is the precondition for any
 * fix that does work.
 *
 * `controls=1`: a player somebody may need to press has to show what it is,
 * and the volume control it brings is the finer answer to "quieter" that the
 * lightbox's mute button cannot give.
 */
export function SlideshowMusic({
  playlist,
  index,
  playing,
}: {
  /** YouTube ids, in order. Never URLs — see `SiteGallery.musicPlaylist`. */
  playlist: string[];
  /** Which one to start on. Out-of-range is treated as nothing to play. */
  index: number;
  playing: boolean;
}) {
  const videoId = playlist[index];

  // `playing` only ever becomes true from a click, so this never renders on
  // the server and `document` is always there by the time it does. Guarded
  // anyway, because a component that assumes that is one refactor away from
  // crashing the whole page during SSR.
  if (!playing || !videoId || typeof document === "undefined") return null;

  /**
   * The rest of the list, so YouTube advances on its own when a track ends.
   *
   * `playlist=` is YouTube's own parameter for "play these after the one in
   * the path", and it is the same parameter the single-track version used to
   * make `loop=1` loop one video — that trick is this feature generalised
   * rather than a separate mechanism. The current track is repeated at the end
   * so the list wraps back to where the album started instead of stopping.
   */
  const queue = [
    ...playlist.slice(index + 1),
    ...playlist.slice(0, index),
    videoId,
  ];
  const src = `${youTubeEmbedUrl(videoId)}?autoplay=1&loop=1&playlist=${queue.join(",")}&controls=1&playsinline=1`;

  return createPortal(
    <div
      data-testid="slideshow-music-panel"
      /**
       * Above the lightbox, which sets `--yarl__portal_zindex` to 9999.
       *
       * A z-index alone was not enough, and the reason is the whole point of
       * the `createPortal` above: rendered in place, this sits inside the
       * gallery page's own subtree, and an ancestor there — the page
       * transition's `transform` — makes a stacking context that traps every
       * z-index below it. The frame was on screen and at full opacity, and a
       * hit test at its centre still returned the lightbox: visible, and
       * untappable, which is precisely the state that made iOS silent in the
       * first place. Portalled to `body`, the two z-indexes are finally
       * compared against each other.
       *
       * Top-left because that is the one free corner: the toolbar (close,
       * share, music, captions) is top-right, the navigation arrows are
       * centred on both sides, and the thumbnail strip owns the bottom band.
       */
      className="fixed left-3 top-3 z-[10000] w-40 overflow-hidden rounded border border-white/20 bg-black/70 shadow-lg sm:w-48"
    >
      <iframe
        data-testid="slideshow-music"
        data-video-id={videoId}
        data-track={index}
        title="相簿背景音樂"
        // `key` on the id, not just `src`: React reuses an <iframe> whose type
        // and position match and only patches attributes, and a patched `src`
        // does not reliably restart a cross-origin frame. Keying forces a new
        // element per track, which is what "skip" has to mean here.
        key={videoId}
        src={src}
        // `encrypted-media` alongside `autoplay`, matching the article embed
        // (src/components/youtube-embed.tsx). YouTube's player asks for it,
        // and a permission it is refused is one more thing between a tap and
        // a sound on a platform where that path is already fragile.
        allow="autoplay; encrypted-media"
        className="block aspect-video w-full border-0"
      />
      {/*
        Only on a touch device — `touch:` is that media query, named in
        tailwind.config.ts. No user-agent sniffing.

        On a desktop the frame starts on its own and a "tap to play" label
        would be a lie. On a phone it does not: iOS gives the right to make
        sound to a gesture on the media itself, so the player waits for one,
        and until this line existed there was nothing on screen saying so.
        Whether the tap then works is the open question this makes it possible
        for somebody to answer — see the component header.
      */}
      <p
        data-testid="slideshow-music-hint"
        className="hidden px-2 py-1 text-center text-[11px] leading-tight text-white/70 touch:block"
      >
        點一下播放器開始音樂
      </p>
    </div>,
    document.body,
  );
}
