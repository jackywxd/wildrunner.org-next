import type { Endpoint } from 'payload'
import { APIError } from 'payload'
import { sanitizeFilename } from 'payload/shared'

import { isAdminUser } from '@/access'
import { getR2Bucket } from '@/lib/r2-bucket'
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from '@/lib/media/upload-limits'
import { quotaBytesFor, usedBytesFor } from '@/lib/quota'

const MAX_ATTEMPTS = 50

/**
 * Reserve a filename before the browser starts uploading straight to R2.
 *
 * Two members uploading `video.mp4` would otherwise call
 * `createMultipartUpload` on the same key, and completing the second one
 * silently overwrites the first member's object. Payload's built-in path
 * dedupes filenames for exactly this reason (see M5-T3); the direct path
 * has to do it itself, and it has to happen *before* any bytes move —
 * rejecting a duplicate at document-create time is far too late.
 *
 * Members cannot check this for themselves: `read` access on media is
 * own-only, so a member querying for a taken filename would see nothing and
 * conclude it was free.
 *
 * The quota check here is advisory — it stops an upload that obviously
 * cannot fit rather than letting someone push 600 MB through and be refused
 * at the end. `enforceStorageQuota` remains the authoritative one, because
 * only it sees the size R2 actually recorded.
 */
export const directUploadInitEndpoint: Endpoint = {
  path: '/members/direct-upload-init',
  method: 'post',
  handler: async (req) => {
    if (!req.user) {
      throw new APIError('Unauthorized', 401)
    }

    const body = (await req.json?.()) as { filename?: unknown; filesize?: unknown } | undefined
    const requested = body?.filename
    if (typeof requested !== 'string' || !requested.trim()) {
      throw new APIError('A filename is required.', 400)
    }

    const declaredSize = typeof body?.filesize === 'number' ? body.filesize : 0

    /**
     * The per-file ceiling, before the quota and before any bytes move.
     *
     * Admins are NOT exempt, unlike the quota check below. A quota is about
     * how much of the bucket one account may fill, which is a policy an admin
     * can reasonably be trusted with; this is about what the transcoder can
     * finish inside its lease (see upload-limits.ts), and that is a property
     * of the file, not of who uploaded it.
     *
     * The client checks first and says it better — this is the half that is
     * not merely advisory, since the browser's check is the browser's to skip.
     */
    if (declaredSize > MAX_UPLOAD_BYTES) {
      throw new APIError(
        `File is too large: ${(declaredSize / (1024 * 1024)).toFixed(1)} MB, limit is ${MAX_UPLOAD_LABEL}.`,
        413,
      )
    }

    if (!isAdminUser(req.user) && declaredSize > 0) {
      const [used, quota] = await Promise.all([
        usedBytesFor(req.payload, req.user.id, req),
        Promise.resolve(quotaBytesFor(req.user)),
      ])
      if (used + declaredSize > quota) {
        const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1)
        throw new APIError(
          `Storage quota exceeded: ${mb(used)} MB used of ${mb(quota)} MB. This file is ${mb(declaredSize)} MB.`,
          413,
        )
      }
    }

    const safe = sanitizeFilename(requested)
    const dot = safe.lastIndexOf('.')
    const base = dot > 0 ? safe.slice(0, dot) : safe
    const ext = dot > 0 ? safe.slice(dot) : ''

    const bucket = await getR2Bucket()

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const candidate = attempt === 0 ? safe : `${base}-${attempt}${ext}`

      // Both have to be free: an object with no document is an abandoned
      // upload we must not overwrite, and a document with no object would
      // make verifyDirectUpload reject the create later.
      const [object, existing] = await Promise.all([
        bucket.head(candidate),
        req.payload.find({
          collection: 'media',
          where: { filename: { equals: candidate } },
          limit: 1,
          depth: 0,
          pagination: false,
          overrideAccess: true,
          req,
        }),
      ])

      if (!object && existing.docs.length === 0) {
        return Response.json({ filename: candidate })
      }
    }

    throw new APIError('Could not find an available filename.', 409)
  },
}
