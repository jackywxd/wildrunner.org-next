import {
  TIMING,
  dotsNear,
  firstStep,
  flightPath,
  nextStep,
  type PlaybackStep,
} from "@/lib/footprints/footprints";

/**
 * The imperative half of 野馬足跡: it draws what `footprints.ts` decides.
 *
 * WHY IT IS NOT REACT. A landing is thirty short-lived nodes (the glow dots,
 * the ring, the comet) and a flight rewrites one attribute sixty times a
 * second. Pushing that through state means a render per frame for something
 * React has no opinion about. React owns the page; the three `<g>` layers it
 * hands over are empty and this file owns everything inside them. The one
 * thing that goes back the other way is `onLand`, once per stop, so the card
 * and the list can follow.
 *
 * ONE CLOCK. Steps do not use `setTimeout`. A single rAF loop adds up the
 * time of the step in progress and asks `nextStep` for the next one when it
 * is over. That is what makes pausing exact: stopping the loop stops the
 * flight, the hold and the rest together, and starting it again carries on
 * from the same moment — three timers and a frame loop would each need their
 * own remaining time and would drift apart across a pause. It also means a
 * hidden tab spins nothing: rAF does not run there, and `setRunning(false)`
 * stops it for the visitor who scrolled the map out of view, too.
 *
 * THE WAAPI ANIMATIONS (swell, ring, glow, fade) are the exception to "one
 * clock" and are paused with it by hand. `live` holds the ones that are
 * running; only those are paused and only those are played again, because
 * `play()` on one that has already finished starts it over, and a pin that
 * swells a second time on resume is exactly the kind of thing that passes
 * every assertion and looks wrong.
 *
 * NO NODE SURVIVES THE LOOP. When the trail has faded, `clear()` removes every
 * child of the layers and cancels every animation, so the page can run for an
 * hour and `svg *` is the same size at the end of every lap. That is measured
 * in the pull request, not assumed.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/** Every figure the drawing uses that `TIMING` does not already carry. */
export const DRAW = {
  pinRadius: 1.8,
  cometRadius: 1.2,
  arcWidth: 0.6,
  /** A flown arc settles here once the comet has passed. */
  arcSettledOpacity: 0.45,
  arcSettleMs: 400,
  /** The pin is lighter while it swells, then returns to the full colour. */
  pinStartOpacity: 0.5,
  glow: { radius: 7, peak: 0.55, staggerMs: 30, durationMs: 900, dotRadius: 0.9 },
  ring: { fromRadius: 1.5, toRadius: 5, opacity: 0.7, durationMs: 900 },
  /** A frame this long ago is a stall, not time that passed in the picture. */
  maxFrameMs: 100,
} as const;

const PRIMARY = "hsl(var(--primary))";

export type PlaybackStop = { x: number; y: number };

export type PlaybackLayers = {
  /** Under the trail: the landing glow on the land dots. */
  glow: SVGGElement;
  /** Arcs and pins; the part that fades at the end of a lap. */
  trail: SVGGElement;
  /** The comet and the ring. */
  fx: SVGGElement;
};

export type PlaybackHooks = {
  /** A stop has been landed on — update the card and the list. */
  onLand: (index: number) => void;
  /** Called with every landing; the caller decides whether it is heard. */
  onPing: () => void;
};

export type Playback = {
  /** Starts the loop on the first call with `true`; pauses and resumes after that. */
  setRunning: (running: boolean) => void;
  destroy: () => void;
};

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  return node;
}

type Flight = {
  arcs: SVGPathElement[];
  lengths: number[];
  total: number;
  comet: SVGCircleElement;
};

export function startPlayback(
  layers: PlaybackLayers,
  stops: readonly PlaybackStop[],
  hooks: PlaybackHooks,
): Playback {
  const count = stops.length;
  const live = new Set<Animation>();
  /** Fill-forwards animations outlive their finish event; `clear()` cancels these too. */
  const held: Animation[] = [];
  let pausedByUs: Animation[] = [];

  let step: PlaybackStep | null = null;
  let elapsed = 0;
  let last = 0;
  let frame = 0;
  let running = false;
  let destroyed = false;
  let flight: Flight | null = null;
  let faded = false;

  function animate(
    element: Element,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions,
    onDone?: () => void,
  ): Animation {
    const animation = element.animate(keyframes, options);
    live.add(animation);
    animation.addEventListener("finish", () => {
      live.delete(animation);
      onDone?.();
    });
    animation.addEventListener("cancel", () => live.delete(animation));
    return animation;
  }

  function clear() {
    for (const animation of [...live, ...held]) animation.cancel();
    live.clear();
    held.length = 0;
    pausedByUs = [];
    for (const layer of [layers.glow, layers.trail, layers.fx]) layer.replaceChildren();
    flight = null;
  }

  function land(index: number) {
    const stop = stops[index];

    const pin = svg("circle", {
      "data-testid": "footprint-pin",
      cx: stop.x,
      cy: stop.y,
      r: DRAW.pinRadius,
      fill: PRIMARY,
    });
    pin.style.transformBox = "fill-box";
    pin.style.transformOrigin = "center";
    layers.trail.appendChild(pin);

    // Swell to 1.6x, hold there, shrink back: `TIMING.landMs` in all, the
    // shrink taking whatever the swell and the hold leave.
    const swellEnd = TIMING.landScaleInMs / TIMING.landMs;
    const holdEnd = (TIMING.landScaleInMs + TIMING.landScaleHoldMs) / TIMING.landMs;
    animate(
      pin,
      [
        { transform: "scale(1)", opacity: DRAW.pinStartOpacity, offset: 0, easing: "ease-out" },
        { transform: `scale(${TIMING.landScale})`, opacity: 0.7, offset: swellEnd },
        { transform: `scale(${TIMING.landScale})`, opacity: 1, offset: holdEnd, easing: "ease-in-out" },
        { transform: "scale(1)", opacity: 1, offset: 1 },
      ],
      { duration: TIMING.landMs },
    );

    // One thin ring. Drawn at its final radius and scaled up from the
    // starting one, with a stroke that does not scale, so it stays a hairline
    // for the whole of its life.
    const ring = svg("circle", {
      cx: stop.x,
      cy: stop.y,
      r: DRAW.ring.toRadius,
      fill: "none",
      stroke: PRIMARY,
      "stroke-width": 1,
      "vector-effect": "non-scaling-stroke",
    });
    ring.style.transformBox = "fill-box";
    ring.style.transformOrigin = "center";
    ring.style.opacity = "0";
    layers.fx.appendChild(ring);
    animate(
      ring,
      [
        { transform: `scale(${DRAW.ring.fromRadius / DRAW.ring.toRadius})`, opacity: DRAW.ring.opacity },
        { transform: "scale(1)", opacity: 0 },
      ],
      { duration: DRAW.ring.durationMs, easing: "ease-out" },
      () => ring.remove(),
    );

    // The land around it wakes up, nearest dots first, and goes out again.
    for (const dot of dotsNear(stop.x, stop.y, DRAW.glow.radius)) {
      const node = svg("circle", {
        cx: dot.x,
        cy: dot.y,
        r: DRAW.glow.dotRadius,
        fill: PRIMARY,
      });
      node.style.opacity = "0";
      layers.glow.appendChild(node);
      const peak = DRAW.glow.peak * (1 - (dot.d / DRAW.glow.radius) * 0.6);
      animate(
        node,
        [{ opacity: 0 }, { opacity: peak, offset: 0.3 }, { opacity: 0 }],
        { delay: dot.d * DRAW.glow.staggerMs, duration: DRAW.glow.durationMs, easing: "ease-out" },
        () => node.remove(),
      );
    }

    hooks.onLand(index);
    hooks.onPing();
  }

  function beginFly(to: number) {
    const from = stops[to - 1];
    const target = stops[to];
    const arcs = flightPath(from, target).map((d) => {
      const arc = svg("path", {
        "data-testid": "footprint-arc",
        d,
        fill: "none",
        stroke: PRIMARY,
        "stroke-width": DRAW.arcWidth,
        "stroke-linecap": "round",
        opacity: 0.9,
      });
      layers.trail.appendChild(arc);
      return arc;
    });
    // Measured once they are in the document; `getTotalLength` needs that.
    const lengths = arcs.map((arc) => arc.getTotalLength());
    arcs.forEach((arc, i) => {
      arc.style.strokeDasharray = `${lengths[i]}`;
      arc.style.strokeDashoffset = `${lengths[i]}`;
    });
    const comet = svg("circle", {
      cx: from.x,
      cy: from.y,
      r: DRAW.cometRadius,
      fill: PRIMARY,
    });
    layers.fx.appendChild(comet);
    flight = { arcs, lengths, total: lengths.reduce((a, b) => a + b, 0), comet };
  }

  function drawFlight(progress: number) {
    if (!flight) return;
    const travelled = easeInOut(progress) * flight.total;
    let before = 0;
    for (let i = 0; i < flight.arcs.length; i++) {
      const length = flight.lengths[i];
      const local = Math.min(Math.max(travelled - before, 0), length);
      flight.arcs[i].style.strokeDashoffset = `${length - local}`;
      if (travelled >= before && (travelled <= before + length || i === flight.arcs.length - 1)) {
        const point = flight.arcs[i].getPointAtLength(local);
        flight.comet.setAttribute("cx", String(point.x));
        flight.comet.setAttribute("cy", String(point.y));
      }
      before += length;
    }
  }

  function endFlight() {
    drawFlight(1);
    if (!flight) return;
    flight.comet.remove();
    for (const arc of flight.arcs) {
      // Settle, then make the settled value the arc's own so nothing is left
      // running on a trail that will sit there for the rest of the lap.
      animate(
        arc,
        [{ opacity: 0.9 }, { opacity: DRAW.arcSettledOpacity }],
        { duration: DRAW.arcSettleMs, easing: "ease-out" },
        () => arc.setAttribute("opacity", String(DRAW.arcSettledOpacity)),
      );
    }
    flight = null;
  }

  function beginFade() {
    faded = false;
    for (const layer of [layers.trail, layers.fx]) {
      held.push(
        animate(layer, [{ opacity: 1 }, { opacity: 0 }], {
          duration: TIMING.fadeMs,
          fill: "forwards",
          easing: "ease-in",
        }),
      );
    }
  }

  function enter(next: PlaybackStep) {
    step = next;
    elapsed = 0;
    switch (next.phase) {
      case "land":
        // The first stop of a lap starts on an empty map. After a fade it
        // already is (see `tick`); this makes it so on the first lap too.
        if (next.index === 0) clear();
        land(next.index);
        break;
      case "fly":
        beginFly(next.index);
        break;
      case "fade":
        beginFade();
        break;
      default:
        break;
    }
  }

  function leave(done: PlaybackStep) {
    if (done.phase === "fly") endFlight();
  }

  function tick(now: number) {
    if (!running || destroyed || !step) return;
    frame = requestAnimationFrame(tick);
    elapsed += Math.min(now - last, DRAW.maxFrameMs);
    last = now;

    if (step.phase === "fly") drawFlight(Math.min(1, elapsed / step.durationMs));
    if (step.phase === "fade" && !faded && elapsed >= TIMING.fadeMs) {
      // Invisible by now; remove it during the dark beat rather than at the
      // moment the next landing starts, so land(0) begins on nothing.
      faded = true;
      clear();
    }
    if (elapsed >= step.durationMs) {
      const finished = step;
      leave(finished);
      const next = nextStep(finished, count);
      if (next) enter(next);
    }
  }

  return {
    setRunning(next) {
      if (destroyed || next === running) return;
      running = next;
      if (next) {
        if (!step) {
          const first = firstStep(count);
          if (!first) return;
          enter(first);
        }
        for (const animation of pausedByUs) animation.play();
        pausedByUs = [];
        last = performance.now();
        frame = requestAnimationFrame(tick);
      } else {
        cancelAnimationFrame(frame);
        for (const animation of live) {
          if (animation.playState === "running") {
            animation.pause();
            pausedByUs.push(animation);
          }
        }
      }
    },
    destroy() {
      destroyed = true;
      running = false;
      cancelAnimationFrame(frame);
      clear();
    },
  };
}
