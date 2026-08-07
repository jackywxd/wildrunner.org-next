import type { CollectionBeforeChangeHook, Payload, PayloadRequest } from 'payload'

/**
 * Resolve `eventId`/`distanceId`/`year` into real foreign keys —
 * `edition` (→ race-editions) and `category` (→ race-categories) —
 * alongside the strings, not instead of them.
 *
 * WHY ALONGSIDE, NOT A REPLACEMENT. `race_records` is the last collection
 * in the domain model still keyed by text: `race-events`, `race-categories`,
 * `race-editions` and `media.raceEdition` all use real relationships now.
 * A foreign key cannot point at something that does not exist — the same
 * guarantee `validateRaceCatalogueRef` exists to give the strings by
 * checking them at write time instead. This is additive: the strings stay
 * authoritative for every existing reader (badge rendering, the public
 * directory, the race-report picker), and nothing that reads them today
 * has to change for this to land.
 *
 * A SEPARATE HOOK FROM `validateRaceCatalogueRef`, DELIBERATELY. That hook's
 * one job is "does this resolve" and it throws when it does not; this one's
 * job is "write down what it resolved to". Splitting them costs one extra
 * pair of indexed lookups (querying `race-events`/`race-categories` again,
 * since a `beforeValidate` hook's local variables do not carry forward to
 * `beforeChange`) in exchange for each hook staying the one thing its name
 * says. `beforeChange`, after validation: by the time this runs,
 * `eventId`/`distanceId` are already known-good, so there is nothing left
 * to validate — only something left to derive, the same stage `setOwner`
 * already derives a field at.
 *
 * THE EDITION MAY NOT EXIST YET, AND THAT IS EXPECTED. `race_editions` is
 * derived from `race_schedule` — the current, reviewed near-term calendar,
 * about 18 rows. `race_categories` — what the claim picker actually offers
 * — spans the full catalogue, roughly 100 events, and a record's `year` is
 * accepted from `EARLIEST_RACE_YEAR` (2010) through next year
 * (`RaceRecords.ts`). A member claiming a 2015 Hardrock is claiming a real
 * edition that nobody has dated — RaceEditions.ts's own header names this
 * exact case as the reason `startDate` is optional at all. So a missing
 * edition here is the common path, not an error.
 *
 * find-or-create, restricted exactly as docs/plan's S1 requires: ONLY
 * `event` and `year` are ever written by this path. Never a location, a
 * date, a URL, a registration window — a member's claim can name a race
 * and a year, never dictate what the *public* schedule says about it. That
 * is what an admin adds by hand if they choose to enrich the row later.
 * `overrideAccess: true` is what makes the create possible at all —
 * `race-editions.create` is admin-only (RaceEditions.ts) precisely so a
 * member cannot otherwise put an arbitrary row on the public calendar —
 * and it is scoped to exactly this narrow write, not exposed as a general
 * capability.
 *
 * THE RACE, NAMED. Two members claiming the same never-before-claimed
 * (event, year) in the same moment can both see "no edition" and both
 * attempt to create one; `race-editions`' own `UNIQUE(event, year)` index
 * (RaceEditions.ts) refuses the loser's insert. Caught and re-queried
 * rather than left to throw — the winner's row is the one both records
 * should point at, the same "somebody else won, look again" shape
 * `ensureRaceRecord` already uses for race-records' own duplicate check.
 *
 * BEST-EFFORT, NOT A HARD REQUIREMENT. If resolution genuinely cannot
 * complete — the retry above still finds nothing, which should not happen
 * but is not this hook's guarantee to make impossible — the record is
 * still written with its strings alone, exactly as it would have been
 * before this hook existed. A backfill enhancement failing is not a reason
 * to fail the member's write.
 */
export async function resolveRaceRecordRefs(
  payload: Payload,
  input: { eventId: string; distanceId?: string; year: number },
  req?: PayloadRequest,
): Promise<{ editionId?: number; categoryId?: number }> {
  const { eventId, distanceId, year } = input

  // `validateRaceCatalogueRef` already guarantees this resolves whenever it
  // runs (every collection write) — this call is defensive, not load-bearing,
  // for the one caller (the backfill script) that does not go through it.
  const events = await payload.find({
    collection: 'race-events',
    where: { key: { equals: eventId } },
    limit: 1,
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
  })
  const event = events.docs[0]
  if (!event) return {}

  let categoryId: number | undefined
  if (distanceId) {
    const categories = await payload.find({
      collection: 'race-categories',
      where: { and: [{ event: { equals: event.id } }, { key: { equals: distanceId } }] },
      limit: 1,
      depth: 0,
      pagination: false,
      overrideAccess: true,
      req,
    })
    categoryId = categories.docs[0]?.id
  }

  const editions = await payload.find({
    collection: 'race-editions',
    where: { and: [{ event: { equals: event.id } }, { year: { equals: year } }] },
    limit: 1,
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
  })
  let edition = editions.docs[0]

  if (!edition) {
    try {
      edition = await payload.create({
        collection: 'race-editions',
        data: { event: event.id, year },
        overrideAccess: true,
        req,
      })
    } catch {
      const retry = await payload.find({
        collection: 'race-editions',
        where: { and: [{ event: { equals: event.id } }, { year: { equals: year } }] },
        limit: 1,
        depth: 0,
        pagination: false,
        overrideAccess: true,
        req,
      })
      edition = retry.docs[0]
    }
  }

  return { editionId: edition?.id, categoryId }
}

export const populateRaceRecordRefs: CollectionBeforeChangeHook = async ({ data, req }) => {
  if (!data) return data

  const eventId = data.eventId
  const year = data.year
  if (typeof eventId !== 'string' || eventId === '') return data
  if (typeof year !== 'number' || !Number.isInteger(year)) return data

  const distanceId = typeof data.distanceId === 'string' ? data.distanceId : undefined

  const { editionId, categoryId } = await resolveRaceRecordRefs(
    req.payload,
    { eventId, distanceId, year },
    req,
  )
  if (editionId !== undefined) data.edition = editionId
  if (categoryId !== undefined) data.category = categoryId

  return data
}
