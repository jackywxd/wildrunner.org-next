import type { Endpoint } from 'payload'
import { APIError } from 'payload'

import { quotaBytesFor, usedBytesFor } from '@/lib/quota'

/** Own usage only — this is a self-service widget, not an admin report. */
export const storageUsageEndpoint: Endpoint = {
  path: '/members/storage-usage',
  method: 'get',
  handler: async (req) => {
    if (!req.user) {
      throw new APIError('Unauthorized', 401)
    }

    const [usedBytes, quotaBytes] = await Promise.all([
      usedBytesFor(req.payload, req.user.id, req),
      Promise.resolve(quotaBytesFor(req.user)),
    ])

    return Response.json({ usedBytes, quotaBytes })
  },
}
