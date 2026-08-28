"use client";

import { useEffect, useState } from "react";

import type { Media } from "@/payload-types";

/**
 * Resolve a media id to its document, for the two places that hold an id and
 * need a picture.
 *
 * The id is all there is to work with, and that is deliberate rather than
 * incidental: `loadPost` reads at `depth: 0` so a populated Media object can
 * never end up back in `content` (see its header). Anything that wants to
 * *show* one of those ids therefore has to fetch it separately.
 *
 * The cache is module-level, and sharing it is the reason this is not simply
 * duplicated into the second caller. A member previewing an article is
 * looking at the same images the editor resolved moments earlier; a second
 * cache would fetch every one of them again on the click that opens the
 * preview, which is exactly when the page has least to spare.
 *
 * Deliberately not a `Map<id, Promise>`: two components mounting on the same
 * id in one tick will both fetch, once, and the second write wins with the
 * same document. Deduplicating that is not worth carrying a rejected promise
 * that both callers would then have to handle.
 */
const cache = new Map<number | string, Media>();

/** null while loading, and also when the fetch failed — callers show a fallback. */
export function useMediaById(value: number | string): Media | null {
  const [media, setMedia] = useState<Media | null>(cache.get(value) ?? null);

  useEffect(() => {
    if (cache.has(value)) {
      setMedia(cache.get(value)!);
      return;
    }
    let cancelled = false;
    fetch(`/api/media/${value}?depth=0`, {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        const doc = body as Media | null;
        if (cancelled || !doc) return;
        cache.set(value, doc);
        setMedia(doc);
      })
      .catch(() => {
        /* a missing image shows the caller's fallback */
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  return media;
}
