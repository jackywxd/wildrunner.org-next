/**
 * Turning "which race, which year" into the `race-editions` id `media`
 * stores, and back again.
 *
 * `media.raceEdition` is a foreign key, but the question a member is asked is
 * now the catalogue's — series, event, year — because the list of *dated*
 * editions is 14 rows and holds nothing older than this year. See
 * `src/endpoints/resolveRaceEdition.ts` for what happens on the way in, and
 * `RaceClaimFields.tsx`'s header for the same bug in the post editor.
 *
 * Both directions live here rather than inside the two components that need
 * them: the upload dropzone resolves a claim to an id, the detail dialog has
 * an id and must render the claim that produced it, and those are one mapping
 * seen from two ends.
 */
import type { RaceClaim } from '@/components/members/races/RaceClaimFields'
import type { RaceSeries } from '@/lib/races/catalogue'

export type ResolvedEdition =
  | { id: number; ok: true }
  | { message: string; ok: false }

/**
 * The edition id for a claim, creating the row when nobody has claimed that
 * (event, year) before.
 *
 * Deliberately reports failure instead of falling back to "no race": the
 * member picked a race, and silently storing the photo untagged would look
 * exactly like the tag having worked until they went looking for the album.
 */
export async function resolveRaceEdition(input: {
  eventId: string
  year: number
}): Promise<ResolvedEdition> {
  const response = await fetch('/api/members/race-editions/resolve', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (response.ok) {
    const body = (await response.json()) as { id: number }
    return { id: body.id, ok: true }
  }

  return { message: await readError(response), ok: false }
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { errors?: { message?: string }[] }
    return body.errors?.[0]?.message ?? '無法連結這場比賽'
  } catch {
    return '無法連結這場比賽'
  }
}

type EditionDoc = {
  year?: unknown
  event?: { key?: unknown; series?: unknown } | number | null
}

/**
 * The claim behind a stored edition id, for a dialog that has to open showing
 * what is already tagged.
 *
 * A request rather than a lookup in something the client already holds: the
 * media library lists at `depth: 0` (use-media-browse.ts), deliberately, so
 * `raceEdition` is a bare number and nothing about the event travels with it.
 * Raising the depth to avoid this request would populate `media.owner` too —
 * a `users` row per tile — which is the one thing every query in this repo is
 * written to avoid.
 *
 * `race-editions` read access is public (RaceEditions.ts), so this needs no
 * privilege the member does not have; `credentials` is sent anyway because
 * every other member-side fetch does and an anonymous read here would be a
 * silent difference.
 *
 * `null` when anything is missing — an id that no longer resolves, a row
 * whose event went away. The dialog then opens with an empty picker, which is
 * the honest rendering of "this points at nothing we can name".
 */
export async function raceClaimForEdition(
  editionId: number,
): Promise<RaceClaim | null> {
  const response = await fetch(`/api/race-editions/${editionId}?depth=1`, {
    credentials: 'same-origin',
    cache: 'no-store',
  })
  if (!response.ok) return null

  const doc = (await response.json()) as EditionDoc
  const event = typeof doc.event === 'object' && doc.event !== null ? doc.event : null
  const eventId = typeof event?.key === 'string' ? event.key : ''
  const series = typeof event?.series === 'string' ? (event.series as RaceSeries) : null
  const year = typeof doc.year === 'number' ? doc.year : Number(doc.year)

  if (!eventId || !series || !Number.isInteger(year)) return null

  return { distanceId: '', eventId, series, year }
}
