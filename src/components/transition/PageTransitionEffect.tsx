"use client";

import { motion, AnimatePresence, Variants } from "framer-motion";
import { usePathname } from "next/navigation";
import { LayoutRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import React, { useContext, useRef } from "react";
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

const PageTransitionEffect: React.FC<{
  children: React.ReactNode;
  variants?: Variants;
}> = ({ children, variants = defaultVariants }) => {
  // The `key` is tied to the url using the `usePathname` hook.
  const key = `page-${usePathname()}`;

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

export default PageTransitionEffect;
