/**
 * What `/races` is filtered by, read from and written back to the URL.
 *
 * EXTRACTED SO THERE IS ONE COPY. The query string was built in two places
 * — `href()` in RaceScheduleFilters.tsx for the chips and `pageHref()` in
 * races/page.tsx for the pager — each enumerating the parameters by hand.
 * Two hand-synced copies of the same list means a filter added to one and
 * forgotten in the other silently drops itself the moment somebody pages,
 * and nothing fails: the page still renders, just without the filter the
 * visitor asked for. Adding the qualifier filter would have been the third
 * parameter to keep in step, so it became one function instead.
 *
 * Parsing lives here too, which is the other half: it validates an
 * attacker-controlled query string, and inside a server component it could
 * not be exercised by a test at all.
 */
import { RACE_SERIES } from './catalogue'
import type { RaceSeries } from './catalogue'
import { RACE_QUALIFIERS } from './qualifiers'
import type { RaceQualifier } from './qualifiers'

export type RaceView = 'list' | 'calendar'

export type RaceFilters = {
  view: RaceView
  series?: RaceSeries
  registration?: 'open'
  qualifier?: RaceQualifier
}

/**
 * The canonical query string for a filter set.
 *
 * `list` and "no filter" are the defaults, so leaving them out keeps the
 * canonical URL clean — /races, not /races?view=list&series=all.
 */
export function raceFiltersToParams(filters: RaceFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.view !== 'list') params.set('view', filters.view)
  if (filters.series) params.set('series', filters.series)
  if (filters.registration) params.set('registration', filters.registration)
  if (filters.qualifier) params.set('qualifier', filters.qualifier)
  return params
}

/** `/races` with these filters, and optionally a month anchor. */
export function raceFiltersHref(filters: RaceFilters, anchor?: string): string {
  const params = raceFiltersToParams(filters)
  if (anchor) params.set('from', anchor)
  const query = params.toString()
  return query ? `/races?${query}` : '/races'
}

export function parseRaceFilters(
  params: Record<string, string | string[] | undefined>,
): RaceFilters {
  const one = (value: string | string[] | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : value

  const view = one(params.view)
  const series = one(params.series)
  const qualifier = one(params.qualifier)

  return {
    registration: one(params.registration) === 'open' ? 'open' : undefined,
    // Anything unrecognised falls back to the default rather than erroring:
    // these come from the query string, so they are attacker-controlled and
    // also just as often a stale bookmark.
    qualifier: RACE_QUALIFIERS.includes(qualifier as RaceQualifier)
      ? (qualifier as RaceQualifier)
      : undefined,
    series: RACE_SERIES.includes(series as RaceSeries) ? (series as RaceSeries) : undefined,
    view: (view === 'calendar' ? 'calendar' : 'list') as RaceView,
  }
}
