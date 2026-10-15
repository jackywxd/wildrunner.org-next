import type { Endpoint, PayloadRequest } from 'payload'
import { APIError } from 'payload'

import { isAdminUser } from '@/access'
import { aliasProposals, withAlias, type AliasEvidence } from '@/lib/ultrasignup/aliases'
import { eventsNamed } from '@/lib/ultrasignup/match'
import { normalizeRaceName } from '@/lib/ultrasignup/normalize'
import { jsonBody, matchCatalogue } from '@/lib/ultrasignup/server'
import type { RaceCatalogueRequest, RaceEvent, RaceRecord } from '@/payload-types'

/**
 * Aligning the catalogue's UltraSignup names, for admins.
 *
 * GET lists what members' own choices suggest (`aliases.ts` says what
 * counts as evidence and why nothing is written without an admin). POST
 * adds one name to one event's `ultrasignupAliases` — the field an admin
 * would otherwise edit by hand in /admin, with the checks that editing by
 * hand does not have: the name must not already belong to another event,
 * because a name two events answer to matches neither.
 */

function requireAdmin(req: PayloadRequest): void {
  if (!req.user) throw new APIError('請先登入。', 401)
  if (!isAdminUser(req.user)) throw new APIError('只有管理員可以對齊目錄名稱。', 403)
}

const MAX_ALIAS_LENGTH = 200

export const ultrasignupAliasProposalsEndpoint: Endpoint = {
  path: '/members/ultrasignup-aliases',
  method: 'get',
  handler: async (req) => {
    requireAdmin(req)
    const [catalogue, records, requests] = await Promise.all([
      matchCatalogue(req),
      req.payload.find({
        collection: 'race-records',
        depth: 0,
        limit: 0,
        pagination: false,
        req,
        select: { eventId: true, ultrasignupTitle: true },
        where: { ultrasignupTitle: { exists: true } },
      }),
      req.payload.find({
        collection: 'race-catalogue-requests',
        depth: 0,
        limit: 0,
        overrideAccess: false,
        pagination: false,
        req,
        select: { event: true, eventName: true },
        where: { and: [{ status: { equals: 'approved' } }, { event: { exists: true } }] },
      }),
    ])
    const keysByRowId = new Map([...catalogue.eventRowIds].map(([key, id]) => [id, key]))
    const evidence: AliasEvidence[] = []
    for (const record of records.docs as Pick<RaceRecord, 'eventId' | 'ultrasignupTitle'>[]) {
      if (!record.ultrasignupTitle) continue
      evidence.push({
        eventKey: record.eventId,
        kind: 'record',
        ultrasignupTitle: record.ultrasignupTitle,
      })
    }
    for (const request of requests.docs as Pick<RaceCatalogueRequest, 'event' | 'eventName'>[]) {
      const rowId = typeof request.event === 'object' ? request.event?.id : request.event
      const eventKey = rowId === null || rowId === undefined ? undefined : keysByRowId.get(rowId)
      if (!eventKey) continue
      evidence.push({ eventKey, eventName: request.eventName, kind: 'request' })
    }
    return Response.json({ proposals: aliasProposals(catalogue.events, evidence) })
  },
}

export const ultrasignupAliasAddEndpoint: Endpoint = {
  path: '/members/ultrasignup-aliases',
  method: 'post',
  handler: async (req) => {
    requireAdmin(req)
    const body = await jsonBody(req)
    const eventKey = typeof body.eventKey === 'string' ? body.eventKey : ''
    const alias = typeof body.alias === 'string' ? body.alias.trim() : ''
    if (!eventKey || !normalizeRaceName(alias) || alias.length > MAX_ALIAS_LENGTH) {
      throw new APIError('缺少要加入的名稱或賽事。', 400)
    }

    const catalogue = await matchCatalogue(req)
    const rowId = catalogue.eventRowIds.get(eventKey)
    if (rowId === undefined) throw new APIError('目錄裡找不到這場賽事。', 404)
    const owners = eventsNamed(catalogue.events, alias)
    if (owners.some((key) => key !== eventKey)) {
      throw new APIError('這個名稱已經對到另一場賽事，加上去會讓兩場都對不上。', 409)
    }

    const event = (await req.payload.findByID({
      collection: 'race-events',
      depth: 0,
      id: rowId,
      req,
      select: { ultrasignupAliases: true },
    })) as Pick<RaceEvent, 'ultrasignupAliases'>
    const next = owners.length > 0 ? null : withAlias(event.ultrasignupAliases, alias)
    if (next === null) return Response.json({ added: false })

    await req.payload.update({
      collection: 'race-events',
      data: { ultrasignupAliases: next },
      id: rowId,
      overrideAccess: false,
      req,
    })
    return Response.json({ added: true })
  },
}
