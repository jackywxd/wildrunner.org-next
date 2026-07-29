import type { CollectionBeforeOperationHook } from 'payload'
import { APIError } from 'payload'
import { sanitizeFilename } from 'payload/shared'

import { getR2Bucket } from '../../lib/r2-bucket'

const ALLOWED_MIME = /^(image|video)\//

/**
 * Validate a document created for a file that was uploaded straight to R2.
 *
 * Files above DIRECT_UPLOAD_THRESHOLD never pass through the Worker: the
 * browser uploads them to R2 in parts and then creates the document from
 * metadata alone. `upload.filesRequiredOnCreate: false` lets that create
 * through, which means Payload's own `checkFileRestrictions` never runs —
 * it is reached only when `req.file` is present.
 *
 * So this hook *is* the validation for that path, not a convenience. Without
 * it any authenticated member could create documents pointing at objects that
 * do not exist, at somebody else's file, or at an arbitrary size of their own
 * choosing (quota is a sum of `media.filesize`).
 *
 * Runs in `beforeOperation` so a rejection happens before anything is
 * persisted, and because `buildBeforeOperation`'s return value replaces
 * `args` before `data` is destructured — mutations here reach the document.
 */
export const verifyDirectUpload: CollectionBeforeOperationHook = async ({
  args,
  operation,
  req,
}) => {
  if (operation !== 'create') return args
  // A request carrying an actual file goes down Payload's built-in path,
  // which validates it the usual way.
  if (req.file) return args

  const data = args.data as Record<string, unknown> | undefined
  if (!data) return args

  const filename = data.filename
  if (typeof filename !== 'string' || !filename) {
    throw new APIError('A filename is required.', 400)
  }
  if (filename.includes('/') || filename.includes('..') || filename.includes('\\')) {
    throw new APIError('Invalid filename.', 400)
  }

  // `filename` + `url` together send generateFileData down shouldReupload ->
  // getExternalFile, which makes the Worker fetch a caller-supplied URL.
  // `setMediaUrl` derives the real URL later; nobody needs to pass one.
  if (data.url) {
    throw new APIError('url cannot be set on create.', 400)
  }

  const key = sanitizeFilename(filename)
  const bucket = await getR2Bucket()
  const object = await bucket.head(key)
  if (!object) {
    throw new APIError(`No uploaded file found for ${filename}.`, 400)
  }

  // One object, one document. Without this a member could point a new
  // document at a file that already belongs to somebody else.
  const existing = await req.payload.find({
    collection: 'media',
    where: { filename: { equals: filename } },
    limit: 1,
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
  })
  if (existing.docs.length > 0) {
    throw new APIError(`A media document already exists for ${filename}.`, 400)
  }

  // R2 records the browser-declared type at createMultipartUpload; prefer it
  // over anything in the request body, and enforce the same allow-list the
  // collection's `mimeTypes` applies on the built-in path.
  const mimeType = object.httpMetadata?.contentType || data.mimeType
  if (typeof mimeType !== 'string' || !ALLOWED_MIME.test(mimeType)) {
    throw new APIError(`File type ${String(mimeType) || 'unknown'} is not allowed.`, 400)
  }

  data.mimeType = mimeType
  // Never the client's number: quota is computed from this column.
  data.filesize = object.size

  if (typeof data.alt !== 'string' || !data.alt.trim()) {
    const dot = filename.lastIndexOf('.')
    data.alt = dot > 0 ? filename.slice(0, dot) : filename
  }

  return args
}
