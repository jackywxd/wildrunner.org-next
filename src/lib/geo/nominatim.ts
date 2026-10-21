import { alpha2ToAlpha3 } from './iso-alpha'

/**
 * Place name -> city-level coordinates, through OpenStreetMap's Nominatim.
 *
 * THE ONLY FILE THAT KNOWS WHO THE GEOCODER IS. Nominatim's public instance
 * is for low traffic and says so; if the club ever outgrows it, a self-hosted
 * Nominatim or a paid geocoder replaces this file and nothing else — callers
 * see `geocodePlace`, a `GeocodeHit` and a `GeocodeError`.
 *
 * THE USAGE POLICY IS THE DESIGN (operations.osmfoundation.org/policies/nominatim):
 *   - at most one request per second, from the whole application;
 *   - an identifying User-Agent, not a library default;
 *   - results are stored, not re-asked. `race-events.lat/lng` is that store,
 *     which is why nothing here caches.
 * The one-per-second limit is enforced here rather than left to callers
 * because two callers exist — the batch script and the `afterChange` hook —
 * and a UltraSignup import can create several events in one request, each of
 * which schedules its own geocode.
 *
 * `featureType=settlement` asks for towns and cities, not streets or
 * mountains: the map is drawn at city level and a house-number-precise answer
 * would be false precision. `countrycodes` is the guard that matters for a
 * place name the model supplied: with a country known, a result in any other
 * country is impossible rather than merely unlikely — "Valdivia" cannot
 * resolve to a namesake elsewhere.
 *
 * `relaxed: true` is the one step down from that. A race is often named for a
 * district, an island or a valley ("Sai Kung", "Mallorca", "Lantau Island")
 * that Nominatim files under something other than a settlement, so the strict
 * query finds nothing for a place that exists. The relaxed request is the
 * same text and the same `countrycodes`, with only `featureType` dropped —
 * nothing else is loosened, and whether it is allowed at all is decided in
 * resolve-event-place.ts, which also refuses a relaxed hit whose `category`
 * is `highway`: without `featureType` the best text match for "Santa Ynez
 * Valley" was Santa Ynez Street in Orange County, 150km from the race, and the
 * settlement filter that used to exclude streets is exactly what was dropped.
 * That is why the hit carries `category`. It is a separate request, so it goes through the
 * same one-per-second queue: the second query counts against the policy.
 *
 * `countrycodes` AND `address.country_code` ARE OSM's COUNTRIES, NOT ISO's.
 * OSM files Hong Kong and Macau under China and every French overseas
 * department under France, so `countrycodes=hk` and `countrycodes=re` match
 * nothing at all — every event with those countries ended `not-found`, which
 * reads as "the place name is wrong" when the name was fine. `OSM_COUNTRY_OVERRIDES`
 * is the explicit list of ISO countries that differ; `osmCountryCode` applies
 * it when the request is built and `sameCountry` applies it when a hit is
 * checked, so the two directions cannot drift apart. Each row was verified
 * against the live service (one query per code, the ISO one returning nothing
 * and the OSM one returning a hit whose `country_code` is that code); a code
 * that was not checked is not in the list, and falls through unchanged.
 *
 * Two outcomes are deliberately distinct. `null` means Nominatim answered and
 * had nothing (`not-found`: a person should look at the place name). A thrown
 * `GeocodeError` means it did not answer (`failed`: retry later). Collapsing
 * them would make a network blip look like a bad place name and stop the
 * batch script from ever retrying it.
 */

export type GeocodeRequest = {
  /** Free-text place, e.g. "Squamish, British Columbia". */
  query: string
  /** ISO alpha-2, any case. Restricts results to this country (translated by `osmCountryCode`). */
  countryAlpha2?: string
  /** Drop `featureType=settlement`; see the header. Everything else is unchanged. */
  relaxed?: boolean
}

export type GeocodeHit = {
  lat: number
  lng: number
  /** The settlement's own name, as the geocoder spells it. */
  displayName: string
  /**
   * Upper case, when the geocoder reports one. This is OSM's country, which is
   * ISO's for most places and not for Hong Kong or the French overseas
   * departments (`CN`, `FR`): compare it with `sameCountry`, never `===`.
   */
  countryAlpha2?: string
  /** OSM top-level class of the match (jsonv2 `category`): "place", "boundary", "highway", "amenity"… */
  category?: string
}

export class GeocodeError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'GeocodeError'
  }
}

// ISO alpha-3 (what `race-events.country` stores) then the lowercase code
// Nominatim uses for the same place. Verified against
// https://nominatim.openstreetmap.org/search on 2026-10-21; the queries are
// in the PR that added this table.
const OSM_OVERRIDES = `
HKG cn, MAC cn,
REU fr, GLP fr, MTQ fr, GUF fr, MYT fr, PYF fr, NCL fr, SPM fr, BLM fr, MAF fr, WLF fr,
SJM no, ALA fi,
PRI us, GUM us, VIR us, ASM us, MNP us,
BES nl, CUW nl, SXM nl, ABW nl,
NFK au
`

/** Every override row, for the test that checks its shape. */
export const OSM_COUNTRY_OVERRIDES: readonly (readonly [string, string])[] = OSM_OVERRIDES.split(',')
  .map((pair) => pair.trim().split(/\s+/) as [string, string])
  .filter((pair) => pair.length === 2 && pair[0] !== '')

const OSM_COUNTRY_BY_ALPHA3 = new Map<string, string>(OSM_COUNTRY_OVERRIDES)

/**
 * The code Nominatim knows this ISO alpha-2 country by, lower case. Anything
 * not in the override list is passed through, because for most countries the
 * two agree and an unlisted one was not measured.
 */
export function osmCountryCode(alpha2: string): string {
  const lower = alpha2.trim().toLowerCase()
  const alpha3 = alpha2ToAlpha3(lower)
  return (alpha3 && OSM_COUNTRY_BY_ALPHA3.get(alpha3)) || lower
}

/**
 * Is a result in the country that was asked for? `requestedAlpha2` is ISO;
 * `hitAlpha2` is what `readHit` returned, which is OSM's. Hong Kong and China
 * are one country here — OSM cannot tell them apart in an answer — but a
 * result for any *other* country is still a mismatch.
 */
export function sameCountry(requestedAlpha2: string, hitAlpha2: string): boolean {
  return osmCountryCode(requestedAlpha2) === hitAlpha2.trim().toLowerCase()
}

const ENDPOINT = 'https://nominatim.openstreetmap.org/search'

/** Identifies this application to the OSM operators, as the policy requires. */
export const USER_AGENT = 'wildrunner.org-geocoder/1.0 (+https://wildrunner.org)'

/** Measured nowhere — a generous bound for a service that answers in ~200ms. */
export const REQUEST_TIMEOUT_MS = 5_000

/** The policy's "no more than one request per second", with a margin. */
export const MIN_SPACING_MS = 1_100

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

type NominatimRow = {
  lat?: string
  lon?: string
  name?: string
  display_name?: string
  category?: string
  address?: { country_code?: string }
}

/**
 * Requests queue behind each other, per isolate.
 *
 * A promise chain, not a timestamp compared and then slept on: two callers
 * that both read "last request was long ago" would both go at once. Chaining
 * makes the reservation happen before the wait.
 */
let tail: Promise<unknown> = Promise.resolve()
let lastStartedAt = 0

function reserveSlot(): Promise<void> {
  const turn = tail.then(async () => {
    const wait = lastStartedAt + MIN_SPACING_MS - Date.now()
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    lastStartedAt = Date.now()
  })
  tail = turn.catch(() => undefined)
  return turn
}

export function buildSearchUrl({ query, countryAlpha2, relaxed }: GeocodeRequest): string {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '1',
    addressdetails: '1',
    // One spelling per place regardless of the caller's locale: the result is
    // stored and shown later, to readers of either language.
    'accept-language': 'en',
  })
  if (!relaxed) params.set('featureType', 'settlement')
  if (countryAlpha2) params.set('countrycodes', osmCountryCode(countryAlpha2))
  return `${ENDPOINT}?${params.toString()}`
}

/** Pure, so the shape of a Nominatim row is testable without a network. */
export function readHit(rows: unknown): GeocodeHit | null {
  if (!Array.isArray(rows) || rows.length === 0) return null
  const row = rows[0] as NominatimRow
  const lat = Number(row.lat)
  const lng = Number(row.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  const displayName = (row.name || row.display_name?.split(',')[0] || '').trim()
  if (!displayName) return null
  const country = row.address?.country_code
  return {
    lat,
    lng,
    displayName,
    countryAlpha2: typeof country === 'string' && country ? country.toUpperCase() : undefined,
    category: typeof row.category === 'string' && row.category ? row.category : undefined,
  }
}

export async function geocodePlace(
  request: GeocodeRequest,
  { fetchImpl = fetch as FetchLike, throttle = true }: { fetchImpl?: FetchLike; throttle?: boolean } = {},
): Promise<GeocodeHit | null> {
  if (throttle) await reserveSlot()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetchImpl(buildSearchUrl(request), {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new GeocodeError(`Nominatim answered ${response.status} for "${request.query}"`)
    }
    return readHit(await response.json())
  } catch (error) {
    if (error instanceof GeocodeError) throw error
    const reason = controller.signal.aborted
      ? `no answer within ${REQUEST_TIMEOUT_MS}ms`
      : error instanceof Error
        ? error.message
        : String(error)
    throw new GeocodeError(`Nominatim request failed for "${request.query}": ${reason}`, {
      cause: error,
    })
  } finally {
    clearTimeout(timer)
  }
}
