"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { Dictionary } from "@/lib/i18n/dictionary";

/**
 * The same words, on the client side of the tree.
 *
 * WHY THIS EXISTS AT ALL. 85 of the public site's 188 dictionary reads are
 * inside Client Components — the lightbox, the share sheet, the reader, the
 * media grid and its filters, 14 files in all. `getDictionary()` cannot help
 * them: it reads the route with `next/root-params`, which is
 * Server-Component-only. So the server half resolves the dictionary once, in
 * `(public)/layout.tsx`, and hands it across the boundary here.
 *
 * IT COSTS NO BYTES THE PAGE WAS NOT ALREADY PAYING — near enough. Those
 * strings shipped to the browser before this too, compiled into the component
 * chunks that contained them. This moves them out of the chunks and into the layout's
 * props; what changes is which file they arrive in, not that they arrive.
 * When a second language lands, only the language being read is sent, which
 * is the same as today and better than shipping all three.
 *
 * NO DEFAULT VALUE, deliberately. A missing provider is a bug — a component
 * rendered outside the tree that seeds it — and it should say so where it
 * happens rather than render a page of `undefined`.
 */
const DictionaryContext = createContext<Dictionary | null>(null);

export function DictionaryProvider({
  dictionary,
  children,
}: {
  dictionary: Dictionary;
  children: ReactNode;
}) {
  return (
    <DictionaryContext.Provider value={dictionary}>
      {children}
    </DictionaryContext.Provider>
  );
}

export function useDictionary(): Dictionary {
  const dictionary = useContext(DictionaryContext);
  if (!dictionary) {
    throw new Error(
      "useDictionary() outside a DictionaryProvider — the tree that renders this component needs one, the way (public)/layout.tsx seeds the public site.",
    );
  }
  return dictionary;
}
