import type { CollectionAfterChangeHook } from 'payload'

import { getImagesBinding } from '../../lib/images-binding'
import { getR2Bucket } from '../../lib/r2-bucket'
import { publicMediaUrl } from '../../lib/media-url'

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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * A few retries around the read-back. R2 is documented as strongly
 * consistent, so in a deployed Worker the first attempt should always
 * succeed — this is a safety margin, not a load-bearing workaround for a
 * known gap (see the header comment below for the gap that retries do
 * *not* paper over).
 */
async function getObjectWithRetry(key: string, attempts = 3): Promise<R2ObjectBody | null> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const bucket = await getR2Bucket()
    const object = await bucket.get(key)
    if (object) return object
    if (attempt < attempts) await sleep(150 * attempt)
  }
  return null
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
 * NOT VERIFIED END-TO-END IN LOCAL DEV. `bucket.get()` called from this
 * hook, moments after generateFileData's own `put()` earlier in the same
 * request, consistently returned null locally — while every check from a
 * genuinely separate request (a fresh curl, a different collection's hook,
 * a self-fetch of the object's own URL) saw the write immediately, with no
 * delay needed. Retries, re-resolving the binding fresh, and bypassing
 * Next's fetch cache with `no-store` all made no difference — the one
 * variable that did was whether the read came from inside the same
 * in-flight request or a new one. That points at something specific to how
 * `next dev` (Turbopack, single Node process, no `wrangler dev`) handles a
 * request nested inside another request's own execution — not at R2 itself,
 * and not something a deployed Worker can even exhibit, since there a
 * request never nests inside itself this way. Confirm on staging before
 * trusting this in production.
 *
 * afterChange, create only. Best-effort like streamIngestOnUpload: caught
 * and logged, never thrown — a failure here must not fail the upload.
 */
export const processImageOnUpload: CollectionAfterChangeHook = async ({
  doc,
  req,
  operation,
}) => {
  if (operation !== 'create') return doc

  const mimeType = doc.mimeType as string | undefined
  const filename = doc.filename as string | undefined
  const filesize = doc.filesize as number | undefined
  if (!mimeType?.startsWith('image/') || mimeType === 'image/svg+xml') return doc
  if (!filename) return doc
  if (typeof filesize === 'number' && filesize > MAX_INPUT_BYTES) return doc

  try {
    const [object, images] = await Promise.all([
      getObjectWithRetry(filename),
      getImagesBinding(),
    ])
    if (!object) return doc
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
      const newFilename = heicReplacementFilename(filename, doc.id as number | string)

      const bucket = await getR2Bucket()
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

    if (Object.keys(updates).length === 0) return doc

    return await req.payload.update({
      collection: 'media',
      id: doc.id,
      data: updates,
      depth: 0,
      req,
    })
  } catch (error) {
    console.warn('Image processing error', error)
    return doc
  }
}
