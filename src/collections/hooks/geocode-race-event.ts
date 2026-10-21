import type { CollectionAfterChangeHook, CollectionBeforeChangeHook } from 'payload'

import { afterResponse } from '../../lib/geo/after-response'
import { resolveAndWriteEvent } from '../../lib/geo/geocode-event'
import {
  isHandEditedPoint,
  shouldRefreshFromEdition,
  shouldResolveEvent,
} from '../../lib/geo/resolve-event-place'

/**
 * The three hooks that keep `race-events.lat/lng` filled in and keep a
 * person's correction.
 *
 * What each one decides is in `src/lib/geo/resolve-event-place.ts` as a pure
 * function with a test (`U-GEO-T2`); this file is the Payload plumbing around
 * those, and the reasons for the plumbing.
 *
 * EVERY WRITE-BACK CARRIES `context.skipGeocode`. The lookup ends in a
 * `payload.update` on the event, which fires `afterChange` again; without the
 * flag that update would schedule the lookup that made it. The flag is also
 * how `markHandEditedPoint` tells the automatic write apart from a person's:
 * both change `lat`, and only one of them is a correction.
 *
 * WHICH WRITERS REACH THESE HOOKS (AGENTS.md: "`payload.db.create` does not
 * fall through"). Checked by grep, not assumed. Everything that creates or
 * edits a `race-events` row from application code goes through
 * `payload.create` / `payload.update`: the admin, `ultrasignupImport` (a new
 * event for an unseen race), and the scripts. The two that do NOT are
 * migrations — `20260805_153543_add_race_domain_model` and
 * `20260829_041500_add_marathon_majors` insert the catalogue with raw SQL,
 * because 494 rows through the Local API would be minutes — so the events they
 * create start with no point, and `pnpm geocode:events` is what backfills
 * them. Nothing here depends on those two being different.
 */

/**
 * A person typed coordinates: the point is theirs from now on.
 *
 * `geoStatus` is set alongside because a hand-placed point is, by definition,
 * placed — leaving a stale `no-place` next to it would put an event with a
 * dot in the admin's "needs attention" filter.
 */
export const markHandEditedPoint: CollectionBeforeChangeHook = ({
  data,
  originalDoc,
  operation,
  context,
}) => {
  if (context?.skipGeocode) return data
  if (operation !== 'create' && operation !== 'update') return data
  if (!isHandEditedPoint({ operation, data, originalDoc })) return data
  return { ...data, geoSource: 'manual', geoStatus: 'ok' }
}

/** A new event, or one whose name/country changed, gets looked up after the response. */
export const scheduleEventGeocode: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  operation,
  req,
  context,
}) => {
  if (context?.skipGeocode) return doc
  if (operation !== 'create' && operation !== 'update') return doc
  if (!shouldResolveEvent({ operation, doc, previousDoc })) return doc

  const { payload } = req
  await afterResponse(async () => {
    await resolveAndWriteEvent(payload, doc.id, { onlyIfNoPoint: true })
  })
  return doc
}

/**
 * An edition gained or changed its location: the event may now be placed
 * from a source a person wrote down, which outranks a model's guess.
 *
 * The cheap test (did the location text change) runs here; whether the event
 * is `manual`, and whether this is the newest edition with a location, need
 * queries and run inside the scheduled task, after the response.
 */
export const geocodeFromEdition: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  operation,
  req,
  context,
}) => {
  if (context?.skipGeocode) return doc
  const eventId = typeof doc.event === 'object' && doc.event !== null ? doc.event.id : doc.event
  if (typeof eventId !== 'number') return doc
  if (
    !shouldRefreshFromEdition({
      eventGeoSource: undefined,
      location: doc.location,
      previousLocation: operation === 'update' ? previousDoc?.location : undefined,
    })
  ) {
    return doc
  }

  const { payload } = req
  await afterResponse(async () => {
    await resolveAndWriteEvent(payload, eventId, { triggerEditionId: doc.id })
  })
  return doc
}
