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
 * Two outcomes are deliberately distinct. `null` means Nominatim answered and
 * had nothing (`not-found`: a person should look at the place name). A thrown
 * `GeocodeError` means it did not answer (`failed`: retry later). Collapsing
 * them would make a network blip look like a bad place name and stop the
 * batch script from ever retrying it.
 */

export type GeocodeRequest = {
  /** Free-text place, e.g. "Squamish, British Columbia". */
  query: string
  /** ISO alpha-2, any case. Restricts results to this country. */
  countryAlpha2?: string
}

export type GeocodeHit = {
  lat: number
  lng: number
  /** The settlement's own name, as the geocoder spells it. */
  displayName: string
  /** ISO alpha-2, upper case, when the geocoder reports one. */
  countryAlpha2?: string
}

export class GeocodeError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'GeocodeError'
  }
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

export function buildSearchUrl({ query, countryAlpha2 }: GeocodeRequest): string {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '1',
    featureType: 'settlement',
    addressdetails: '1',
    // One spelling per place regardless of the caller's locale: the result is
    // stored and shown later, to readers of either language.
    'accept-language': 'en',
  })
  if (countryAlpha2) params.set('countrycodes', countryAlpha2.trim().toLowerCase())
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
