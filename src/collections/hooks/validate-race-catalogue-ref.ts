import type { CollectionBeforeValidateHook } from 'payload'
import { ValidationError } from 'payload'

/**
 * Reject an eventId/distanceId that does not resolve against `race-events`
 * and `race-categories` — the database, not `src/lib/races/catalogue.ts`.
 *
 * WHY THIS MOVED. Two real member records reached production naming
 * categories the reviewed catalogue does not have:
 * `utmb-puerto-vallarta/100m` (that race has never run a 100M — the in-code
 * catalogue gave it the *assumed* UTMB default of 20K/50K/100K/100M) and
 * `wtm-mt-fuji/ultra` (`ultra` is a World Trail Majors ranking tier, not
 * something anyone enters). Neither was the member's mistake: the picker UI
 * and this collection's old field-level `validate` both read
 * `catalogue.ts`, so an option that only existed there was offered and then
 * accepted. `data/race-categories.csv` — reviewed, and what the picker now
 * reads via `race-categories` — never had either.
 * (docs/testing-plan.md, "The catalogue and the database disagree".)
 *
 * A category that is a foreign key cannot point at something that does not
 * exist. This is the closest a `text` field storing a key can get to that
 * guarantee: check it against the same rows the picker offers, every write.
 *
 * A `beforeValidate` COLLECTION hook, not two field-level `validate`
 * functions, for the same reason `uniqueRaceRecord` is one: the two ids
 * depend on each other (a distance is only valid *for this event*), and one
 * query pair here is simpler to reason about than coordinating two
 * independent field validators that would otherwise each requery.
 *
 * RECORDS ALREADY STORED ARE NEVER RE-VALIDATED unless edited — same
 * contract `badge-source.ts`'s fallback documents. A category renamed or
 * removed after a record was written does not retroactively break that
 * record; the badge degrades to a neutral placeholder instead (A-T4).
 */
export const validateRaceCatalogueRef: CollectionBeforeValidateHook = async ({
  data,
  req,
}) => {
  if (!data) return data

  const eventId = data.eventId
  // Required-ness is the field's own concern (a plain, DB-free check) — this
  // hook only judges a value that is actually present.
  if (typeof eventId !== 'string' || eventId === '') return data

  const events = await req.payload.find({
    collection: 'race-events',
    where: { key: { equals: eventId } },
    limit: 1,
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
  })
  const event = events.docs[0]
  if (!event) {
    throw new ValidationError({
      errors: [{ path: 'eventId', message: `Unknown race event: ${eventId}` }],
      req,
    })
  }

  const distanceId = data.distanceId
  if (typeof distanceId !== 'string' || distanceId === '') return data

  const categories = await req.payload.find({
    collection: 'race-categories',
    where: {
      and: [{ event: { equals: event.id } }, { key: { equals: distanceId } }],
    },
    limit: 1,
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
  })
  if (!categories.docs[0]) {
    throw new ValidationError({
      errors: [
        {
          path: 'distanceId',
          message: `${event.name} has no distance "${distanceId}"`,
        },
      ],
      req,
    })
  }

  return data
}
