"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import type { Follow, FollowState } from "./follow";

/**
 * Wire the player to `follow.ts`, which is not loaded until it is needed.
 *
 * `state` IS `null` UNTIL THE FIRST PRESS OF PLAY, which is what keeps the
 * first client render identical to the server's: no `data-follow`, no
 * controls, not sticky. Everything that changes the markup arrives after an
 * event the reader caused.
 *
 * `sticky` is playing-or-detached and only for a page that follows: a player
 * that stays in view is how a reader gets back to the pause button and the
 * "return" button, and it is only worth the screen it takes while there is a
 * highlight to keep up with.
 */
export function useFollow(
  audioRef: RefObject<HTMLAudioElement | null>,
  playerRef: RefObject<HTMLElement | null>,
  options: { postId: number | string; audioKey: string; lines: number; titled: boolean } | null,
) {
  const [state, setState] = useState<FollowState | null>(null);
  const [playing, setPlaying] = useState(false);
  const follow = useRef<Follow | null>(null);

  const postId = options?.postId;
  const audioKey = options?.audioKey;
  const lines = options?.lines;
  const titled = options?.titled;
  const enabled = options !== null;

  useEffect(() => {
    const audio = audioRef.current;
    const player = playerRef.current;
    if (!enabled || !audio || !player) return;

    let cancelled = false;
    let started = false;

    const onPlay = () => {
      setPlaying(true);
      if (follow.current) {
        follow.current.play();
        return;
      }
      if (started) return;
      started = true;
      import("./follow")
        .then((m) =>
          m.startFollow({
            audio,
            player,
            postId: postId as number | string,
            audioKey: audioKey as string,
            lines: lines as number,
            titled: titled as boolean,
            onState: (next) => {
              if (!cancelled) setState(next);
            },
          }),
        )
        .then((controller) => {
          if (cancelled) {
            controller?.destroy();
            return;
          }
          if (!controller) {
            setState("unavailable");
            return;
          }
          follow.current = controller;
          // The press that loaded this has already happened; this is what
          // takes the page to the voice and reports the first state.
          controller.play();
        })
        .catch(() => {
          // A chunk that failed to load is the same answer as no table.
          if (!cancelled) setState("unavailable");
        });
    };
    const onStop = () => setPlaying(false);

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onStop);
    audio.addEventListener("ended", onStop);
    // A reader on a slow phone may have pressed the native play before this
    // effect ran; their `play` event is gone, and so would the highlight be.
    if (!audio.paused) onPlay();

    return () => {
      cancelled = true;
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onStop);
      audio.removeEventListener("ended", onStop);
      follow.current?.destroy();
      follow.current = null;
    };
  }, [audioRef, playerRef, enabled, postId, audioKey, lines, titled]);

  const setEnabled = useCallback((on: boolean) => follow.current?.setEnabled(on), []);
  const returnToText = useCallback(() => follow.current?.returnToText(), []);

  const active = state === "following" || state === "detached";
  return {
    state,
    sticky: active && (playing || state === "detached"),
    setEnabled,
    returnToText,
  };
}
