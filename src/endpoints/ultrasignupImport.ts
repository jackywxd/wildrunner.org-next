import type { Endpoint, PayloadRequest } from 'payload'
import { APIError } from 'payload'

import { isRaceYearClaimable } from '@/lib/races/catalogue'
import { historicalKey, matchRow } from '@/lib/ultrasignup/match'
import type { ParsedResult } from '@/lib/ultrasignup/parse'
import type { RaceCategory, RaceRecord } from '@/payload-types'

import { fetchOrFail, matchCatalogue, storedName } from './ultrasignupResults'

/**
 * Import one UltraSignup row whose distance the catalogue does not list.
 *
 * The client names the row — person id, title, date — and nothing else.
 * What gets written to `race-categories` is shared reference data every
 * badge reads, so its label cannot come from the request: this re-fetches
 * UltraSignup under the member's stored name, finds that row, and runs the
 * same `matchRow` the list ran. Only "new-distance" creates anything; a
 * row that has become "ready" in the meantime (another member's import
 * created the entry first) imports against what is there.
 *
 * The category is found-or-created on `(event, key)`, which is a unique
 * index, with the re-query `resolveRaceRecordRefs` uses for editions when
 * two inserts race. A key that already belongs to a different label is
 * refused rather than reused — the distance check said this entry is new,
 * so a key collision means something the matcher cannot see.
 *
 * The record is then created as the member, through the collection, so
 * ownership, catalogue validation and per-member uniqueness all apply
 * exactly as they do for a hand-entered record. If that write fails the
 * category stays: it is still a true statement that the entry ran.
 */

/** Every message down the `cause` chain: Drizzle's `.message` is its own summary. */
function causeChain(error: unknown): string {
  const parts: string[] = []
  let current: unknown = error
  for (let depth = 0; depth < 8 && current instanceof Error; depth += 1) {
    parts.push(current.message)
    current = current.cause
  }
  return parts.length > 0 ? parts.join(' <- ') : String(error)
}

async function ensureHistoricalCategory(
  req: PayloadRequest,
  eventRowId: number,
  label: string,
  result: ParsedResult,
): Promise<string> {
  const key = historicalKey(label)
  if (!key) throw new APIError('This distance has no usable name.', 409)

  const find = async () =>
    (
      await req.payload.find({
        collection: 'race-categories',
        depth: 0,
        limit: 1,
        overrideAccess: true,
        pagination: false,
        req,
        where: { and: [{ event: { equals: eventRowId } }, { key: { equals: key } }] },
      })
    ).docs[0] as RaceCategory | undefined

  let category = await find()
  if (!category) {
    try {
      category = (await req.payload.create({
        collection: 'race-categories',
        data: {
          event: eventRowId,
          historical: true,
          key,
          label,
          order: 999,
          // The title and day, not the member's results page: this
          // collection is publicly readable and that URL carries their name.
          source: `UltraSignup: ${result.rawName} (${result.date})`,
          verified: false,
        },
        overrideAccess: true,
        req,
      })) as RaceCategory
    } catch (error) {
      // The expected failure is the (event, key) unique index: another
      // member's import created it between our find and our create, and
      // the re-find returns their row. Anything else re-finds nothing, and
      // then the create's own error is the answer — not a bare 500.
      category = await find()
      if (!category) {
        req.payload.logger.error(
          `ultrasignup: could not create category ${key} on event ${eventRowId}: ${causeChain(error)}`,
        )
        throw error
      }
    }
  }
  if (!category) throw new APIError('Could not add this distance.', 500)
  if (category.label !== label) {
    throw new APIError(`${key} already names a different distance at this race.`, 409)
  }
  return category.key
}

export const ultrasignupImportEndpoint: Endpoint = {
  path: '/members/ultrasignup-import',
  method: 'post',
  handler: async (req) => {
    const name = await storedName(req)

    const body = (await req.json?.()) as
      | { date?: unknown; personId?: unknown; rawName?: unknown }
      | undefined
    const personId = typeof body?.personId === 'number' ? body.personId : NaN
    const rawName = typeof body?.rawName === 'string' ? body.rawName : ''
    const date = typeof body?.date === 'string' ? body.date : ''
    if (!Number.isInteger(personId) || !rawName || !date) {
      throw new APIError('personId, rawName and date are required.', 400)
    }

    const [catalogue, { failures, people }] = await Promise.all([
      matchCatalogue(req),
      fetchOrFail(req, name),
    ])
    const result = people
      .find((person) => person.id === personId)
      ?.results.find((row) => row.rawName === rawName && row.date === date)
    if (!result) {
      // With a split unanswered, "not found" may only mean "not fetched":
      // the person could live under exactly the split that failed.
      if (failures.length > 0) {
        throw new APIError('UltraSignup did not fully answer. Try again shortly.', 503)
      }
      throw new APIError('That result is not on UltraSignup under your saved name.', 404)
    }
    if (result.status === 'other' || !isRaceYearClaimable(result.year, new Date())) {
      throw new APIError('That result cannot be imported as a race record.', 400)
    }

    const match = matchRow(catalogue.events, result.eventName, result.distanceText)
    let distanceId: string
    if (match.kind === 'ready') {
      distanceId = match.distanceId
    } else if (match.kind === 'new-distance') {
      const eventRowId = catalogue.eventRowIds.get(match.eventId)
      if (eventRowId === undefined) throw new APIError('Unknown race event.', 409)
      distanceId = await ensureHistoricalCategory(req, eventRowId, match.distanceLabel, result)
    } else {
      throw new APIError('That result does not resolve to one catalogue race.', 409)
    }

    const doc = (await req.payload.create({
      collection: 'race-records',
      data: {
        distanceId,
        eventId: match.eventId,
        finishSeconds: result.status === 'finished' ? result.finishSeconds : null,
        result: result.status,
        year: result.year,
      } as Omit<RaceRecord, 'createdAt' | 'id' | 'owner' | 'updatedAt'> as RaceRecord,
      overrideAccess: false,
      req,
    })) as RaceRecord

    return Response.json({ doc }, { status: 201 })
  },
}
