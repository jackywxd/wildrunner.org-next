"use client";

import { useRef, useState } from "react";
import { Music, VolumeX } from "lucide-react";

import { SlideshowMusic } from "@/components/gallery/SlideshowMusic";
import { useDictionary } from "@/components/i18n/dictionary-provider";
import { readMusicMuted, writeMusicMuted } from "@/lib/media/music-mute";

/**
 * Playing the narration that was generated for this article.
 *
 * A SEPARATE COMPONENT FROM `ArticleReader`, NOT A BRANCH INSIDE IT, because
 * the two are different things wearing the same word. `ArticleReader` drives
 * `speechSynthesis`: it owns a queue of utterances, a cursor, an epoch counter
 * to survive `cancel()`, and a voice list that differs on every device. None
 * of that exists here — there is one MP3, and the browser has had a control
 * for playing one of those for twenty years.
 *
 * WHAT THE FILE BUYS THAT THE WEB SPEECH API CANNOT GIVE, which is the whole
 * reason for generating it: a scrub bar, a position that survives the screen
 * locking, playback in the background, and the system's own media controls on
 * the lock screen. `speechSynthesis` has none of those by construction — it is
 * a queue of sentences, not a track.
 *
 * The page decides which of the two to render: `narrationUrl()` answers with a
 * URL when R2 holds narration for this exact script, and `ArticleReader` is
 * what a reader gets until then. So an article whose audio has not been
 * generated is not broken, it is simply read by the device.
 */
export function ArticleAudio({
  src,
  musicPlaylist = [],
}: {
  /** The generated narration, already an absolute R2 URL. */
  src: string;
  /** Same playlist the reader uses — see `ArticleReader` on why it is a list. */
  musicPlaylist?: string[];
}) {
  const t = useDictionary();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  /**
   * Shared with the album slideshow and with `ArticleReader`, on purpose: a
   * visitor who silenced one has not made a second decision. Read lazily
   * because `sessionStorage` does not exist during the server render.
   */
  const [muted, setMuted] = useState(() =>
    typeof window === "undefined" ? false : readMusicMuted(),
  );

  // Music follows the narration and stops when it stops — the same rule
  // `ArticleReader` applies to the voice. Driven by the element's own events
  // rather than by our button, so pausing from the lock screen or the system
  // media controls stops the music too.
  const musicPlaying = musicPlaylist.length > 0 && !muted && playing;

  return (
    <div
      className="my-6 flex flex-wrap items-center gap-3"
      data-testid="article-audio"
    >
      {/*
        The browser's own control, deliberately. A hand-built transport would
        be a play button, a scrub bar, a duration and a buffering state — all
        of which this already has, in the reader's own language, with keyboard
        support and the system media session wired up.
      */}
      <audio
        ref={audioRef}
        data-testid="article-audio-player"
        src={src}
        controls
        // Nothing is fetched until a reader asks for it. The file is a few
        // megabytes and most visitors are here to read.
        preload="none"
        aria-label={t.reader.readAria}
        className="h-10 min-w-0 flex-1"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />

      {/* Only offered when there is something to play. A toggle for silence
          would be a control that cannot change anything. */}
      {musicPlaylist.length > 0 && (
        <button
          type="button"
          onClick={() => {
            const next = !muted;
            setMuted(next);
            writeMusicMuted(next);
          }}
          data-testid="article-music-toggle"
          data-playing={musicPlaying}
          aria-label={muted ? t.reader.musicOn : t.reader.musicOff}
          title={muted ? t.reader.musicOn : t.reader.musicOff}
          className="flex items-center gap-2 border border-border bg-background px-3 py-1.5 text-sm"
        >
          {muted ? <VolumeX className="size-4" /> : <Music className="size-4" />}
        </button>
      )}

      {musicPlaylist.length > 0 && (
        <SlideshowMusic
          playlist={musicPlaylist}
          index={0}
          playing={musicPlaying}
          title={t.reader.musicTitle}
        />
      )}
    </div>
  );
}
