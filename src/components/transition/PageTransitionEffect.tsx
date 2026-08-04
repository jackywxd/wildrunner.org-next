"use client";

import { motion, AnimatePresence, Variants } from "framer-motion";
import { usePathname, useSearchParams } from "next/navigation";
import { LayoutRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import React, { Suspense, useContext, useRef } from "react";
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

const Transition: React.FC<{
  children: React.ReactNode;
  variants: Variants;
}> = ({ children, variants }) => {
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
  const searchParams = useSearchParams();
  const query = searchParams.toString();
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
}> = ({ children, variants = defaultVariants }) => (
  // useSearchParams opts a client component out of static rendering unless
  // it sits under a Suspense boundary, and this layout wraps genuinely
  // static pages too (/about, every /posts/[...slug]). The boundary keeps
  // those prerendered; the fallback renders `children` unwrapped so nothing
  // is hidden if it is ever hit.
  <Suspense fallback={<>{children}</>}>
    <Transition variants={variants}>{children}</Transition>
  </Suspense>
);

export default PageTransitionEffect;
