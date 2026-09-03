"use client";

import { createPortal } from "react-dom";

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
 * WHY IT IS VISIBLE, WHICH IT WAS NOT AT FIRST. This started as a 1×1,
 * transparent, `pointer-events: none` frame — audio with no UI. On a Mac that
 * worked; on an iPhone it was silent, which is the report that produced this
 * paragraph. iOS grants the right to make sound to a gesture that lands on the
 * media itself, and does not hand a parent page's gesture to a cross-origin
 * frame; a frame that is one pixel wide, transparent and untappable is one the
 * required gesture can never reach. So the player is a real, visible,
 * tappable thing now: on a desktop it starts on its own exactly as before, and
 * on a phone the visitor taps YouTube's own play button once.
 *
 * This is the fix for a mechanism inferred from the platform's rules, not one
 * measured here — nothing in this repository can hear an iPhone. What makes it
 * safe to ship anyway is that it costs a desktop nothing, and that the tap it
 * enables is itself the experiment: if sound still does not come on iOS, the
 * cause is not this.
 *
 * `controls=1`, unlike the hidden version's `controls=0`. A player somebody
 * may need to press has to show what it is and offer a way to press it, and
 * the volume control it brings is the finer-grained answer to "quieter" that
 * the lightbox's own mute button cannot give.
 */
export function SlideshowMusic({
  videoId,
  playing,
  title = "相簿背景音樂",
}: {
  videoId: string;
  playing: boolean;
  /**
   * What the frame is called, for anyone reading the page with a screen
   * reader or looking at the accessibility tree.
   *
   * A prop since an article reads itself aloud over this too, and "相簿背景
   * 音樂" on an article page would be a small lie in the one place a blind
   * visitor has to trust. Defaulted rather than required so the album pages
   * that already pass neither keep working unchanged.
   */
  title?: string;
}) {
  // `playing` only ever becomes true from a click, so this never renders on
  // the server and `document` is always there by the time it does. Guarded
  // anyway, because a component that assumes that is one refactor away from
  // crashing the whole page during SSR.
  if (!playing || typeof document === "undefined") return null;

  // Built from the id, never from anything stored — see src/lib/youtube.ts.
  // `loop` needs `playlist` set to the same id; that is YouTube's own rule for
  // looping a single video rather than a trick.
  const src = `${youTubeEmbedUrl(videoId)}?autoplay=1&loop=1&playlist=${videoId}&controls=1&playsinline=1`;

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
        title={title}
        src={src}
        allow="autoplay"
        className="block aspect-video w-full border-0"
      />
    </div>,
    document.body,
  );
}
