/**
 * `data/race-event-places.csv` — where each event was last placed on the map.
 *
 * THE FILE HAS TWO READERS AND ONE WRITER.
 *   - `pnpm geocode:events --export` writes it from the database, so a change
 *     in where the club's races sit is a diff a person can read and accept.
 *     Nothing writes it behind anyone's back.
 *   - The test stand-in (`geocode-event.ts`) reads it. CI and a plain
 *     `pnpm dev` make no network call — the same gate `realAIAvailable()`
 *     applies to the model — so "geocoding" in those environments is a lookup
 *     in this file by event key, and a key that is not in it is `no-place`.
 *     That is also what puts coordinates in the corpus `db:reset:local` builds.
 *
 * Columns: event_key,place,lat,lng,source,geocoded_at. `source` is
 * `edition | ai | manual`, the same vocabulary as `race-events.geoSource`.
 *
 * A reviewer should read `source` first. `edition` rows rest on a location
 * somebody copied from an organiser's page; `ai` rows rest on a model's idea
 * of where a race starts, geocoded and country-checked but not human-read.
 */

export const PLACE_COLUMNS = ['event_key', 'place', 'lat', 'lng', 'source', 'geocoded_at'] as const

export type PlaceRow = {
  eventKey: string
  place: string
  lat: number
  lng: number
  source: 'edition' | 'ai' | 'manual'
  geocodedAt: string
}

const SOURCES = new Set(['edition', 'ai', 'manual'])

export function parsePlaceCsv(text: string): PlaceRow[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else quoted = false
      } else field += char
      continue
    }
    if (char === '"') quoted = true
    else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') field += char
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }

  const [header, ...body] = rows.filter((cells) => cells.some((cell) => cell !== ''))
  if (!header) return []
  const at = Object.fromEntries(PLACE_COLUMNS.map((name) => [name, header.indexOf(name)]))
  if (PLACE_COLUMNS.some((name) => at[name] === -1)) {
    throw new Error(`race-event-places.csv must have columns ${PLACE_COLUMNS.join(',')}`)
  }

  return body.map((cells, line) => {
    const get = (name: (typeof PLACE_COLUMNS)[number]) => (cells[at[name]] ?? '').trim()
    const lat = Number(get('lat'))
    const lng = Number(get('lng'))
    const source = get('source')
    if (!get('event_key') || !Number.isFinite(lat) || !Number.isFinite(lng) || !SOURCES.has(source)) {
      throw new Error(`race-event-places.csv row ${line + 2} is malformed: ${cells.join(',')}`)
    }
    return {
      eventKey: get('event_key'),
      place: get('place'),
      lat,
      lng,
      source: source as PlaceRow['source'],
      geocodedAt: get('geocoded_at'),
    }
  })
}

const cell = (value: string | number) => {
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Sorted by key, so re-exporting an unchanged database is an empty diff. */
export function serializePlaceCsv(rows: PlaceRow[]): string {
  const sorted = [...rows].sort((a, b) => (a.eventKey < b.eventKey ? -1 : a.eventKey > b.eventKey ? 1 : 0))
  const lines = sorted.map((row) =>
    [row.eventKey, row.place, row.lat, row.lng, row.source, row.geocodedAt].map(cell).join(','),
  )
  return `${PLACE_COLUMNS.join(',')}\n${lines.join('\n')}${lines.length ? '\n' : ''}`
}
