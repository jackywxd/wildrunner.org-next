import type { Endpoint } from 'payload'

import { assemblePeople } from '@/lib/ultrasignup/assemble'
import { fetchOrFail, importTarget, jsonBody, matchCatalogue } from '@/lib/ultrasignup/server'

/**
 * The member's UltraSignup finishes, split into the people that name maps to.
 *
 * A member sends nothing but the request. The name is the one stored on
 * the account, and the URLs are built here — a member-supplied URL would be
 * an open fetch. `fetchPeople` asks `historybyname` once per surname
 * boundary; see `name.ts` for why "Xu Dong Wu" is two people.
 *
 * Which rows the member has already logged is not answered here. The page
 * reads that from its live list of records (`row-state.ts`), which an
 * import, an edit or a delete below changes without reloading UltraSignup;
 * a snapshot sent now would be stale by the first click.
 *
 * An admin importing for a member sends `{ ownerId, name }` instead; see
 * `importTarget`. Nothing about the owner changes what is fetched — the
 * owner only matters when a row is written.
 */
export const ultrasignupResultsEndpoint: Endpoint = {
  path: '/members/ultrasignup-results',
  method: 'post',
  handler: async (req) => {
    const { name } = await importTarget(req, await jsonBody(req))
    const [catalogue, { failures, people }] = await Promise.all([
      matchCatalogue(req),
      fetchOrFail(req, name),
    ])
    return Response.json({
      failedSplits: failures.map((failure) => failure.split),
      people: assemblePeople(people, catalogue.events, new Date()),
    })
  },
}
