"use client";

/**
 * The three moving parts of the member timeline. Everything else on that page
 * is server-rendered — this file exists only because `whileInView`, a scroll
 * position and `window.print()` all need a browser.
 *
 * THE PAGE MUST STILL READ WITHOUT JAVASCRIPT, AND MUST STILL PRINT. A
 * `whileInView` element is server-rendered at its `initial` state, which here
 * means `opacity: 0` — so with no JS the whole timeline ships invisible, and
 * printing captures whatever the reader had not yet scrolled past as blank
 * space. Both are covered by `!important` overrides that beat framer-motion's
 * inline style: `@media print` in globals.css, and the `<noscript>` block
 * `RiderTimeline` renders. That failure mode is not hypothetical — this repo
 * has already shipped a page that animated itself to invisible and stayed
 * that way (see PageTransitionEffect's note on `initial={false}`).
 *
 * REDUCED MOTION IS `MotionConfig`, NOT A BRANCH. Reading `useReducedMotion()`
 * and returning a plain `div` for one answer and a `motion.div` for the other
 * changes the element between server and client render — the media query has
 * no answer on the server — and a hydration mismatch here fails every browser
 * spec through the console guard in `e2e/helpers/test.ts`. `reducedMotion="user"`
 * drops the transforms inside framer-motion, after hydration, with the markup
 * identical either way.
 */

import { MotionConfig, motion, useScroll, useSpring } from "framer-motion";
import { useRef } from "react";
import type { ReactNode } from "react";

import { transitionApple } from "@/styles/framer-motion";
import { usePdfDownload } from "@/lib/print/use-pdf-download";
import { cn } from "@/lib/utils";
import { useDictionary } from "@/components/i18n/dictionary-provider";

export function TimelineMotionConfig({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

/**
 * The rail, and the line that fills it as you scroll.
 *
 * It measures *itself* rather than taking a ref to the timeline container:
 * it is stretched over that container with `inset-y-0`, so its own progress
 * through the viewport is the container's. That keeps the container a server
 * component — the alternative would be making the whole timeline a client
 * component just to own a ref.
 *
 * The static rule underneath is not decoration: it is what the reader sees
 * with no JS, and what prints.
 */
export function TimelineRail({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    // "the head of the rail reaches 85% down the viewport" to "its foot
    // reaches the middle". Starting at the bottom edge would leave the line
    // empty through the first screenful, which reads as broken rather than
    // as not-yet-scrolled.
    offset: ["start 85%", "end 55%"],
  });
  const scaleY = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    restDelta: 0.001,
  });

  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-y-0 w-px", className)}
      ref={ref}
    >
      <div className="absolute inset-0 bg-border" />
      <motion.div
        className="absolute inset-x-0 top-0 h-full origin-top bg-primary print:hidden"
        style={{ scaleY }}
      />
    </div>
  );
}

/**
 * One row, revealed as it comes into view.
 *
 * `once: true` — a row that fades out again when scrolled past turns a
 * history into a slideshow, and makes Ctrl-F useless. `amount: 0.2` fires
 * while the row is still entering, so the movement is finished by the time it
 * is comfortably readable.
 *
 * `position: relative` is load-bearing, not styling: a transformed element is
 * a containing block, so the node dot each row positions absolutely resolves
 * against this element whether or not it is declared. Saying so keeps the
 * offsets meaning what they read as.
 */
export function TimelineReveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={cn("relative", className)}
      data-timeline-reveal=""
      initial={{ opacity: 0, y: 24 }}
      transition={{ ...transitionApple, delay }}
      viewport={{ amount: 0.2, margin: "0px 0px -8% 0px", once: true }}
      whileInView={{ opacity: 1, y: 0 }}
    >
      {children}
    </motion.div>
  );
}

/**
 * The same rail as a PDF file.
 *
 * BESIDE 列印 RATHER THAN INSTEAD OF IT, because the two do different things.
 * `window.print()` opens the browser's dialog on this page, which
 * `@media print` in globals.css has already stripped for paper; this asks the
 * server to render the same URL through Browser Rendering, which is the only
 * way to get a page number and the page's address on every sheet — Chrome
 * does not implement the `@page` margin boxes CSS would need for a running
 * footer.
 *
 * Everything behind the press is shared with the article print page — see
 * `usePdfDownload` for the four non-obvious parts and why they are not
 * written twice. The markup is here rather than shared with it because the
 * two controls belong to different design languages, and because a
 * `data-testid` built from a prop is one `pnpm assert:schema-screen` cannot
 * find.
 *
 * ONLY THE PER-MEMBER RAIL HAS THIS. The club rail is an infinite scroll, so
 * a server-side render would produce a PDF silently missing everything past
 * page one; its own print button loads the rest first, which nothing outside
 * a browser can do.
 */
export function TimelineDownloadButton({ slug }: { slug: string }) {
  const t = useDictionary();
  const pdf = usePdfDownload(`/api/print/riders/${slug}/timeline`);
  return (
    <>
      <button
        className="border border-border px-3 py-1 text-xs leading-tight text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50 print:hidden"
        data-testid="rider-timeline-download"
        disabled={pdf.downloading}
        onClick={pdf.download}
        type="button"
      >
        {pdf.downloading ? t.riderTimeline.generating : t.riderTimeline.downloadPdf}
      </button>
      {pdf.error && (
        <span
          className="w-full text-xs text-destructive print:hidden"
          data-testid="rider-timeline-download-error"
        >
          {pdf.error}
        </span>
      )}
    </>
  );
}

/**
 * Print.
 *
 * A button rather than "use your browser's print command", because the page
 * is styled for it — `@media print` in globals.css drops the site chrome, the
 * rail's fill and the reveal states — and nothing tells a reader that unless
 * something on the page offers it.
 */
export function TimelinePrintButton({ label }: { label: string }) {
  return (
    <button
      className="border border-border px-3 py-1 text-xs leading-tight text-muted-foreground transition-colors hover:text-foreground print:hidden"
      data-testid="rider-timeline-print"
      onClick={() => window.print()}
      type="button"
    >
      {label}
    </button>
  );
}
