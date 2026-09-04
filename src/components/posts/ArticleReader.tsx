"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Music, Pause, Play, Square, VolumeX } from "lucide-react";

import { SlideshowMusic } from "@/components/gallery/SlideshowMusic";
import { readMusicMuted, writeMusicMuted } from "@/lib/media/music-mute";
import { articleSegments } from "@/lib/reader/article-text";
import { useDictionary } from "@/components/i18n/dictionary-provider";

/**
 * Reading an article aloud, using the voice the visitor's own device has.
 *
 * WHY THE BROWSER AND NOT A MODEL, because the alternative was checked first
 * and it cannot do this. Workers AI — the `AI` binding this repo already has —
 * offers `@cf/deepgram/aura-1` and `aura-2-en/es` with a dozen named speakers
 * and NO Chinese, and `@cf/myshell-ai/melotts` with Chinese and NO speaker
 * parameter at all. There is no Traditional Chinese voice with a choice of
 * voices on that platform. `speechSynthesis` has whatever the device has,
 * costs nothing, needs no key, and starts speaking immediately instead of
 * waiting on a round trip and an MP3.
 *
 * WHAT IT COSTS, said plainly rather than discovered later:
 *
 *   - **Gender is not a thing the Web Speech API exposes.** `SpeechSynthesisVoice`
 *     has `name`, `lang`, `localService` and `default` — and nothing else. The
 *     only way to offer 男聲/女聲 would be a hand-kept map from voice names to
 *     genders, which would be wrong on the first device nobody tested and rot
 *     from there. So this offers the voices themselves, under the names the
 *     platform gives them.
 *   - **The list is the device's, so it differs per visitor.** A Mac has 美嘉
 *     and 善怡; Windows has Hanhan and Yating; a stripped Android may have
 *     none. When there is no Chinese voice this says so rather than showing a
 *     dead button — the failure this codebase keeps writing down is the
 *     control that looks like it worked.
 *
 * NOTHING HERE IS REACHABLE FROM CI. Headless Chromium ships no voices at all,
 * so `getVoices()` is empty and nothing is ever spoken. That is not a gap in
 * the tests, it is the platform: the browser lane can prove the control
 * appears, that it reports having no voice, and that pressing it calls
 * `speechSynthesis` — and the sentences it would say are proved in the unit
 * lane, where `articleSegments` runs with no browser at all.
 */

/** `zh` covers zh-TW, zh-HK, zh-CN and the bare `zh` some platforms report. */
const CHINESE = /^zh\b/i;

// The labels are keys, not words: this list is module-level and the
// dictionary is only reachable from inside the component.
const RATES = [
  { value: 0.8, labelKey: "speedSlow" },
  { value: 1, labelKey: "speedNormal" },
  { value: 1.25, labelKey: "speedFast" },
  { value: 1.5, labelKey: "speedVeryFast" },
] as const;

type Status = "idle" | "speaking" | "paused";

export function ArticleReader({
  title,
  content,
  musicPlaylist = [],
}: {
  /** Said first, so a listener knows what they are hearing. */
  title: string;
  /** The stored Lexical body. Reduced by `articleSegments`, never rendered. */
  content: unknown;
  /**
   * What plays behind the voice, already resolved to an eleven-character id
   * by `buildMusicPlaylist` — this post's own link first, then the site-wide
   * fallback list. `null` means the article is read in silence.
   */
  /**
   * The tracks this article can play behind its own voice, in order.
   *
   * A list rather than one id, because the gallery's music became a playlist
   * and both surfaces resolve it through the same `buildMusicPlaylist` — an
   * article that looped ninety seconds while a long piece was read aloud
   * would be the same complaint the album had. Nothing here skips between
   * them: YouTube advances the queue on its own, and a reader listening to an
   * article is not looking for a track selector.
   */
  musicPlaylist?: string[];
}) {
  const t = useDictionary();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState("");
  const [rate, setRate] = useState(1);
  const [status, setStatus] = useState<Status>("idle");
  /** Whether the API exists at all — false on a browser without it. */
  const [supported, setSupported] = useState(true);
  /**
   * Shared with the album slideshow, on purpose: a visitor who silenced one
   * has not made a second decision. Read lazily because `sessionStorage` does
   * not exist during the server render.
   */
  const [muted, setMuted] = useState(() =>
    typeof window === "undefined" ? false : readMusicMuted(),
  );

  const segments = useMemo(
    () => [title, ...articleSegments(content)].filter(Boolean),
    [title, content],
  );

  /**
   * The queue position, in a ref rather than state.
   *
   * `onend` fires from the browser's speech thread and reads this to decide
   * what is next; state would hand it whatever value was captured when the
   * utterance was created, which is always the one before.
   */
  const cursor = useRef(0);

  /**
   * Which run of speech is current, bumped by every stop and every restart.
   *
   * `cancel()` fires `onend` on the utterance it just cancelled — the spec
   * says so, and browsers differ only in timing. Without this, stopping calls
   * the chain's `onend`, which speaks the next sentence, and the article
   * carries on after the visitor pressed 停止. Same for a voice or speed
   * change, which cancels in order to restart: the old chain and the new one
   * would both be running, two sentences at a time.
   *
   * A ref, not state, for the reason the cursor is one: `onend` fires from the
   * speech thread and must see the value as it is *now*, not as it was when
   * the utterance was created.
   */
  const epoch = useRef(0);

  /**
   * `getVoices()` IS EMPTY ON THE FIRST CALL in Chrome — the list arrives
   * asynchronously and announces itself with `voiceschanged`. Reading it once
   * on mount is the single most common way this feature ships broken: it works
   * on the developer's warm Safari and shows an empty menu everywhere else.
   * Both paths are taken here, and the event is also the only way a voice that
   * finishes downloading mid-visit ever appears.
   */
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setSupported(false);
      return;
    }
    const read = () => setVoices(window.speechSynthesis.getVoices());
    read();
    window.speechSynthesis.addEventListener("voiceschanged", read);
    return () =>
      window.speechSynthesis.removeEventListener("voiceschanged", read);
  }, []);

  const chineseVoices = useMemo(
    () => voices.filter((voice) => CHINESE.test(voice.lang)),
    [voices],
  );

  // The device's own default first, else the first Chinese voice it has.
  useEffect(() => {
    if (voiceName || chineseVoices.length === 0) return;
    const preferred =
      chineseVoices.find((voice) => voice.default) ?? chineseVoices[0];
    setVoiceName(preferred.name);
  }, [chineseVoices, voiceName]);

  /**
   * Stop, and mean it.
   *
   * `cancel()` on unmount is not tidiness. `speechSynthesis` belongs to the
   * window, not to this component, so a visitor who navigates away mid-article
   * would otherwise keep hearing it read on whatever page they landed on —
   * with the control that could stop it now unmounted.
   */
  const stop = useCallback(() => {
    epoch.current += 1;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    cursor.current = 0;
    setStatus("idle");
  }, []);

  useEffect(() => stop, [stop]);

  /**
   * Speak from the cursor, one segment per utterance, chained by `onend`.
   *
   * One utterance per sentence rather than one for the article: the queue is
   * what makes stopping immediate, and short utterances are what keep Chrome
   * from cutting a long one short. `articleSegments` already split the body on
   * sentence boundaries for exactly this.
   */
  const speakFrom = useCallback(
    (
      index: number,
      /**
       * The settings to speak with, passed in rather than read from state.
       *
       * A `<select>`'s `onChange` restarts the reading, and at that moment
       * `setRate` has not re-rendered yet — so a `speakFrom` closed over state
       * would restart at the OLD speed and the control would appear to do
       * nothing until the next sentence after that. Passing the new value is
       * what makes the change take effect on the sentence the visitor is
       * listening to.
       */
      settings?: { rate?: number; voiceName?: string },
    ) => {
      const synth = window.speechSynthesis;
      const wantedVoice = settings?.voiceName ?? voiceName;
      const wantedRate = settings?.rate ?? rate;
      const voice = chineseVoices.find(
        (candidate) => candidate.name === wantedVoice,
      );
      const next = segments[index];
      if (!next) {
        stop();
        return;
      }

      cursor.current = index;
      const run = epoch.current;
      const utterance = new SpeechSynthesisUtterance(next);
      if (voice) utterance.voice = voice;
      utterance.rate = wantedRate;
      utterance.lang = voice?.lang ?? "zh-TW";
      const advance = () => {
        // The guard the epoch exists for: a cancelled run must not speak on.
        if (run !== epoch.current) return;
        speakFrom(index + 1, settings);
      };
      utterance.onend = advance;
      // A failed utterance must not silently end the article — move on, the
      // same way the queue would have.
      utterance.onerror = advance;
      synth.speak(utterance);
    },
    [chineseVoices, rate, segments, stop, voiceName],
  );

  const start = useCallback(() => {
    epoch.current += 1;
    window.speechSynthesis.cancel();
    setStatus("speaking");
    speakFrom(0);
  }, [speakFrom]);

  const toggle = useCallback(() => {
    const synth = window.speechSynthesis;
    if (status === "speaking") {
      synth.pause();
      setStatus("paused");
      return;
    }
    if (status === "paused") {
      synth.resume();
      setStatus("speaking");
      return;
    }
    start();
  }, [start, status]);

  if (!supported) return null;

  const noVoice = chineseVoices.length === 0;

  /**
   * Music follows the voice, and stops when it stops.
   *
   * `status === "speaking"` rather than "not idle": a listener who pressed
   * pause wants the whole thing quiet, not the words gone and the music
   * playing on. That is the same reading the album takes of a video slide —
   * whatever is in front should not be competing with a second track.
   *
   * Volume is YouTube's own, because the player is visible and carries
   * `controls=1`. That is the finer-grained answer this feature needs and the
   * mute button cannot give: under a speaking voice, "quieter" is usually
   * what somebody wants rather than "off".
   */
  const musicPlaying = musicPlaylist.length > 0 && !muted && status === "speaking";

  return (
    <div
      className="my-6 flex flex-wrap items-center gap-3 border border-border bg-secondary p-3"
      data-testid="article-reader"
      data-status={status}
    >
      <button
        type="button"
        onClick={toggle}
        disabled={noVoice || segments.length === 0}
        data-testid="article-reader-toggle"
        aria-label={status === "speaking" ? t.reader.pauseAria : t.reader.readAria}
        className="flex items-center gap-2 border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-40"
      >
        {status === "speaking" ? (
          <Pause className="size-4" />
        ) : (
          <Play className="size-4" />
        )}
        <span>
          {status === "speaking"
            ? t.reader.pause
            : status === "paused"
              ? t.reader.resume
              : t.reader.read}
        </span>
      </button>

      {/* WCAG 1.4.2 again, and the same reason the album's music has a mute:
          audio running longer than three seconds needs a way to stop it that
          is not "leave the page". Pause alone is not that — a listener who is
          done wants it to end, not to sit paused. */}
      {status !== "idle" && (
        <button
          type="button"
          onClick={stop}
          data-testid="article-reader-stop"
          aria-label={t.reader.stopAria}
          className="flex items-center gap-2 border border-border bg-background px-3 py-1.5 text-sm"
        >
          <Square className="size-4" />
          <span>{t.reader.stop}</span>
        </button>
      )}

      {/* Only offered when there is something to play. A toggle for silence
          would be a control that cannot change anything. */}
      {musicPlaylist.length > 0 && !noVoice && (
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
          {muted ? (
            <VolumeX className="size-4" />
          ) : (
            <Music className="size-4" />
          )}
        </button>
      )}

      {musicPlaylist.length > 0 && (
        <SlideshowMusic
          playlist={musicPlaylist}
          // Always the first track. The album offers 上一首/下一首 because a
          // slideshow is long and unattended; an article is neither, and a
          // track selector beside a read-aloud control is one more thing
          // between a reader and the text.
          index={0}
          playing={musicPlaying}
          title={t.reader.musicTitle}
        />
      )}

      {noVoice ? (
        /* Said out loud rather than left as a dead button. The list is the
           device's, and some have no Chinese voice at all — a visitor who
           presses a silent control has no way to learn that. */
        <p
          className="text-xs text-muted-foreground"
          data-testid="article-reader-no-voice"
        >
          {t.reader.noVoice}
        </p>
      ) : (
        <>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>{t.reader.voice}</span>
            <select
              data-testid="article-reader-voice"
              value={voiceName}
              onChange={(event) => {
                const voiceName = event.target.value;
                setVoiceName(voiceName);
                // A voice change cannot be applied to an utterance already
                // queued, so restart the sentence in the new voice.
                if (status !== "idle") {
                  epoch.current += 1;
                  window.speechSynthesis.cancel();
                  setStatus("speaking");
                  speakFrom(cursor.current, { voiceName });
                }
              }}
              className="border border-border bg-background px-2 py-1 text-xs text-foreground"
            >
              {chineseVoices.map((voice) => (
                <option key={voice.name} value={voice.name}>
                  {voice.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>{t.reader.speed}</span>
            <select
              data-testid="article-reader-rate"
              value={String(rate)}
              onChange={(event) => {
                const next = Number(event.target.value);
                setRate(next);
                if (status !== "idle") {
                  epoch.current += 1;
                  window.speechSynthesis.cancel();
                  setStatus("speaking");
                  speakFrom(cursor.current, { rate: next });
                }
              }}
              className="border border-border bg-background px-2 py-1 text-xs text-foreground"
            >
              {RATES.map((option) => (
                <option key={option.value} value={option.value}>
                  {t.reader[option.labelKey]}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
    </div>
  );
}
