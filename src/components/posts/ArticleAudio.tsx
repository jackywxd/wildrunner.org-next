"use client";

import { Download } from "lucide-react";
import { useRef } from "react";

import { cn } from "@/lib/utils";

import { useDictionary } from "@/components/i18n/dictionary-provider";
import { formatClock } from "@/lib/reader/narration-position";

import { useFollow } from "./narration/use-follow";
import { useResume } from "./narration/use-resume";

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
  /**
   * The R2 key of that file — what a remembered position is filed under. Not
   * the key the article's current words hash to: an edited article plays its
   * previous narration, and the position belongs to the file being played.
   */
  audioKey,
  /** This article's id — the download goes through our own origin. */
  postId,
  follow,
}: {
  src: string;
  audioKey: string;
  postId: number | string;
  /**
   * Present only when the page tagged its paragraphs for THIS narration (not a
   * stale one): `lines` is how many lines its script has, `titled` whether the
   * first is the title. The timing table has to agree with `lines` before
   * anything is highlighted — see `canFollow`.
   */
  follow?: { lines: number; titled: boolean };
}) {
  const t = useDictionary();
  const audioRef = useRef<HTMLAudioElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const { resumeAt, startOver } = useResume(audioRef, audioKey);
  const following = useFollow(
    audioRef,
    playerRef,
    follow ? { postId, audioKey, ...follow } : null,
  );
  return (
    <div
      ref={playerRef}
      // Absent until the first press of play, so the first client render is
      // the server's. Values are documented in `narration/follow.ts`.
      data-follow={following.state ?? undefined}
      // `py-2` + `my-4` is the old `my-6` split so that turning sticky on
      // moves nothing: the background has to reach past the controls.
      className={cn(
        "my-4 flex flex-wrap items-center gap-3 py-2",
        following.sticky && "sticky top-16 z-30 bg-background",
      )}
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
        // megabytes and most visitors are here to read. The exception is a
        // reader with a remembered position, who is likely to press play: they
        // get the first bytes, which is what lets the duration be checked
        // before the offer is made. `resumeAt` is null on the server render and
        // on a first visit, so neither is ever asked to fetch anything.
        preload={resumeAt === null ? "none" : "metadata"}
        aria-label={t.reader.readAria}
        className="h-10 min-w-0 flex-1"
      />

      {following.state !== null && following.state !== "unavailable" && (
        <>
          <button
            type="button"
            data-testid="article-audio-follow"
            aria-pressed={following.state !== "off"}
            onClick={() => following.setEnabled(following.state === "off")}
            className={cn(
              "border border-border px-3 py-1.5 text-sm",
              following.state !== "off" && "bg-secondary",
            )}
          >
            {t.reader.follow}
          </button>
          {following.state === "detached" && (
            <button
              type="button"
              data-testid="article-audio-follow-back"
              onClick={following.returnToText}
              className="border border-border bg-background px-3 py-1.5 text-sm"
            >
              {t.reader.followBack}
            </button>
          )}
        </>
      )}

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

      {/* Last, so that its full-width row does not push the download button
          onto a line of its own (seen on production). */}
      {resumeAt !== null && (
        <p
          data-testid="article-audio-resume"
          className="flex basis-full flex-wrap items-center gap-x-3 text-sm text-muted-foreground"
        >
          {t.reader.resumeNotice.replace("{time}", formatClock(resumeAt))}
          <button
            type="button"
            data-testid="article-audio-restart"
            onClick={startOver}
            className="underline underline-offset-4"
          >
            {t.reader.resumeRestart}
          </button>
        </p>
      )}
    </div>
  );
}
