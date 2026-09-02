import type { Endpoint } from 'payload'
import { APIError } from 'payload'

import { resolveRaceRecordRefs } from '@/collections/hooks/populate-race-record-refs'
import { isRaceYearClaimable } from '@/lib/races/catalogue'

/**
 * "Which `race-editions` row is (this event, this year)?" — creating it when
 * nobody has claimed that pair before.
 *
 * WHY THE MEDIA LIBRARY NEEDS THIS AT ALL. `media.raceEdition` is a real
 * foreign key, so the picker has to end up with a row id. Its picker used to
 * *be* that list — `getRaceEditionOptions`, which is `startDate exists AND
 * startDate <= today` — and on 2026-09-02 that was 14 rows, every one of them
 * this year. A member tagging a photo of the 2019 UTMB had nothing to pick,
 * exactly as the post editor had nothing to pick before it started asking the
 * catalogue instead (RaceClaimFields.tsx's header records that incident).
 * Asking the catalogue means the answer is (event key, year), and this turns
 * that pair into the id the column needs.
 *
 * THE WORK IS NOT DONE HERE. `resolveRaceRecordRefs` is the same helper
 * `race-records` already writes editions through, and its header carries the
 * two rules that matter: only `event` and `year` are ever written from member
 * input, and a lost race against another member's identical claim is
 * re-queried rather than thrown. Reusing it is the point — a second
 * find-or-create would be a second place for those rules to be got wrong.
 *
 * WHAT THIS FILE ADDS is an honest refusal, not the only one. Measured against
 * a running server with `isRaceYearClaimable` removed: `{ year: 9999 }` still
 * creates nothing — `race-editions.year` validates the same 2010..next-year
 * bound itself (RaceEditions.ts) and `payload.create` throws. But that throw
 * is indistinguishable, from here, from the duplicate it is written to
 * tolerate: the helper swallows it, re-queries, finds nothing and returns
 * `{}`, so this endpoint answers 404 "no race in the catalogue has that key" —
 * which is false, and sends whoever reads it looking at the event key. The
 * check turns that into a 400 naming the field that is actually wrong.
 *
 * The event key needs no such check: the helper looks it up in `race-events`
 * and returns nothing when it does not resolve, so an unknown key creates
 * nothing and the 404 below is then the true answer.
 *
 * NOT /race-editions/... — Payload's router scopes any path whose first
 * segment matches a collection slug to that collection's own `endpoints` and
 * answers 404 for a global registration. Same reason every other custom
 * endpoint here lives under /members/, as posterFrame.ts notes.
 */
export const resolveRaceEditionEndpoint: Endpoint = {
  path: '/members/race-editions/resolve',
  method: 'post',
  handler: async (req) => {
    if (!req.user) {
      throw new APIError('Unauthorized', 401)
    }

    const body = (await req.json?.()) as
      | { eventId?: unknown; year?: unknown }
      | undefined

    const eventId = typeof body?.eventId === 'string' ? body.eventId.trim() : ''
    if (!eventId) {
      throw new APIError('eventId is required.', 400)
    }

    const year = typeof body?.year === 'number' ? body.year : Number(body?.year)
    if (!isRaceYearClaimable(year, new Date())) {
      throw new APIError('That year is outside the range a member can claim.', 400)
    }

    const { editionId } = await resolveRaceRecordRefs(req.payload, { eventId, year }, req)

    // 404 rather than 400: the request was well formed, and the reason there
    // is no id is that no `race-events` row carries this key. A member cannot
    // reach this from the picker — it lists the catalogue — so this is either
    // a stale client or somebody typing into the API.
    if (editionId === undefined) {
      throw new APIError('No race in the catalogue has that key.', 404)
    }

    return Response.json({ id: editionId })
  },
}
