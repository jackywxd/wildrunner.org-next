import { alpha2ToAlpha3, alpha3ToAlpha2 } from './iso-alpha'
import type { GeocodeHit, GeocodeRequest } from './nominatim'

/**
 * From a race event to a city-level point, without ever asking anyone for a
 * number we cannot check.
 *
 * THE RULE THIS FILE EXISTS TO KEEP: the model names a *place*; a geocoder
 * turns the place into coordinates. A model's latitude is unverifiable — it
 * reads as plausible whether it is right or 400km out — while a place name
 * can be checked by a person, and is then checked again mechanically by
 * restricting the geocoder to the event's country. `parseModelPlace` ignores
 * every key but `city`, `region` and `country_alpha2` on purpose, so a model
 * that volunteers `lat`/`lng` has them dropped rather than trusted.
 *
 * THE ORDER, and why it is this one:
 *   1. the newest edition's `location` — somebody wrote that down for this
 *      race, from the organiser's page. `source: "edition"`.
 *   2. otherwise the model, asked where the race starts. `source: "ai"`.
 *   3. otherwise nothing: `no-place`. Never the country's centre. A dot in
 *      the middle of France for a race in Chamonix draws a route that was
 *      never flown, and a map that is wrong with confidence is worse than a
 *      map with a gap the admin can see in the `geoStatus` filter.
 * Whichever name wins is geocoded strictly first (a settlement), then — if
 * that finds nothing and `mayRelax` allows — once more without the
 * settlement filter, same text and same country. A relaxed hit is stored
 * with " (relaxed)" after its name so a person can find and review it.
 * A hand-entered point (`manual`) outranks all of it, but that rule lives
 * with the hooks (`shouldResolveEvent`), because it is about when to run at
 * all, not about how to resolve.
 *
 * PURE. Everything that touches the world — the model, the geocoder, the
 * clock — arrives through `GeoDeps`, so the decisions above can be tested
 * without a network (U-GEO-T1..T4) and the same function serves the Worker
 * hook, the batch script and the test stand-in.
 */

export type GeoStatus = 'ok' | 'no-place' | 'not-found' | 'failed'
export type GeoSource = 'edition' | 'ai' | 'manual'

/** What the resolver needs to know about an event. */
export type EventGeoInput = {
  key: string
  name: string
  nameZh?: string | null
  /** ISO alpha-3, as `race-events.country` stores it. */
  country?: string | null
  /** `race-events.source` — where the catalogue row came from. Context for the model. */
  source?: string | null
  /** The newest edition's free-text location, if any edition has one. */
  editionLocation?: string | null
}

export type GeoOutcome = {
  geoStatus: GeoStatus
  geoSource?: GeoSource
  geoPlace?: string
  lat?: number
  lng?: number
  /** Alpha-3; present only when the event had no country and the result supplies one. */
  country?: string
  /** ISO timestamp of this attempt. */
  geocodedAt: string
  /** Why, for the log and the script's report. Never shown to visitors. */
  detail?: string
}

export type GeoDeps = {
  /** Returns the model's raw reply. May throw — that becomes `failed`. */
  askModel: (input: EventGeoInput) => Promise<string>
  /** `null` = no such place; a throw = could not ask. */
  geocode: (request: GeocodeRequest) => Promise<GeocodeHit | null>
  now: () => Date
}

/** 0.1 degrees is about 11km: city level, and not false precision. */
export function roundCoord(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * The place an edition's free-text `location` points at when the race starts.
 *
 * Locations are written for people: "Olympic Valley → Auburn, California",
 * "Charlevoix / Côte-de-Beaupré, Québec", "Mallorca (Serra de Tramuntana /
 * Es Port)". A point-to-point race or a multi-venue one names several
 * places, and a dot can sit in only one — the start, because that is where
 * the club's runners are standing when the gun goes.
 *
 * The region is usually written once, on the last part ("Sierre → Zinal,
 * Valais"). Taking only the first part would send "Sierre" to the geocoder
 * alone, so the trailing region is carried over when the first part has none
 * of its own. Parenthetical remarks are dropped before splitting: the slash
 * inside "(Serra de Tramuntana / Es Port)" is not a second venue.
 */
export function startPlaceOf(location: string | null | undefined): string | null {
  if (typeof location !== 'string') return null
  const cleaned = location
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .trim()
  if (!cleaned) return null

  const parts = cleaned
    .split(/\s*(?:→|->|\/)\s*|\s+to\s+/i)
    .map((part) => part.trim().replace(/^[,\s]+|[,\s]+$/g, ''))
    .filter(Boolean)
  if (parts.length === 0) return null

  const first = parts[0]
  const last = parts[parts.length - 1]
  const place =
    parts.length > 1 && !first.includes(',') && last.includes(',')
      ? `${first}, ${last.slice(last.indexOf(',') + 1).trim()}`
      : first
  return place.length > 0 && place.length <= 120 ? place : null
}

export type ModelPlace = {
  city: string
  region?: string
  /** Upper-case, and only when it is a code in `iso-alpha.ts`. */
  countryAlpha2?: string
}

/**
 * The model's reply, as a place or as nothing.
 *
 * Anything that is not the requested object is "no place" rather than an
 * attempt to rescue it: a reply of prose, a refusal, `null`, a JSON array or
 * an object with no city all mean the model did not know, and the cost of
 * treating a half-answer as an answer is a dot on the wrong continent.
 * Fenced output is unwrapped because models add fences however firmly told
 * not to; that is formatting, not content.
 */
export function parseModelPlace(reply: string | null | undefined): ModelPlace | null {
  if (typeof reply !== 'string') return null
  let text = reply.trim()
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fenced) text = fenced[1].trim()
  if (text === '' || /^null$/i.test(text)) return null

  const open = text.indexOf('{')
  const close = text.lastIndexOf('}')
  if (open === -1 || close <= open) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(open, close + 1))
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null

  const record = parsed as Record<string, unknown>
  const city = typeof record.city === 'string' ? record.city.trim() : ''
  if (!city || city.length > 80) return null

  const region = typeof record.region === 'string' ? record.region.trim() : ''
  const country = typeof record.country_alpha2 === 'string' ? record.country_alpha2.trim() : ''
  const countryAlpha2 =
    /^[A-Za-z]{2}$/.test(country) && alpha2ToAlpha3(country) ? country.toUpperCase() : undefined

  return {
    city,
    ...(region && region.length <= 80 ? { region } : {}),
    ...(countryAlpha2 ? { countryAlpha2 } : {}),
  }
}

/** What the model is told. It is asked for a place, never a number. */
export const MODEL_SYSTEM = [
  'You help place trail-running and marathon events on a city-level map.',
  'You will be given an event name, its country and where its catalogue row came from.',
  'Answer with the town or city where the event STARTS, as one JSON object and nothing else:',
  '{"city": string, "region": string or null, "country_alpha2": string}',
  'country_alpha2 is the two-letter ISO 3166-1 code, e.g. "FR".',
  'Do NOT give coordinates, latitude or longitude, in any form.',
  'If you are not confident which town it starts in, answer exactly: null',
  'No explanation, no markdown fences.',
].join('\n')

export function modelPrompt(input: EventGeoInput): string {
  return [
    `Event: ${input.name}${input.nameZh ? ` (${input.nameZh})` : ''}`,
    `Country (ISO alpha-3): ${input.country || 'unknown'}`,
    `Catalogue source: ${input.source || 'unknown'}`,
  ].join('\n')
}

type Candidate = {
  query: string
  source: 'edition' | 'ai'
  countryAlpha2?: string
}

/**
 * Resolve one event. Never throws: every way it can go wrong is a status the
 * admin can filter on, and the caller's job is only to store the answer.
 */
export async function resolveEventGeo(deps: GeoDeps, input: EventGeoInput): Promise<GeoOutcome> {
  const geocodedAt = deps.now().toISOString()
  const eventAlpha2 = alpha3ToAlpha2(input.country)

  // --- 1. a place name ----------------------------------------------------
  let candidate: Candidate
  const editionPlace = startPlaceOf(input.editionLocation)
  if (editionPlace) {
    candidate = { query: editionPlace, source: 'edition', countryAlpha2: eventAlpha2 }
  } else {
    let reply: string
    try {
      reply = await deps.askModel(input)
    } catch (error) {
      return { geoStatus: 'failed', geocodedAt, detail: `model: ${describe(error)}` }
    }
    const place = parseModelPlace(reply)
    if (!place) return { geoStatus: 'no-place', geocodedAt, detail: 'model named no place' }

    // The model contradicting the catalogue is a reason to distrust the whole
    // answer, not to pick a side: if it is wrong about the country it may be
    // wrong about the town.
    if (eventAlpha2 && place.countryAlpha2 && place.countryAlpha2 !== eventAlpha2) {
      return {
        geoStatus: 'no-place',
        geocodedAt,
        detail: `model said ${place.countryAlpha2}, catalogue says ${eventAlpha2}`,
      }
    }
    candidate = {
      query: [place.city, place.region].filter(Boolean).join(', '),
      source: 'ai',
      countryAlpha2: eventAlpha2 ?? place.countryAlpha2,
    }
  }

  // --- 2. a point ---------------------------------------------------------
  let hit: GeocodeHit | null
  let relaxed = false
  try {
    hit = await deps.geocode({ query: candidate.query, countryAlpha2: candidate.countryAlpha2 })
    if (!hit && mayRelax(candidate)) {
      hit = await deps.geocode({
        query: candidate.query,
        countryAlpha2: candidate.countryAlpha2,
        relaxed: true,
      })
      // A street is not where a race is (see `mayRelax`). Not-found, not
      // failed: the geocoder answered, and what it answered is unusable.
      if (hit && hit.category === 'highway') {
        return {
          geoStatus: 'not-found',
          geocodedAt,
          detail: `relaxed query for "${candidate.query}" matched a street ("${hit.displayName}")`,
        }
      }
      relaxed = hit !== null
    }
  } catch (error) {
    return { geoStatus: 'failed', geocodedAt, detail: `geocoder: ${describe(error)}` }
  }
  if (!hit) {
    return { geoStatus: 'not-found', geocodedAt, detail: `no place for "${candidate.query}"` }
  }
  // Belt and braces: `countrycodes` already makes this impossible against
  // Nominatim. It is checked anyway because the geocoder is a replaceable
  // file, and the guard should not live only in one implementation.
  if (candidate.countryAlpha2 && hit.countryAlpha2 && hit.countryAlpha2 !== candidate.countryAlpha2) {
    return {
      geoStatus: 'not-found',
      geocodedAt,
      detail: `"${candidate.query}" resolved to ${hit.countryAlpha2}, expected ${candidate.countryAlpha2}`,
    }
  }

  return {
    geoStatus: 'ok',
    geoSource: candidate.source,
    // The name actually matched, plus a marker when it took the looser query:
    // a relaxed hit can be a district or an island, which is fine for a
    // city-level dot but is what a reviewer should look at first. It lives in
    // `geoPlace` — a column that is already visible in the admin form and
    // searchable in the list filter ("Place contains relaxed") — rather than
    // in a new field, so it needs no migration and travels through
    // data/race-event-places.csv untouched.
    geoPlace: relaxed ? `${hit.displayName}${RELAXED_MARK}` : hit.displayName,
    lat: roundCoord(hit.lat),
    lng: roundCoord(hit.lng),
    ...(input.country ? {} : countryFrom(hit.countryAlpha2 ?? candidate.countryAlpha2)),
    geocodedAt,
    ...(relaxed ? { detail: `relaxed query matched "${hit.displayName}"` } : {}),
  }
}

export const RELAXED_MARK = ' (relaxed)'

/**
 * May a place the strict query missed be asked again without
 * `featureType=settlement`?
 *
 * Only where something other than the query still pins the answer.
 *   - With a country, `countrycodes` is the pin: the looser question can
 *     only land in the right country, which is the same guard the strict one
 *     had.
 *   - With no country, the pin has to come from the text. An edition's
 *     `location` was written down by a person from the organiser's page and
 *     usually carries its own region ("Sai Kung, New Territories"), so the
 *     words constrain the match. A name the model produced with no country
 *     beside it has nothing: "Valdivia" or "Kimberley" unrestricted and
 *     unfiltered by feature type is exactly how a namesake on another
 *     continent wins. That stays `not-found`, where a person will see it.
 *
 * And even with a pin, the relaxed hit must not be a street (OSM category
 * `highway`). The strict query excluded streets by construction; dropping
 * `featureType` lets them back in, and the first local run proved it:
 * utmb-pacific-trails ("Santa Ynez Valley, California") matched Santa Ynez
 * Street in Orange County, 150km from the race. Other categories are kept —
 * a hit on a clinic or a park in the right town is still the right town
 * (Katoomba) and the " (relaxed)" mark flags it for review; a street can be
 * in the right country and the wrong region with nothing to show for it.
 */
function mayRelax(candidate: Candidate): boolean {
  return Boolean(candidate.countryAlpha2) || candidate.source === 'edition'
}

function countryFrom(alpha2: string | undefined): { country?: string } {
  const alpha3 = alpha2ToAlpha3(alpha2)
  return alpha3 ? { country: alpha3 } : {}
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// --- when to run -----------------------------------------------------------
//
// Kept here, pure, rather than inside the hook: these are the rules that
// decide whether an automatic process may overwrite a person's work, and they
// are the part worth a test.

const hasPoint = (doc: { lat?: unknown; lng?: unknown }) =>
  typeof doc.lat === 'number' && typeof doc.lng === 'number'

type EventDoc = {
  name?: string | null
  country?: string | null
  lat?: number | null
  lng?: number | null
  geoSource?: string | null
  geoStatus?: string | null
}

/**
 * Should saving this event schedule a lookup?
 *
 * `manual` never — a person put that dot there, and nothing automatic may
 * move it. A point already present never. On creation always. On a later save
 * only when there is a reason to believe a retry could now succeed: the
 * lookup never ran or failed in transit, or what it was asked about (name,
 * country) has changed. A `no-place` or `not-found` event saved again for an
 * unrelated reason must not spend another model call per save; those are
 * retried by the batch script, or by an edition gaining a location.
 */
export function shouldResolveEvent({
  operation,
  doc,
  previousDoc,
}: {
  operation: 'create' | 'update'
  doc: EventDoc
  previousDoc?: EventDoc
}): boolean {
  if (doc.geoSource === 'manual') return false
  if (hasPoint(doc)) return false
  if (operation === 'create') return true
  if (!doc.geoStatus || doc.geoStatus === 'failed') return true
  return Boolean(
    previousDoc && (previousDoc.name !== doc.name || (previousDoc.country ?? '') !== (doc.country ?? '')),
  )
}

/**
 * Should an edition's new location re-point its event? Anything but `manual`
 * may be replaced by it — including an earlier `edition` result, because a
 * race that moved city should move on the map — and an `ai` guess is exactly
 * what an edition is meant to outrank.
 */
export function shouldRefreshFromEdition({
  eventGeoSource,
  location,
  previousLocation,
}: {
  eventGeoSource: string | null | undefined
  location: string | null | undefined
  previousLocation: string | null | undefined
}): boolean {
  if (eventGeoSource === 'manual') return false
  const next = (location ?? '').trim()
  if (!next) return false
  return next !== (previousLocation ?? '').trim()
}

const asNumber = (value: unknown): number | null =>
  value === undefined || value === null || value === '' || Number.isNaN(Number(value))
    ? null
    : Number(value)

/**
 * Did a person set the coordinates by hand in this save?
 *
 * The automatic write-back arrives with `context.skipGeocode`, so the hook
 * only asks this for everything else: the admin form, the REST API, a script
 * that did not say it was automatic. A save that merely carries the existing
 * coordinates back (the admin form sends every field) is not an edit; neither
 * is clearing them, which is how a person asks for the lookup to run again.
 */
export function isHandEditedPoint({
  operation,
  data,
  originalDoc,
}: {
  operation: 'create' | 'update'
  data: { lat?: unknown; lng?: unknown; [key: string]: unknown }
  originalDoc?: { lat?: unknown; lng?: unknown } | null
}): boolean {
  if (operation === 'create') return asNumber(data.lat) !== null || asNumber(data.lng) !== null
  // A key absent from `data` is a partial update that did not touch it, not
  // an edit to nothing — comparing it would read "lng missing" as "lng cleared".
  const edited = (key: 'lat' | 'lng') =>
    data[key] !== undefined &&
    asNumber(data[key]) !== null &&
    asNumber(data[key]) !== asNumber(originalDoc?.[key])
  return edited('lat') || edited('lng')
}
