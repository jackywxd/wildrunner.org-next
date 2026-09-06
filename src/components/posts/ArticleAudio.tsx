"use client";

import { Download } from "lucide-react";

import { useDictionary } from "@/components/i18n/dictionary-provider";

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
  /** The generated narration, already an absolute R2 URL. */
  src,
  /** This article's id — the download goes through our own origin. */
  postId,
}: {
  src: string;
  postId: number | string;
}) {
  const t = useDictionary();
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
        data-testid="article-audio-player"
        src={src}
        controls
        // Nothing is fetched until a reader asks for it. The file is a few
        // megabytes and most visitors are here to read.
        preload="none"
        aria-label={t.reader.readAria}
        className="h-10 min-w-0 flex-1"
      />

      {/*
        A plain link, not a button and not a fetch. The server sets
        `Content-Disposition`, so the browser saves the file without a line of
        JavaScript — and it has to be our own origin, because the R2 object
        carries neither that header nor a CORS one. See the endpoint.

        `download` is on it anyway for the same-origin case where a browser
        would otherwise navigate; the header is what actually decides.
      */}
      <a
        data-testid="article-audio-download"
        href={`/api/article-audio/${postId}/download`}
        download
        aria-label={t.reader.download}
        title={t.reader.download}
        className="flex items-center gap-2 border border-border bg-background px-3 py-1.5 text-sm"
      >
        <Download className="size-4" />
      </a>
    </div>
  );
}
