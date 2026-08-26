/**
 * The address of a race's album.
 *
 * A race's photos are not stored as a gallery — they are whatever media
 * carries that `raceEdition` tag, resolved by query (see
 * `getRaceEditionPhotos`). But readers want an album they can open and
 * share, and a video cannot be shared at all without one: the share page
 * `/gallery/[slug]/v/[videoId]` resolves a video by looking it up inside a
 * gallery, so a video reached only through a race tag has no slug to build
 * a link with and `GalleryVideos` renders no share button for it.
 *
 * So the album is *virtual*: `/gallery/race-<eventKey>-<year>` renders the
 * same query the race page does. Deliberately not a stored `galleries` row
 * kept in sync — that would make the tag and the album two sources for the
 * same truth, and they would diverge the first time someone tagged a photo
 * after the row was written. This repo has already paid for that shape once
 * (the R-DUPLICATE split-brain between `race-schedule` and `race-editions`).
 *
 * These helpers are pure and live apart from `content.ts` so the slug
 * round-trip can be tested without a database.
 */

const PREFIX = "race-";

/**
 * `key` and `year` rather than the edition's integer id, matching what
 * `/races/[key]/[year]` addresses and for the same reason `RaceEvents.ts`
 * keeps `key`: it is stable across environments and survives a row being
 * recreated, so a shared link stays correct.
 */
export function raceGallerySlug(eventKey: string, year: number): string {
  return `${PREFIX}${eventKey}-${year}`;
}

/**
 * The inverse, or null when this is not a race album slug.
 *
 * The greedy `(.+)` matters: every event key in the catalogue contains
 * hyphens (`other-fat-dog`), so only anchoring the four-digit year at the
 * end splits `race-other-fat-dog-2026` into `other-fat-dog` and `2026`
 * rather than at the first hyphen.
 */
export function parseRaceGallerySlug(
  slug: string,
): { eventKey: string; year: number } | null {
  if (!slug.startsWith(PREFIX)) return null;

  const match = slug.slice(PREFIX.length).match(/^(.+)-(\d{4})$/);
  if (!match) return null;

  const [, eventKey, year] = match;
  if (!eventKey) return null;

  return { eventKey, year: Number(year) };
}
