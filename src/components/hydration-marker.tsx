"use client";

import { useEffect } from "react";

/**
 * Says, in the DOM, that React has finished taking over this page.
 *
 * WHY A PAGE NEEDS TO ANNOUNCE THAT AT ALL. Nothing else can. `load` and
 * `domcontentloaded` both fire while the tree is still inert markup, and a
 * server-rendered control is *visible, enabled and stable* long before its
 * handler exists — so every actionability check a browser automation tool can
 * make passes, and the page is still not ready to be used. There is no
 * standard event for "hydrated"; React exposes none. So we publish one.
 *
 * IT WAS WRITTEN FOR THE TEST SUITE AND IT SHIPS IN PRODUCTION ANYWAY, for
 * the same reason `data-testid` does: an attribute that only exists in one
 * environment is an attribute the other environment cannot be tested through.
 * The cost is 22 characters on `<html>` and one effect that runs once.
 *
 * WHAT IT ACTUALLY PROVES, stated narrowly because the difference matters:
 * that the client tree containing *this component* has hydrated and its
 * effects have flushed. It is rendered in `[lang]/(site)/layout.tsx` beside
 * the page body, so that covers the site chrome — the header, its navigation,
 * the language switcher — and any page content not deferred behind its own
 * `<Suspense>`. Content inside a suspended boundary hydrates on its own
 * schedule and this attribute says nothing about it; a control there needs a
 * signal of its own.
 *
 * ON `documentElement` RATHER THAN A WRAPPER DIV, because the thing waiting
 * for it navigates before any of our markup exists and wants one selector
 * that is valid on every page. React owns `<html>` here, but it already
 * carries `suppressHydrationWarning` and the anti-FOUC theme script in that
 * same layout already writes to its `classList` — so this is the established
 * shape in this file, not a new liberty being taken with it.
 */
export function HydrationMarker() {
  useEffect(() => {
    document.documentElement.setAttribute("data-hydrated", "true");
    // NO CLEANUP, and that is the considered choice rather than an omission.
    // Strict Mode runs effects mount → cleanup → mount in development, so a
    // cleanup that removed the attribute would take it away and put it back —
    // a window, however narrow, in which the one thing waiting on it sees it
    // missing. Introducing a race into the component whose entire job is to
    // end one would be a poor trade.
    //
    // It costs nothing to leave. Nothing unmounts this within the site layout,
    // and leaving that layout is a full document load, which replaces the
    // element the attribute is on.
  }, []);

  return null;
}
