import fs from 'fs'
import path from 'path'
import type { Payload } from 'payload'

import { callTextModel, realAIAvailable } from '../ai/call-model'
import { parkedCloudflareContext } from './after-response'
import { geocodePlace } from './nominatim'
import { parsePlaceCsv, type PlaceRow } from './place-csv'
import {
  MODEL_SYSTEM,
  modelPrompt,
  resolveEventGeo,
  startPlaceOf,
  type EventGeoInput,
  type GeoDeps,
  type GeoOutcome,
} from './resolve-event-place'

/**
 * The part of geocoding that touches the world: read an event, decide how to
 * look it up, write the answer back.
 *
 * `resolve-event-place.ts` is pure and holds every decision worth testing;
 * this file only wires it to Payload, the model, Nominatim and the CSV, and
 * is exercised by the contract test and by `pnpm geocode:events`.
 *
 * TWO MODES, ONE GATE. `realAIAvailable()` is the gate the model endpoints
 * already use: false in CI's suite and in `pnpm dev` without `AI_IN_DEV`,
 * true in a deployed Worker and when a developer opts in. Behind it, the real
 * path calls the model and Nominatim; the stand-in path reads
 * `data/race-event-places.csv` and calls nothing. Using the model's gate for
 * the geocoder too is deliberate — "CI makes no network call" is one rule,
 * and two gates would let a test run reach Nominatim because someone had set
 * the other flag. A stand-in is not a mock of the geocoder: it answers from
 * data a person reviewed, so what the suite sees is a corpus that is
 * plausible rather than empty.
 *
 * WHY THE WRITE RE-READS THE EVENT. Looking a place up takes seconds, and an
 * admin can hand-set the coordinates in that time. `manual` is checked again
 * immediately before the write; the window left is one D1 round trip, against
 * the seconds it would be if the check were only at scheduling time.
 *
 * WRITES CARRY `context.skipGeocode`, so the `afterChange` hook that wrote
 * the row does not schedule the lookup that writes the row.
 */

export type GeoMode = 'real' | 'stand-in'
export const geoMode = (): GeoMode => (realAIAvailable() ? 'real' : 'stand-in')

const PLACES_CSV = ['data', 'race-event-places.csv']

/** Read fresh each time: the file is 100 short lines and may have just been exported. */
export function readStandInPlaces(): Map<string, PlaceRow> {
  const file = path.join(process.cwd(), ...PLACES_CSV)
  if (!fs.existsSync(file)) return new Map()
  return new Map(parsePlaceCsv(fs.readFileSync(file, 'utf8')).map((row) => [row.eventKey, row]))
}

/** The test environment's whole geocoder: a lookup by key, else nothing. */
export function standInOutcome(
  places: Map<string, PlaceRow>,
  eventKey: string,
  now: Date = new Date(),
): GeoOutcome {
  const row = places.get(eventKey)
  if (!row) {
    return {
      geoStatus: 'no-place',
      geocodedAt: now.toISOString(),
      detail: 'stand-in: no row in data/race-event-places.csv',
    }
  }
  return {
    geoStatus: 'ok',
    geoSource: row.source,
    geoPlace: row.place,
    lat: row.lat,
    lng: row.lng,
    geocodedAt: row.geocodedAt || now.toISOString(),
  }
}

/** The Workers AI binding of the request this code is running inside, if any. */
export function parkedAiBinding(): Ai | undefined {
  return parkedCloudflareContext()?.env?.AI as Ai | undefined
}

function realDeps(payload: Payload, ai: Ai | undefined): GeoDeps {
  return {
    askModel: async (input) => {
      if (!ai) throw new Error('no Workers AI binding in this environment')
      return callTextModel(
        { ai, payload },
        {
          system: MODEL_SYSTEM,
          text: modelPrompt(input),
          // A ceiling, not a charge: Kimi spends its thinking out of this
          // allowance, and 400 once returned an empty reply (aiSummarisePost.ts).
          maxTokens: 4_000,
          effort: 'low',
        },
      )
    },
    geocode: (request) => geocodePlace(request),
    now: () => new Date(),
  }
}

/** The newest edition that has a usable location, by year. */
async function newestEditionWithLocation(payload: Payload, eventId: number) {
  const editions = await payload.find({
    collection: 'race-editions',
    where: { and: [{ event: { equals: eventId } }, { location: { exists: true } }] },
    sort: '-year',
    limit: 20,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  return editions.docs.find((edition) => startPlaceOf(edition.location) !== null)
}

export type ResolveWriteResult =
  | { written: true; outcome: GeoOutcome }
  | { written: false; reason: string }

/**
 * Look one event up and store the answer.
 *
 * `onlyIfNoPoint` — the hook that fires on creation uses it, so a point that
 * arrived between scheduling and running is not recomputed.
 * `triggerEditionId` — an edition changed its location: act only if it is the
 * one the resolver would read anyway (the newest with a location), so editing
 * a 2019 edition does not cost a geocode that cannot change the answer.
 */
export async function resolveAndWriteEvent(
  payload: Payload,
  eventId: number,
  {
    ai = parkedAiBinding(),
    mode = geoMode(),
    onlyIfNoPoint = false,
    triggerEditionId,
  }: { ai?: Ai; mode?: GeoMode; onlyIfNoPoint?: boolean; triggerEditionId?: number } = {},
): Promise<ResolveWriteResult> {
  // The event can be deleted between the save that scheduled this and the
  // moment it runs (a test's teardown, an admin undoing a mistake). That is
  // not a failure to log: there is nothing left to place.
  const gone = { written: false, reason: 'the event no longer exists' } as const
  const event = await payload
    .findByID({ collection: 'race-events', id: eventId, depth: 0, overrideAccess: true })
    .catch((error) => (isNotFound(error) ? null : Promise.reject(error)))
  if (!event) return gone
  if (event.geoSource === 'manual') return { written: false, reason: 'manual point is never overwritten' }
  if (onlyIfNoPoint && typeof event.lat === 'number') return { written: false, reason: 'already has a point' }

  const edition = await newestEditionWithLocation(payload, event.id)
  if (triggerEditionId !== undefined && edition?.id !== triggerEditionId) {
    return { written: false, reason: 'not the newest edition with a location' }
  }

  const input: EventGeoInput = {
    key: event.key,
    name: event.name,
    nameZh: event.nameZh,
    country: event.country,
    source: event.source,
    editionLocation: edition?.location,
  }
  const outcome =
    mode === 'real'
      ? await resolveEventGeo(realDeps(payload, ai), input)
      : standInOutcome(readStandInPlaces(), event.key)

  const latest = await payload
    .findByID({ collection: 'race-events', id: eventId, depth: 0, overrideAccess: true })
    .catch((error) => (isNotFound(error) ? null : Promise.reject(error)))
  if (!latest) return gone
  if (latest.geoSource === 'manual') {
    return { written: false, reason: 'a person set the point while the lookup ran' }
  }

  const data =
    outcome.geoStatus === 'ok'
      ? {
          lat: outcome.lat,
          lng: outcome.lng,
          geoPlace: outcome.geoPlace,
          geoSource: outcome.geoSource,
          geoStatus: 'ok' as const,
          geocodedAt: outcome.geocodedAt,
          // Only when the event had none — resolveEventGeo leaves it out
          // otherwise, and the catalogue's own value is never replaced.
          ...(outcome.country && !event.country ? { country: outcome.country } : {}),
        }
      : // A failed refresh keeps whatever point was already there: an old
        // dot with an honest status beats a hole.
        { geoStatus: outcome.geoStatus, geocodedAt: outcome.geocodedAt }

  const updated = await payload
    .update({
      collection: 'race-events',
      id: eventId,
      depth: 0,
      overrideAccess: true,
      context: { skipGeocode: true },
      data,
    })
    .catch((error) => (isNotFound(error) ? null : Promise.reject(error)))
  if (!updated) return gone
  return { written: true, outcome }
}

function isNotFound(error: unknown): boolean {
  return (error as { status?: number } | null)?.status === 404
}
