import React from "react";
import {
  getGalleryPhotos,
  getGalleryVideos,
  getPublishedGalleries,
  getRaceGalleries,
} from "@/lib/content";
import { buildGalleryIndex, wallPage } from "@/lib/media/gallery-index";
import GalleryPageClient from "./gallery-page-client";

/**
 * Cached, where every other route under /gallery stays force-dynamic.
 *
 * WHY THIS ONE CAN. The siblings are force-dynamic for a reason their own
 * comments spell out: it is what stops Next asking a dynamic route for
 * `generateStaticParams`, which it does in a child process it forks per route,
 * and that child opens a second miniflare over the same local D1 the dev
 * server is serving from — measured at `generate-params: 2.1s` and a
 * `SQLITE_BUSY` when two of them meet. This route has no dynamic segment, so
 * there is no fork to avoid and nothing about that argument reaches it.
 *
 * WHAT PAID FOR IT. Caching a page whose contents a member can withdraw is
 * only safe once withdrawal reaches the cache. `media` had no revalidation
 * hook at all until #103; unticking 顯示在相片牆 took effect purely because
 * this page was rebuilt on every request. That hook is the prerequisite, and
 * the rule it was written under is worth repeating here: publishing may lag,
 * un-publishing may not.
 *
 * WHY A TIME FLOOR AS WELL. `revalidatePath` is the real mechanism and it is
 * known to work here — open-next.config.ts records the incident where it did
 * nothing because no tagCache was configured, and the fix being verified both
 * ways. But hooks only fire for writes that go through Payload's document
 * layer, and two scripts deliberately do not: `migrate-velite-to-payload.ts`
 * and `sync-prod-content-to-staging.ts` both use `payload.db.create`. So
 * `pnpm sync:staging` changes what this page should show and busts nothing.
 * An hour is the backstop for that, not the mechanism.
 */
export const revalidate = 3600;

export default async function GalleryPage() {
  const [galleries, raceGalleries, libraryPhotos, libraryVideos] =
    await Promise.all([
      getPublishedGalleries(),
      getRaceGalleries(new Date()),
      getGalleryPhotos(),
      getGalleryVideos(),
    ]);

  // Reduced here rather than in the browser. The client used to receive every
  // album with all of its items *and* the whole wall, then run four useMemos
  // over them — which saved render time and not one byte, because the input
  // was already serialised into the payload. See buildGalleryIndex's header
  // for the measurement.
  const index = buildGalleryIndex(
    [...galleries, ...raceGalleries],
    libraryPhotos,
    libraryVideos,
  );

  // The next step of that same fix: the wall itself no longer ships whole.
  // Only the first page of `items` goes into this payload; MediaGrid fetches
  // the rest from /api/gallery/wall as the visitor scrolls to it. See
  // wallPage's header for why that has to run the same reduction rather than
  // paginate a `media` query on its own.
  const firstPage = wallPage(index.items, null);

  return (
    <GalleryPageClient
      albums={index.albums}
      featuredPhotos={index.featuredPhotos}
      items={firstPage.items}
      nextCursor={firstPage.nextCursor}
    />
  );
}
