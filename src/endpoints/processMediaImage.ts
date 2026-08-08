import type { Endpoint } from 'payload'
import { APIError } from 'payload'

import { isAdminUser } from '@/access'
import { getImagesBinding } from '@/lib/images-binding'
import { getR2Bucket } from '@/lib/r2-bucket'
import { publicMediaUrl } from '@/lib/media-url'

const HEIC_TYPES = new Set(['image/heic', 'image/heif'])
const BLUR_WIDTH = 20
const BLUR_QUALITY = 50
const CONVERTED_QUALITY = 82
// developers.cloudflare.com/images/optimization/binding — the binding's own
// input cap. Every image on this site today is under 5 MB; this only guards
// against something unexpectedly large falling through the mimeType check.
const MAX_INPUT_BYTES = 20 * 1024 * 1024

function streamOf(bytes: ArrayBuffer): ReadableStream<Uint8Array> {
  return new Response(bytes).body as ReadableStream<Uint8Array>
}

/** `photo.heic` -> `photo-42.webp`. The id suffix guarantees no collision. */
function heicReplacementFilename(filename: string, docId: number | string): string {
  const dot = filename.lastIndexOf('.')
  const stem = dot > 0 ? filename.slice(0, dot) : filename
  return `${stem}-${docId}.webp`
}

/**
 * Fills in what Workers has no sharp to compute at request time: a blurred
 * placeholder, real pixel dimensions, and — for HEIC, which every browser
 * except Safari fails to render — a WebP replacement.
 *
 * A dedicated endpoint the client calls right after creating the document,
 * not a `media` afterChange hook. The hook version reliably failed, in both
 * local dev and production: a `bucket.get()` for the object
 * generateFileData had just put moments earlier, in the *same* request,
 * consistently came back null — while a read from any genuinely separate
 * request (a fresh curl, `wrangler r2 object get`, this endpoint) sees the
 * same object immediately, no delay needed. The exact mechanism was never
 * pinned down; this sidesteps it structurally by never reading the object
 * back within the request that wrote it.
 *
 * Best-effort: every failure mode here returns `{ processed: false }`
 * rather than throwing, because the upload itself already succeeded by the
 * time this runs and must not be reported as failed on its account.
 */
export const processMediaImageEndpoint: Endpoint = {
  // NOT /media/:id/... — Payload's router treats any path whose first
  // segment matches a real collection slug as scoped to that collection's
  // own `endpoints` array (handleEndpoints.js), bypassing this global
  // registration entirely and answering 404. Every other custom endpoint in
  // this codebase already avoids this for the same reason (see
  // directUploadInit.ts, storageUsage.ts, inviteMember.ts — all /members/...).
  path: '/members/media/:id/process-image',
  method: 'post',
  handler: async (req) => {
    if (!req.user) {
      throw new APIError('Unauthorized', 401)
    }

    const id = req.routeParams?.id
    if (typeof id !== 'string' && typeof id !== 'number') {
      throw new APIError('An id is required.', 400)
    }

    const doc = await req.payload.findByID({
      collection: 'media',
      id,
      depth: 0,
      overrideAccess: true,
      req,
    })

    const ownerId = typeof doc.owner === 'object' ? doc.owner?.id : doc.owner
    if (!isAdminUser(req.user) && ownerId !== req.user.id) {
      throw new APIError('Forbidden', 403)
    }

    const mimeType = doc.mimeType ?? undefined
    const filename = doc.filename ?? undefined
    const filesize = doc.filesize ?? undefined
    if (!mimeType?.startsWith('image/') || mimeType === 'image/svg+xml') {
      return Response.json({ processed: false })
    }
    if (!filename) return Response.json({ processed: false })
    if (typeof filesize === 'number' && filesize > MAX_INPUT_BYTES) {
      return Response.json({ processed: false })
    }

    try {
      const [bucket, images] = await Promise.all([getR2Bucket(), getImagesBinding()])
      const object = await bucket.get(filename)
      if (!object) return Response.json({ processed: false })
      const bytes = await object.arrayBuffer()

      const info = await images.info(streamOf(bytes))
      const updates: Record<string, unknown> = {}
      if ('width' in info) {
        updates.width = info.width
        updates.height = info.height
      }

      const blurred = await images
        .input(streamOf(bytes))
        .transform({ width: BLUR_WIDTH })
        .output({ format: 'image/webp', quality: BLUR_QUALITY })
      const blurBytes = await new Response(blurred.image()).arrayBuffer()
      updates.blurDataURL = `data:image/webp;base64,${Buffer.from(blurBytes).toString('base64')}`

      if (HEIC_TYPES.has(mimeType)) {
        const converted = await images
          .input(streamOf(bytes))
          .output({ format: 'image/webp', quality: CONVERTED_QUALITY })
        const convertedBytes = await new Response(converted.image()).arrayBuffer()
        const newFilename = heicReplacementFilename(filename, doc.id)

        await bucket.put(newFilename, convertedBytes, {
          httpMetadata: { contentType: 'image/webp' },
        })
        await bucket.delete(filename)

        updates.filename = newFilename
        updates.mimeType = 'image/webp'
        updates.filesize = convertedBytes.byteLength
        // Same production-only rule as setMediaUrl (media-url.ts): outside a
        // deployed Worker there is nothing at R2_PUBLIC_URL to point at.
        if (process.env.NODE_ENV === 'production') {
          updates.url = publicMediaUrl(newFilename)
        }
      }

      if (Object.keys(updates).length === 0) return Response.json({ processed: false })

      await req.payload.update({
        collection: 'media',
        id: doc.id,
        data: updates,
        depth: 0,
        overrideAccess: true,
        req,
      })

      return Response.json({ processed: true })
    } catch (error) {
      console.warn('Image processing error', error)
      return Response.json({ processed: false })
    }
  },
}
