import type { Endpoint, PayloadRequest } from 'payload'
import { APIError } from 'payload'

import { aliasList, type MatchDistance, type MatchEvent } from '@/lib/ultrasignup/match'
import { assemblePeople, type ExistingRecord } from '@/lib/ultrasignup/assemble'
import { fetchPeople } from '@/lib/ultrasignup/fetch'
import { nameSplits } from '@/lib/ultrasignup/name'
import type { RaceCategory, RaceEvent, RaceRecord, User } from '@/payload-types'

/**
 * The member's UltraSignup finishes, split into the people that name maps to.
 *
 * The client sends nothing but the request. The name is the one stored on
 * the account, and the URLs are built here — a member-supplied URL would be
 * an open fetch. `fetchPeople` asks `historybyname` once per surname
 * boundary; see `name.ts` for why "Xu Dong Wu" is two people.
 *
 * The helpers below are shared with `ultrasignupImport.ts`, which has to
 * reach the same answer for one row that this reached for the whole list.
 */
export async function storedName(req: PayloadRequest): Promise<string> {
  if (!req.user) throw new APIError('Unauthorized', 401)
  const account = (await req.payload.findByID({
    collection: 'users',
    id: req.user.id,
    depth: 0,
    overrideAccess: false,
    user: req.user,
  })) as User
  const name = account.ultrasignupName?.trim() ?? ''
  if (!nameSplits(name)) {
    throw new APIError('Enter the name as it appears on UltraSignup, family name last.', 400)
  }
  return name
}

/**
 * Every catalogue event in the shape the matcher wants, plus the numeric
 * row id each event key maps to. Historical categories are included: once
 * one member's import has created QMT's 110K, the next member's 110K is a
 * plain match against it, not a second entry.
 */
export async function matchCatalogue(
  req: PayloadRequest,
): Promise<{ eventRowIds: Map<string, number>; events: MatchEvent[] }> {
  const [eventsResult, categoriesResult] = await Promise.all([
    req.payload.find({
      collection: 'race-events',
      depth: 0,
      limit: 0,
      pagination: false,
      select: { id: true, key: true, name: true, ultrasignupAliases: true },
    }),
    req.payload.find({
      collection: 'race-categories',
      depth: 0,
      limit: 0,
      pagination: false,
      select: { distanceKm: true, event: true, key: true, label: true },
    }),
  ])
  const events = eventsResult.docs as Pick<RaceEvent, 'id' | 'key' | 'name' | 'ultrasignupAliases'>[]
  const categories = categoriesResult.docs as Pick<
    RaceCategory,
    'distanceKm' | 'event' | 'key' | 'label'
  >[]
  const distancesByEvent = new Map<number, MatchDistance[]>()
  for (const category of categories) {
    const eventId = typeof category.event === 'number' ? category.event : category.event.id
    const list = distancesByEvent.get(eventId) ?? []
    list.push({ distanceKm: category.distanceKm, id: category.key, label: category.label })
    distancesByEvent.set(eventId, list)
  }
  return {
    eventRowIds: new Map(events.map((event) => [event.key, event.id])),
    events: events.map((event) => ({
      aliases: aliasList(event.ultrasignupAliases),
      distances: distancesByEvent.get(event.id) ?? [],
      id: event.key,
      name: event.name,
    })),
  }
}

export async function fetchOrFail(
  req: PayloadRequest,
  name: string,
): Promise<Awaited<ReturnType<typeof fetchPeople>>> {
  try {
    const fetched = await fetchPeople(name)
    if (fetched.failures.length > 0) {
      req.payload.logger.warn(
        `ultrasignup: partial — ${fetched.failures.map((failure) => failure.reason).join(', ')}`,
      )
    }
    return fetched
  } catch (error) {
    req.payload.logger.error(
      `ultrasignup: ${error instanceof Error ? error.message : String(error)}`,
    )
    throw new APIError('無法讀取 UltraSignup，請稍後再試。', 502)
  }
}

export const ultrasignupResultsEndpoint: Endpoint = {
  path: '/members/ultrasignup-results',
  method: 'post',
  handler: async (req) => {
    const name = await storedName(req)
    const user = req.user!

    const [catalogue, recordsResult] = await Promise.all([
      matchCatalogue(req),
      req.payload.find({
        collection: 'race-records',
        depth: 0,
        limit: 500,
        overrideAccess: false,
        pagination: false,
        user,
        where: { owner: { equals: user.id } },
      }),
    ])
    const { failures, people } = await fetchOrFail(req, name)

    const records = (recordsResult.docs as RaceRecord[]).map(
      (record): ExistingRecord => ({
        distanceId: record.distanceId,
        eventId: record.eventId,
        finishSeconds: record.finishSeconds ?? null,
        id: record.id,
        result: record.result === 'dnf' ? 'dnf' : 'finished',
        year: record.year,
      }),
    )

    return Response.json({
      failedSplits: failures.map((failure) => failure.split),
      people: assemblePeople(people, catalogue.events, records, new Date()),
    })
  },
}
