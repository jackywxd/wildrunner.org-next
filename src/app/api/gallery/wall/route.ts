import { NextResponse } from "next/server";
import {
  getGalleryPhotos,
  getGalleryVideos,
  getPublishedGalleries,
  getRaceGalleries,
} from "@/lib/content";
import {
  arrangeMedia,
  buildGalleryIndex,
  wallPage,
  type WallCursor,
  type WallSort,
} from "@/lib/media/gallery-index";
import type { MediaKindFilter } from "@/lib/media/filters";

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
 * It also takes the visitor's filter and sort, and that is not an extension
 * of the cursor — it is the reason filtering had to land here at all. The
 * client holds one page of sixty; narrowing that in the browser would show
 * whichever eight of the sixty are videos and then stop, with the other
 * hundreds unreachable behind a cursor that had already moved past them. So
 * the arrangement is applied to the whole reduced array before it is sliced,
 * and the client re-asks from the beginning whenever it changes.
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

const KINDS: MediaKindFilter[] = ["all", "photo", "video"];

/**
 * `curated` is absent on purpose and is not an oversight: it means "the order
 * a curator put these in", and the wall is not an album — it has no curator
 * and no such order. An unknown value falls back to the default rather than
 * erroring, because a query string is not a contract a visitor signed and a
 * stale bookmark should still show them the wall.
 */
const SORTS: WallSort[] = ["newest", "oldest"];

function parseArrangement(searchParams: URLSearchParams) {
  const kind = searchParams.get("kind") as MediaKindFilter | null;
  const sort = searchParams.get("sort") as WallSort | null;
  return {
    kind: kind && KINDS.includes(kind) ? kind : ("all" as const),
    sort: sort && SORTS.includes(sort) ? sort : ("newest" as const),
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cursor = parseCursor(searchParams);
  const arrangement = parseArrangement(searchParams);

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

  // Arranged before sliced, and `wallPage` is told the order it is looking at
  // so its cursor fallback searches the array the same way the array was
  // sorted — see that function's own note on passing the wrong one.
  return NextResponse.json(
    wallPage(arrangeMedia(items, arrangement), cursor, undefined, arrangement.sort),
  );
}
