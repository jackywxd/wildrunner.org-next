"use client";

import { useEffect, useRef } from "react";

/**
 * The music's spectrum, a faint band of bars along the bottom of the window,
 * behind the page — ported from haijieliu.com's `SpectrumBackdrop`, which this
 * follows line for line apart from the colour.
 *
 * It fills whatever box it is given (the whole width on a phone, the content
 * column on a wide screen — see `SiteMusic`), so the bar count follows the
 * width rather than being fixed, and the canvas is sized in device pixels so
 * the bars stay crisp.
 *
 * THE BARS ARE THE SITE'S PRIMARY COLOUR, read from `--primary` at draw time,
 * so they follow the theme like everything else rather than carrying a hex of
 * their own.
 */

const BAR_WIDTH = 3;
const BAR_GAP = 3;
// Share of the analyser's bins worth drawing. Above this the music carries
// almost nothing, and bars there would sit flat the whole time.
const USEFUL_BINS = 0.7;
// Bins are spread over the bars logarithmically, the way pitch is heard: laid
// out evenly, the bass and melody would crowd into the first few bars of a
// full-width band and leave the rest of it flat.
const LOWEST_BIN = 1;
// Once the music stops the bars sink rather than vanish, by this factor a
// frame, until nothing is left: at rest the band is not drawn at all.
const DECAY = 0.88;

// The level at `position` (0 to 1) along the band. Neighbouring bars at the
// low end share bins, so the level is interpolated between them rather than
// stepping in blocks.
function levelAt(data: Uint8Array, position: number, highestBin: number): number {
  const bin = LOWEST_BIN * Math.pow(highestBin / LOWEST_BIN, position);
  const below = Math.floor(bin);
  const above = Math.min(below + 1, data.length - 1);
  return data[below] + (data[above] - data[below]) * (bin - below);
}

export function SpectrumBackdrop({
  analyser,
  playing,
}: {
  analyser: AnalyserNode | null;
  playing: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Kept across renders so a pause lets the bars sink from where they were.
  const heights = useRef<number[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    // Readers who ask for less motion get the band at rest, not the dance.
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const live = playing && !!analyser && !still;
    const data = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    const color = `hsl(${getComputedStyle(document.documentElement).getPropertyValue("--primary").trim()})`;
    let width = 0;
    let height = 0;
    let frame: number | null = null;

    // Draws one frame; reports whether any bar is still above the floor.
    const draw = (): boolean => {
      const count = Math.max(1, Math.floor((width + BAR_GAP) / (BAR_WIDTH + BAR_GAP)));
      const offset = (width - (count * (BAR_WIDTH + BAR_GAP) - BAR_GAP)) / 2;
      if (live && analyser && data) analyser.getByteFrequencyData(data);
      const highestBin = data ? Math.max(LOWEST_BIN + 1, Math.floor(data.length * USEFUL_BINS)) : 0;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = color;
      let moving = false;
      for (let i = 0; i < count; i++) {
        const previous = heights.current[i] ?? 0;
        let next =
          live && data
            ? (levelAt(data, i / Math.max(1, count - 1), highestBin) / 255) * height
            : previous * DECAY;
        if (next < 0.5) next = 0;
        heights.current[i] = next;
        if (next <= 0) continue;
        moving = true;
        ctx.fillRect(offset + i * (BAR_WIDTH + BAR_GAP), height - next, BAR_WIDTH, next);
      }
      heights.current.length = count;
      return moving;
    };

    const tick = () => {
      frame = null;
      const moving = draw();
      if (live || moving) frame = requestAnimationFrame(tick);
    };

    // Resizing a canvas clears it, so redraw straight away rather than wait
    // for a frame that may not be scheduled while the music is stopped.
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (frame === null) tick();
      else draw();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    return () => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [analyser, playing]);

  return <canvas className="block h-full w-full" data-testid="site-music-spectrum" ref={canvasRef} />;
}
