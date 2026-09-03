import { NextResponse } from "next/server";

import { getClubTimelineRows } from "@/lib/content";
import {
  CLUB_PAGE_SIZE,
  catalogueForRows,
  clubTimelinePage,
  type ClubCursor,
} from "@/lib/riders/club-timeline";
import { getRaceCatalogueEvents } from "@/lib/races/catalogue-db";

/**
 * One page of /riders/timeline, past the first that the page itself renders.
 *
 * The second custom route under src/app/api, and modelled on the first
 * (`/api/gallery/wall`) rather than invented: it accepts a cursor and nothing
 * else, and it can never return anything the page would not already have
 * sent, because it runs the exact same `getClubTimelineRows()` over the exact
 * same inputs.
 *
 * IT SHIPS THE CATALOGUE ENTRIES ITS OWN ROWS NEED. A row carries an event id
 * and a distance id; the badge and the race's Chinese name come from
 * `race-events`/`race-categories`, which the browser does not have. Sending
 * the handful of entries this page refers to (`catalogueForRows`) lets the
 * client render an appended row with the same pure resolver the server used
 * for the first page — one renderer, not two.
 *
 * `force-dynamic` rather than cached, for the reason the wall route gives at
 * length: every distinct cursor would be its own cache entry, and
 * `revalidatePath` only busts an exact path — so an unpublished article would
 * stay reachable through already-cached later pages. Recomputing is a few
 * queries over a club's worth of rows.
 */
export const dynamic = "force-dynamic";

/**
 * A cursor is all three parts or none.
 *
 * `sortDay` is genuinely optional — an event nobody has a date for anywhere
 * sorts by year alone — so its absence is data, not a malformed request.
 * `year` and `key` are not: without them the comparator cannot place the
 * cursor, and guessing would hand back a page from the top of the list under
 * the reader's existing rows.
 *
 * It is `sortDay` and not the displayed `day` because the comparator has to
 * be given the field it compares. Handing it the shown date would misplace
 * exactly the rows whose position is inferred — which today is every race in
 * the database.
 */
function parseCursor(searchParams: URLSearchParams): ClubCursor | null {
  const key = searchParams.get("key");
  const year = searchParams.get("year");
  if (!key || !year || !/^\d{4}$/.test(year)) return null;
  const sortDay = searchParams.get("sortDay");
  return {
    key,
    sortDay: sortDay && /^\d{4}-\d{2}-\d{2}$/.test(sortDay) ? sortDay : undefined,
    year: Number(year),
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cursor = parseCursor(searchParams);

  const [rows, events] = await Promise.all([
    getClubTimelineRows(),
    getRaceCatalogueEvents(),
  ]);

  const page = clubTimelinePage(rows, cursor, CLUB_PAGE_SIZE);
  return NextResponse.json({
    ...page,
    events: catalogueForRows(page.rows, events),
  });
}
