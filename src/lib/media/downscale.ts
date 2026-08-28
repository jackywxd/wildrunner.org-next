/**
 * Shrink an oversized photo in the browser, before any bytes are uploaded.
 *
 * R2 stores whatever the member picked, at full size, forever: `Media.ts`
 * configures no `imageSizes`, so Payload generates no variants, and every
 * resize the public site does happens at the edge from that one original
 * (`src/lib/image-loader.ts`). That design is right — one original serves
 * every breakpoint — but it means a phone's 12 MB straight-out-of-camera
 * JPEG is 12 MB of the member's quota forever, to serve a page that will
 * never ask the edge for more than a couple of thousand pixels.
 *
 * So the long edge is capped here. Not on the server: the bytes have
 * already crossed the network by then and the saving is the network cost as
 * much as the storage. Not in the Worker's IMAGES binding either — that
 * binding drops a measurable fraction of any burst, which is the whole
 * reason `image-loader.ts` stopped routing through it.
 *
 * EVERY FAILURE RETURNS THE ORIGINAL FILE. A member whose browser cannot
 * decode their photo must still be able to upload it; losing the saving is
 * a far smaller failure than refusing the upload, and matches how
 * `findDuplicateUpload` and `processImage` already degrade.
 */

/**
 * The long edge a stored image is capped at.
 *
 * 3000 sits above `deviceSizes`' largest *realistic* request and below its
 * ceiling: next.config.ts lists 3840, so a 4K viewport asking for a
 * full-bleed image gets the 3000px original rather than an upscale — the
 * edge does not enlarge. Images on this site render inside a content
 * column, never full-bleed at 4K, so that case is theoretical; the storage
 * saved on every photo is not.
 */
export const MAX_EDGE = 3000

/**
 * Formats safe to decode and re-encode here.
 *
 * Deliberately a short allow-list rather than `image/*`:
 *
 *   HEIC  — no browser but Safari decodes it, so `createImageBitmap` would
 *           throw for most members. It is also the one format that already
 *           has a server-side conversion (processMediaImage.ts turns it
 *           into WebP), and that conversion works from the original.
 *   GIF   — a canvas draws one frame. Resizing an animation would silently
 *           destroy it.
 *   SVG   — vector. It has no long edge to cap and rasterising would make
 *           it strictly worse.
 */
const RESIZABLE = new Set(['image/jpeg', 'image/png', 'image/webp'])

/**
 * Quality for the re-encode. Ignored by `toBlob` for PNG, which is lossless.
 *
 * 0.9 rather than the 0.82 `processMediaImage` uses for its HEIC
 * conversion: that one is a format change on an image nobody has seen yet,
 * while this is the only copy that will ever exist of the member's photo.
 */
const QUALITY = 0.9

/**
 * The size to draw at, or null when the image is already within the cap.
 *
 * Pure, and exported for its own tests — it is the only part of this module
 * that can be checked without a browser, and the only part with arithmetic
 * to get wrong.
 *
 * Null rather than "the same dimensions" matters: an image that needs no
 * resizing must be returned untouched, never re-encoded. Re-encoding a
 * file that is already small enough spends quality and gains nothing.
 */
export function targetSize(
  width: number,
  height: number,
  maxEdge: number = MAX_EDGE,
): { height: number; width: number } | null {
  const longest = Math.max(width, height)
  if (!Number.isFinite(longest) || longest <= maxEdge) return null

  const scale = maxEdge / longest
  return {
    // At least one pixel: a panorama 8000 wide and 2 tall would otherwise
    // round its height to 0 and produce a canvas the browser refuses.
    height: Math.max(1, Math.round(height * scale)),
    width: Math.max(1, Math.round(width * scale)),
  }
}

/** `toBlob` is callback-based; everything else in the upload path is a promise. */
function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY))
}

/**
 * Return `file` shrunk to `MAX_EDGE` on its long edge, or `file` itself.
 *
 * Callers can use the result unconditionally — it is always a `File` of the
 * same name and type, and never larger than what they passed in.
 */
export async function downscaleImage(file: File): Promise<File> {
  if (!RESIZABLE.has(file.type)) return file

  let bitmap: ImageBitmap
  try {
    // `from-image` applies the EXIF rotation while decoding, so the canvas
    // draws the photo the right way up. Without it a portrait phone photo
    // would be re-encoded sideways: the canvas output carries no EXIF, so
    // the orientation tag that used to correct it is gone.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return file
  }

  try {
    const target = targetSize(bitmap.width, bitmap.height)
    if (!target) return file

    const canvas = document.createElement('canvas')
    canvas.width = target.width
    canvas.height = target.height
    const context = canvas.getContext('2d')
    if (!context) return file

    // The *destination* is at most 3000×3000, ~9 megapixels, which stays
    // under the canvas area ceilings mobile Safari enforces. The source can
    // be far larger; `createImageBitmap` carries that, not the canvas.
    context.drawImage(bitmap, 0, 0, target.width, target.height)

    const blob = await toBlob(canvas, file.type)
    // A re-encode is not guaranteed to be smaller — a PNG of flat colour
    // can grow. Returning the original then keeps the promise this function
    // makes to its callers, and costs nothing.
    if (!blob || blob.size >= file.size) return file

    return new File([blob], file.name, { lastModified: file.lastModified, type: file.type })
  } catch {
    return file
  } finally {
    bitmap.close()
  }
}
