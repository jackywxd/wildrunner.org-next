"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp } from "lucide-react";

import { youTubeEmbedUrl } from "@/lib/youtube";
import { useDictionary } from "@/components/i18n/dictionary-provider";

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
 * from zero, and so does every skip.
 *
 * ── WHY THE PLAYER IS THIS SIZE, WHICH IS THE WHOLE iOS STORY ──
 *
 * MEASURED IN THE iOS SIMULATOR (iPhone SE, iOS Safari), not inferred:
 *
 *   160 × 90   the player renders its poster and play button, and **a tap on
 *              it does nothing at all**. No playback, no error, no response.
 *   224 × 126  a tap starts playback, with audio.
 *   288 × 162  likewise.
 *
 * So the reason an iPhone was silent is that the embed was too small for
 * YouTube's player to be interactive — nothing to do with autoplay policy,
 * user activation, or cross-origin gesture propagation, which is what the
 * previous three versions of this comment assumed and built around. Those
 * inferences were reasonable and they were wrong; this paragraph replaces
 * them because a measurement outranks an argument. YouTube documents a
 * minimum embed size and this is what being under it looks like.
 *
 * A desktop never showed the symptom because it never needed the tap:
 * `autoplay=1` is honoured there, so the player starts before anyone touches
 * it and its size is irrelevant.
 *
 * WHICH IS WHY THE SIZE IS CONDITIONAL. On a touch device the player has to
 * be big enough to press, and it therefore sits over the photo — the cost of
 * working at all. On a pointer device nothing has to be pressed, so it starts
 * collapsed and stays out of the way. Either way the visitor can toggle it:
 * collapsing does not unmount the frame, so the music keeps playing.
 *
 * IT CANNOT GO BEHIND THE LIGHTBOX. That was asked, and it is the one thing
 * that cannot work: behind means untappable, and untappable is the state that
 * produced silence on every iPhone. `collapsed` is the answer to the same
 * concern — small and in a corner, rather than absent and mute.
 */
export function SlideshowMusic({
  playlist,
  index,
  playing,
  title,
}: {
  /** YouTube ids, in order. Never URLs — see `SiteGallery.musicPlaylist`. */
  playlist: string[];
  /** Which one to start on. Out-of-range is treated as nothing to play. */
  index: number;
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
  const t = useDictionary();
  /**
   * Collapsed unless the visitor has to press the player to start it.
   *
   * Read once, lazily, rather than in an effect: an effect would render
   * collapsed and then expand, and on the one platform where the expansion is
   * load-bearing that is a player that moves out from under a finger.
   *
   * `matchMedia` rather than a user-agent test, and the same query the hint
   * below uses — a device that cannot hover and points coarsely.
   */
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return true;
    return !window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  });

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
      data-collapsed={collapsed}
      /**
       * Above the lightbox, which sets `--yarl__portal_zindex` to 9999.
       *
       * A z-index alone was not enough, and the reason is the whole point of
       * the `createPortal` above: rendered in place, this sits inside the
       * gallery page's own subtree, and an ancestor there — the page
       * transition's `transform` — makes a stacking context that traps every
       * z-index below it. The frame was on screen and at full opacity, and a
       * hit test at its centre still returned the lightbox: visible, and
       * untappable. Portalled to `body`, the two z-indexes are finally
       * compared against each other.
       *
       * Top-left because that is the one free corner: the toolbar (close,
       * share, music, captions) is top-right, the navigation arrows are
       * centred on both sides, and the thumbnail strip owns the bottom band.
       */
      className={`fixed left-3 top-3 z-[10000] overflow-hidden rounded border border-white/20 bg-black/70 shadow-lg ${
        // 224px, because 160px is a player that cannot be tapped — see the
        // header's measurements. Collapsed is small enough to ignore and
        // still wide enough for its own label.
        collapsed ? "w-32" : "w-56"
      }`}
    >
      <iframe
        data-testid="slideshow-music"
        data-video-id={videoId}
        data-track={index}
        // The caller's name for the frame, not a constant: an article reads
        // itself aloud over this player too. See the prop's own note.
        title={title}
        // `key` on the id, not just `src`: React reuses an <iframe> whose type
        // and position match and only patches attributes, and a patched `src`
        // does not reliably restart a cross-origin frame. Keying forces a new
        // element per track, which is what "skip" has to mean here.
        key={videoId}
        src={src}
        // `encrypted-media` alongside `autoplay`, matching the article embed
        // (src/components/youtube-embed.tsx).
        allow="autoplay; encrypted-media"
        /**
         * Collapsed is one pixel tall, NOT `display: none`.
         *
         * The first version of this line used Tailwind's `hidden`, and the
         * comment beside it claimed that kept the frame in place. It does not:
         * `hidden` is `display: none`, which takes the element out of layout
         * entirely — and a media element removed from layout is a media
         * element browsers are entitled to stop. On the one platform this
         * whole component is being reworked for, that would have turned the
         * collapse control into a stop button that says 收起.
         *
         * A pixel of height keeps it rendered and playing while taking no
         * room. Size only ever mattered for *starting* playback — see the
         * header's measurements — so a running player is safe at any size.
         */
        className={
          collapsed ? "block h-px w-full border-0" : "block aspect-video w-full border-0"
        }
      />

      <button
        type="button"
        onClick={() => setCollapsed((was) => !was)}
        data-testid="slideshow-music-collapse"
        className="flex w-full items-center justify-center gap-1 px-2 py-1.5 text-[11px] leading-tight text-white/70"
      >
        {collapsed ? (
          <>
            <ChevronDown className="size-3" />
            {t.slideshowMusic.heading}
          </>
        ) : (
          <>
            <ChevronUp className="size-3" />
            {t.slideshowMusic.collapse}
          </>
        )}
      </button>

      {/*
        Only on a touch device — `touch:` is that media query, named in
        tailwind.config.ts. No user-agent sniffing.

        On a pointer device the frame starts on its own and a "tap to play"
        label would be a lie. On a phone it does not, and until this line
        existed there was nothing on screen saying so.
      */}
      {!collapsed && (
        <p
          data-testid="slideshow-music-hint"
          className="hidden px-2 pb-1.5 text-center text-[11px] leading-tight text-white/70 touch:block"
        >
          {t.slideshowMusic.touchHint}
        </p>
      )}
    </div>,
    document.body,
  );
}
