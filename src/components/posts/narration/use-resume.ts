"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import {
  POSITIONS_STORAGE_KEY,
  readPositions,
  recordPosition,
  resumePoint,
  type PositionEntry,
} from "@/lib/reader/narration-position";

/** `timeupdate` fires ~4 times a second; storage does not need to hear that. */
const SAVE_EVERY_MS = 5_000;

/** `HTMLMediaElement.HAVE_METADATA`. */
const HAVE_METADATA = 1;

/** Every read goes back to storage: another tab may have written since. */
function loadPositions() {
  try {
    return readPositions(window.localStorage.getItem(POSITIONS_STORAGE_KEY));
  } catch {
    // Storage can throw outright — a private window, blocked site data. The
    // reader then listens exactly as before, with nothing remembered.
    return {};
  }
}

function storePositions(map: ReturnType<typeof loadPositions>) {
  try {
    window.localStorage.setItem(POSITIONS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Same, and a full quota: losing a bookmark must never break playback.
  }
}

function forgetPosition(key: string) {
  const map = loadPositions();
  delete map[key];
  storePositions(map);
}

/**
 * Remember where a reader stopped, and offer to go back there.
 *
 * Returns `resumeAt`, the second the notice should name, or `null` when there
 * is nothing to offer. `startOver` is the notice's other button.
 *
 * THE FIRST RENDER KNOWS NOTHING, BY DESIGN. `ArticleAudio` is a Client
 * Component, so it is rendered on the server too, and the server has no
 * localStorage. Reading it during render would give the browser's first pass a
 * notice the server never produced — a hydration mismatch on every return
 * visit. So storage is read in an effect, after hydration, and the notice
 * arrives one render late.
 *
 * SAVING IS SWITCHED OFF UNTIL THE RESTORE HAS HAPPENED (`pending`). This is
 * the one ordering that can destroy what it is protecting: a returning reader
 * who opens the article and leaves without pressing play unmounts a player at
 * 0:00, and "t < 5s" is the rule that deletes a record. The same goes for the
 * `timeupdate` that fires at 0:00 in the instant between pressing play and the
 * restore landing. Both would erase the bookmark before it was used.
 */
export function useResume(
  audioRef: RefObject<HTMLAudioElement | null>,
  key: string,
) {
  const [resumeAt, setResumeAt] = useState<number | null>(null);
  const pending = useRef(false);
  const entry = useRef<PositionEntry | null>(null);

  useEffect(() => {
    // Held in a local: by the time this effect's cleanup runs on unmount,
    // React has already detached `audioRef.current`, but the element and its
    // `currentTime` are still there to be read — and soft navigation, which
    // does not fire `pagehide`, makes unmount the save that matters.
    const audio = audioRef.current;
    if (!audio) return;

    entry.current = loadPositions()[key] ?? null;
    // The native controls work before hydration, so a returning reader on a
    // slow phone may already be listening, or have dragged the bar, by the time
    // this runs. Their `play` event fired before the listener below existed, so
    // `onPlay` will never clear `pending` — saving would stay off for the whole
    // visit and the notice would sit on screen over a player that is playing.
    // They have chosen already: no offer. The stored record is left alone; the
    // first save overwrites it.
    const moved = !audio.paused || audio.currentTime >= 1;
    if (moved) entry.current = null;
    pending.current = entry.current !== null;
    setResumeAt(entry.current?.t ?? null);

    let lastSaved = 0;
    const save = () => {
      if (pending.current || audio.readyState < HAVE_METADATA) return;
      storePositions(
        recordPosition(
          loadPositions(),
          key,
          audio.currentTime,
          audio.duration,
          Date.now(),
        ),
      );
      lastSaved = Date.now();
    };

    const give = () => {
      pending.current = false;
      entry.current = null;
      setResumeAt(null);
    };

    // Metadata is fetched for a returning reader (see `preload` in the
    // component), which is when the recorded duration can first be compared
    // with the file's. A mismatch means this is not the recording the position
    // was taken from, and the offer is withdrawn rather than made wrongly.
    const checkDuration = () => {
      if (pending.current && resumePoint(entry.current ?? undefined, audio.duration) === null) {
        // The record goes too, or the next visit would offer the same wrong
        // thing again.
        forgetPosition(key);
        give();
      }
    };

    // Only the FIRST play after load restores, and only if the reader has not
    // already moved: `currentTime < 1` is what separates "pressed play on a
    // fresh page" from "dragged the scrub bar, then pressed play" — which
    // must not be overridden — and from a native play that landed before
    // hydration and is already listening.
    const restore = () => {
      if (!pending.current) return;
      const point = resumePoint(entry.current ?? undefined, audio.duration);
      if (point !== null && audio.currentTime < 1) audio.currentTime = point;
      give();
    };
    const onPlay = () => {
      if (!pending.current) return;
      // Safari ignores a `currentTime` set before metadata exists, so wait for
      // it rather than set it and hope.
      if (audio.readyState >= HAVE_METADATA) restore();
      else audio.addEventListener("loadedmetadata", restore, { once: true });
    };

    const onTimeUpdate = () => {
      if (Date.now() - lastSaved >= SAVE_EVERY_MS) save();
    };
    const onEnded = () => forgetPosition(key);
    const onHidden = () => {
      if (document.visibilityState === "hidden") save();
    };

    audio.addEventListener("loadedmetadata", checkDuration);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("pause", save);
    audio.addEventListener("seeked", save);
    audio.addEventListener("ended", onEnded);
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", save);

    return () => {
      save();
      audio.removeEventListener("loadedmetadata", checkDuration);
      audio.removeEventListener("loadedmetadata", restore);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("pause", save);
      audio.removeEventListener("seeked", save);
      audio.removeEventListener("ended", onEnded);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", save);
    };
  }, [audioRef, key]);

  const startOver = useCallback(() => {
    const audio = audioRef.current;
    forgetPosition(key);
    pending.current = false;
    entry.current = null;
    setResumeAt(null);
    if (audio) audio.currentTime = 0;
  }, [audioRef, key]);

  return { resumeAt, startOver };
}
