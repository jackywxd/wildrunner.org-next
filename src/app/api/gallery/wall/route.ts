import { NextResponse } from "next/server";
import {
  getGalleryPhotos,
  getGalleryVideos,
  getPublishedGalleries,
  getRaceGalleries,
} from "@/lib/content";
import { buildGalleryIndex, wallPage, type WallCursor } from "@/lib/media/gallery-index";

/**
 * One page of /gallery's "全部相片" wall, past the first page the SSR
 * already sends.
 *
 * The first custom route under src/app/api — everything else there is
 * Payload's own catch-all. This is deliberately not a thin wrapper over
 * `/api/media`: that endpoint lets a caller pass any `where`, and the wall
 * is not `media.usage = 'gallery'` alone — it is that unioned with every
 * item curated into a published album regardless of that item's own
 * `usage` (see gallery-index.ts's header). This route accepts a cursor
 * and nothing else; it can never return anything `/gallery` itself would
 * not already have sent, because it runs the exact same `buildGalleryIndex`
 * over the exact same inputs.
 *
 * Deliberately force-dynamic rather than cached. The alternative — caching
 * each distinct `?createdAt&src` response the way `/gallery` itself is
 * cached — means every one of those is its own cache entry, and
 * `revalidatePath` only busts an exact path; a withdrawn photo would stay
 * reachable through already-cached later pages until the hour-long window
 * expired, which is exactly the guarantee V-UNPUBLISH-T1 pins for the first
 * page. Recomputing per request costs a full reduction over a few hundred
 * rows — the corpus this scans today, per getGalleryMedia's own comment,
 * making pagination a bandwidth fix, not a compute one — and buys
 * correctness with no separate cache-invalidation surface to keep in sync.
 */
export const dynamic = "force-dynamic";

function parseCursor(searchParams: URLSearchParams): WallCursor | null {
  const createdAt = searchParams.get("createdAt");
  const src = searchParams.get("src");
  if (!createdAt || !src) return null;
  return { createdAt, src };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cursor = parseCursor(searchParams);

  const [galleries, raceGalleries, libraryPhotos, libraryVideos] =
    await Promise.all([
      getPublishedGalleries(),
      getRaceGalleries(new Date()),
      getGalleryPhotos(),
      getGalleryVideos(),
    ]);

  const { items } = buildGalleryIndex(
    [...galleries, ...raceGalleries],
    libraryPhotos,
    libraryVideos,
  );

  return NextResponse.json(wallPage(items, cursor));
}
