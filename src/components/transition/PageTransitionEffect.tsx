"use client";

import { motion, AnimatePresence, Variants } from "framer-motion";
import { usePathname, useSearchParams } from "next/navigation";
import { LayoutRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import React, { Suspense, useContext, useEffect, useRef, useState } from "react";
import { transitionApple } from "@/styles/framer-motion";

function FrozenRouter(props: { children: React.ReactNode }) {
  const context = useContext(LayoutRouterContext ?? {});
  const frozen = useRef(context).current;
  if (!frozen) {
    return <>{props.children}</>;
  }
  return (
    <LayoutRouterContext.Provider value={frozen}>
      {props.children}
    </LayoutRouterContext.Provider>
  );
}

const defaultVariants = {
  hidden: { opacity: 0 },
  enter: { opacity: 1 },
  exit: { opacity: 0 },
};

/**
 * Isolated to exactly this: read the query string, and nothing else.
 *
 * `useSearchParams()` opts its caller out of static rendering unless that
 * caller sits under a `<Suspense>`. It used to be `Transition` itself doing
 * the reading, with `children` — the whole page — duplicated into the
 * boundary's fallback so a static page had something to show before
 * hydration. That was the bug: `children` is not a preview to render twice,
 * it is the page's actual (already-resolved) RSC output, and the swap that
 * is supposed to replace the fallback copy with the real one, once the real
 * one resolves, was not removing the fallback's copy from the DOM. Confirmed
 * straight from `curl`'d SSR HTML, no client JS involved: `/riders` shipped
 * 12 `rider-card` nodes for 6 riders, `/races` shipped every
 * `race-write-report` link twice, and even a static page — `/about` —
 * shipped `<h3>追雲逐雪</h3>` twice, each doubled once as a normally-laid-out
 * node and once inside a zero-size `id="S:0"` — React's own leftover
 * streaming-replacement slot. That is the mechanism behind `M-RACES`'s badge
 * count reading 2 for 1 record (e2e/journeys/member-races.spec.ts) and the
 * `race-write-report`/`race-report-distance` `:visible`/first-match
 * workarounds in e2e/journeys/race-report.spec.ts — both previously
 * misdiagnosed as a responsive-breakpoint duplicate (docs/testing-plan.md,
 * docs/member-publish-flow.md).
 *
 * Swapping the boundary's fallback to `null` "fixes" that duplication, but
 * it does so by starving `children` of ever rendering through the direct,
 * no-client-wrapper path the fallback used to provide — and that path turned
 * out to be load-bearing for something else: a route that calls
 * `notFound()` stopped answering 404 and started answering 200 with the
 * not-found page's body (`e2e/journeys/visitor.spec.ts` V8, verified
 * failing with `fallback={null}` and passing with the original
 * `fallback={children}` — same server, same route, only this one file
 * different). So the boundary cannot wrap `children` at all, in either
 * branch — not `fallback={children}`, not `fallback={null}` while the
 * primary branch still contains it.
 *
 * This component renders no page content of its own — it exists only to
 * read `searchParams` and hand the query string to a plain `useState` one
 * level up. In an `useEffect`, not adjusted directly during render: React's
 * "adjust state while rendering" pattern is for a component adjusting its
 * *own* state from its *own* props, not for a child calling a setter that
 * belongs to its parent — doing that here threw exactly the warning
 * `e2e/helpers/test.ts` exists to catch ("Cannot update a component
 * (`PageTransitionEffect`) while rendering a different component
 * (`SyncQueryString`)"), on the very journey (V4/V5) that this file's
 * `key` logic was written for. Seen failing before landing, for that
 * reason, not a different one.
 *
 * Its `fallback={null}` is free regardless of which pattern is used: there
 * is nothing here to duplicate, because there is nothing here to show.
 */
function SyncQueryString({ onChange }: { onChange: (query: string) => void }) {
  const query = useSearchParams().toString();
  useEffect(() => {
    onChange(query);
  }, [query, onChange]);
  return null;
}

const Transition: React.FC<{
  children: React.ReactNode;
  query: string;
  variants: Variants;
}> = ({ children, query, variants }) => {
  // The key is the whole URL, not just the pathname.
  //
  // `usePathname()` returns "/races" for both /races and
  // /races?view=calendar, so keying on it alone meant a filter click never
  // changed the key — AnimatePresence kept the mounted subtree, and
  // FrozenRouter below kept serving it the router context captured at its
  // first render. The RSC payload for the new URL was fetched and then
  // discarded: the URL in the address bar changed and the page did not, and
  // only a manual reload (a fresh mount) showed the new view. Every
  // query-only navigation on the public site went through this — the
  // /races list/calendar toggle and all of its filter chips.
  const key = `page-${usePathname()}${query ? `?${query}` : ""}`;

  return (
    // `initial={false}` skips the enter animation for the *first* render only.
    // Without it the server renders this div at the "hidden" variant
    // (opacity: 0) and the page stays invisible until framer-motion animates
    // it in on the client — so anyone (or any crawler) reading the delivered
    // HTML sees a blank page. Route changes after mount still animate.
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div
        key={key}
        initial="hidden"
        animate="enter"
        exit="exit"
        variants={variants}
        transition={transitionApple}
      >
        <FrozenRouter>{children}</FrozenRouter>
      </motion.div>
    </AnimatePresence>
  );
};

const PageTransitionEffect: React.FC<{
  children: React.ReactNode;
  variants?: Variants;
}> = ({ children, variants = defaultVariants }) => {
  // Starts empty, not from `window.location.search`: this render also runs
  // on the server, where `window` does not exist, and the two have to agree
  // for hydration. A query-string page still paints correctly on the very
  // first paint — `SyncQueryString` below corrects `query` before anything
  // is visibly wrong, the same tick React commits its own first client
  // render, well before a person could react to it.
  const [query, setQuery] = useState("");

  return (
    <>
      <Suspense fallback={null}>
        <SyncQueryString onChange={setQuery} />
      </Suspense>
      <Transition query={query} variants={variants}>
        {children}
      </Transition>
    </>
  );
};

export default PageTransitionEffect;
