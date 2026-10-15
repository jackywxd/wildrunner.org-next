import type { Endpoint, PayloadRequest } from 'payload'
import { APIError } from 'payload'

import { isAdminUser } from '@/access'
import { isRaceYearClaimable } from '@/lib/races/catalogue'
import { eventsNamed, historicalKey, matchRow, parseDistanceKm, raceFromRow } from '@/lib/ultrasignup/match'
import type { ParsedResult } from '@/lib/ultrasignup/parse'
import { fetchOrFail, importTarget, jsonBody, matchCatalogue } from '@/lib/ultrasignup/server'
import type { RaceCategory, RaceEvent, RaceRecord } from '@/payload-types'

/**
 * Import one UltraSignup row whose distance the catalogue does not list.
 *
 * The client names the row — person id, title, date — and nothing else
 * (plus, for an admin importing for a member, whose and under what name:
 * `importTarget`).
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
 *
 * ADDING THE RACE ITSELF (`addRace`, admins only). A row whose event the
 * catalogue does not have at all is otherwise placed by hand, one member at
 * a time. An admin can instead take UltraSignup's own title as the event:
 * the event is named exactly as UltraSignup prints it, so the next member's
 * row with that title is a plain name match, and its distance becomes the
 * event's first category. UltraSignup is treated as the source — but the
 * row is still not trusted from the request: it is re-read here like every
 * other import. Refused when the title already names a catalogue event (an
 * ambiguous name is exactly what the matcher refused; a third event would
 * make it worse) and when the key it derives belongs to a different event.
 *
 * The category is NOT historical, unlike a new distance on a reviewed
 * event: there is no reviewed line-up for it to stand apart from, and
 * hiding it would leave the event with nothing a member could pick. Both
 * rows are `verified: false` with the UltraSignup title as their source, so
 * the staleness report lists them for somebody to check.
 */

/**
 * Where a historical entry sorts among the event's categories: after every
 * reviewed one. The catalogue numbers its own from 1 upward; this only has
 * to be larger than any of them.
 */
const HISTORICAL_ORDER = 999

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

async function ensureCategory(
  req: PayloadRequest,
  eventRowId: number,
  label: string,
  result: ParsedResult,
  historical: boolean,
): Promise<string> {
  const key = historicalKey(label)
  if (!key) throw new APIError('這個分項沒有可用的名稱。', 409)

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
          historical,
          // The matcher only calls a distance new when it parsed one, so
          // for that path this is never null; stored so nothing downstream
          // re-parses it. A new event's first entry may be "Relay": null.
          distanceKm: parseDistanceKm(label),
          key,
          label,
          order: historical ? HISTORICAL_ORDER : 1,
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
  if (!category) throw new APIError('無法新增這個分項。', 500)
  if (category.label !== label) {
    throw new APIError(`這場賽事的 ${key} 已經是另一個分項，沒有匯入。`, 409)
  }
  return category.key
}

/**
 * Find-or-create the event an UltraSignup title names, on its derived key.
 * The same race-safe shape as `ensureCategory`: `key` is a unique index.
 */
async function ensureEvent(
  req: PayloadRequest,
  { key, name }: { key: string; name: string },
  result: ParsedResult,
): Promise<{ key: string; rowId: number }> {
  const find = async () =>
    (
      await req.payload.find({
        collection: 'race-events',
        depth: 0,
        limit: 1,
        overrideAccess: true,
        pagination: false,
        req,
        where: { key: { equals: key } },
      })
    ).docs[0] as RaceEvent | undefined

  let event = await find()
  if (!event) {
    try {
      event = (await req.payload.create({
        collection: 'race-events',
        data: {
          key,
          name,
          series: 'others',
          source: `UltraSignup: ${result.rawName} (${result.date})`,
        },
        overrideAccess: true,
        req,
      })) as RaceEvent
    } catch (error) {
      event = await find()
      if (!event) {
        req.payload.logger.error(
          `ultrasignup: could not create event ${key}: ${causeChain(error)}`,
        )
        throw error
      }
    }
  }
  if (event.name !== name) {
    throw new APIError(`目錄裡的 ${key} 已經是另一場賽事（${event.name}），沒有新增。`, 409)
  }
  return { key: event.key, rowId: event.id }
}

export const ultrasignupImportEndpoint: Endpoint = {
  path: '/members/ultrasignup-import',
  method: 'post',
  handler: async (req) => {
    const body = await jsonBody(req)
    // Before anything else: a refusal must not depend on the member's saved
    // name or on UltraSignup answering.
    if (body.addRace === true) {
      if (!req.user) throw new APIError('請先登入。', 401)
      if (!isAdminUser(req.user)) throw new APIError('只有管理員可以新增賽事。', 403)
    }
    const { name, ownerId } = await importTarget(req, body)
    const personId = typeof body.personId === 'number' ? body.personId : NaN
    const rawName = typeof body.rawName === 'string' ? body.rawName : ''
    const date = typeof body.date === 'string' ? body.date : ''
    if (!Number.isInteger(personId) || !rawName || !date) {
      throw new APIError('缺少要匯入的成績。', 400)
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
        throw new APIError('UltraSignup 沒有完整回應，請稍後再試。', 503)
      }
      throw new APIError('你保存的姓名下找不到這筆成績。', 404)
    }
    if (result.status === 'other' || !isRaceYearClaimable(result.year, new Date())) {
      throw new APIError('這筆成績不能登錄為比賽紀錄。', 400)
    }

    const match = matchRow(catalogue.events, result.eventName, result.distanceText)
    let distanceId: string
    let eventId: string
    if (match.kind === 'ready') {
      distanceId = match.distanceId
      eventId = match.eventId
    } else if (match.kind === 'new-distance') {
      const eventRowId = catalogue.eventRowIds.get(match.eventId)
      if (eventRowId === undefined) throw new APIError('目錄裡找不到這場賽事。', 409)
      distanceId = await ensureCategory(req, eventRowId, match.distanceLabel, result, true)
      eventId = match.eventId
    } else if (match.kind === 'unsupported' && match.reason === 'event' && body.addRace === true) {
      if (eventsNamed(catalogue.events, result.eventName).length > 0) {
        throw new APIError('目錄裡已有同名的賽事，請用手工對應。', 409)
      }
      const race = raceFromRow(result.eventName, result.distanceText)
      if (!race) throw new APIError('這筆成績沒有可用的賽事或分項名稱。', 409)
      const event = await ensureEvent(req, race.event, result)
      distanceId = await ensureCategory(req, event.rowId, race.category.label, result, false)
      eventId = event.key
    } else {
      throw new APIError('這筆成績對不到目錄裡的單一分項。', 409)
    }

    const doc = (await req.payload.create({
      collection: 'race-records',
      data: {
        distanceId,
        eventId,
        // An admin importing for a member; otherwise `setOwner` stamps the caller.
        ...(ownerId !== null ? { owner: ownerId } : {}),
        finishSeconds: result.status === 'finished' ? result.finishSeconds : null,
        result: result.status,
        ultrasignupDate: result.date,
        ultrasignupTitle: result.rawName,
        year: result.year,
      },
      overrideAccess: false,
      req,
    })) as RaceRecord

    return Response.json({ doc }, { status: 201 })
  },
}
