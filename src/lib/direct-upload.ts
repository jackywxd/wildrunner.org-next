/**
 * Browser-side driver for uploading a file straight to R2.
 *
 * Files above DIRECT_UPLOAD_THRESHOLD never pass through the Worker. The
 * bytes go to R2 in parts and the media document is then created from
 * metadata alone, which is what keeps a 600 MB video from being read back
 * into a Worker that has 128 MB to work with.
 *
 * Everything here is deliberately free of React and of Payload's admin
 * internals so it can be driven from a component, a test, or a script.
 */

/**
 * Below this, uploads keep Payload's built-in path, which reads the file
 * server-side and so can fill in image dimensions and blurDataURL.
 *
 * 32 rather than 50 (@payloadcms/storage-r2's own cutoff) leaves margin
 * under that and under the Worker's memory ceiling, and keeps every
 * realistic image on the built-in path.
 */
export const DIRECT_UPLOAD_THRESHOLD = 32 * 1024 * 1024

/** R2 requires every part but the last to be the same size. */
export const CHUNK_SIZE = 5 * 1024 * 1024

const MULTIPART_PATH = '/api/storage-r2-multi-part-upload'

export type UploadedPart = { partNumber: number; etag: string }

export type UploadSession = {
  key: string
  uploadId: string
  filename: string
  mimeType: string
  size: number
  /** Persisted because a resumed upload must keep using the same value. */
  chunkSize: number
  parts: UploadedPart[]
}

export type UploadProgress = {
  uploadedBytes: number
  totalBytes: number
  partsDone: number
  partTotal: number
}

const json = { 'Content-Type': 'application/json' }

async function failure(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { errors?: { message?: string }[] }
    return body.errors?.[0]?.message || fallback
  } catch {
    return fallback
  }
}

/**
 * Ask the server for a filename nobody else is using.
 *
 * Not something the browser can work out: `read` on media is own-only, so a
 * member checking for a taken name sees nothing and concludes it is free —
 * and completing a multipart upload on a key that already exists silently
 * overwrites whatever was there.
 */
export async function reserveFilename(file: File): Promise<string> {
  const response = await fetch('/api/members/direct-upload-init', {
    method: 'POST',
    credentials: 'same-origin',
    headers: json,
    body: JSON.stringify({ filename: file.name, filesize: file.size }),
  })
  if (!response.ok) {
    throw new Error(await failure(response, 'Could not start the upload.'))
  }
  return ((await response.json()) as { filename: string }).filename
}

function endpoint(session: Pick<UploadSession, 'filename' | 'mimeType'>, extra: Record<string, string> = {}) {
  const params = new URLSearchParams({
    collection: 'media',
    fileName: session.filename,
    fileType: session.mimeType,
    ...extra,
  })
  return `${MULTIPART_PATH}?${params}`
}

export async function startSession(file: File, filename: string): Promise<UploadSession> {
  const mimeType = file.type || 'application/octet-stream'
  const response = await fetch(endpoint({ filename, mimeType }), {
    method: 'POST',
    credentials: 'same-origin',
  })
  if (!response.ok) {
    throw new Error(await failure(response, 'Could not open the upload.'))
  }
  const { key, uploadId } = (await response.json()) as { key: string; uploadId: string }
  return {
    key,
    uploadId,
    filename,
    mimeType,
    size: file.size,
    chunkSize: CHUNK_SIZE,
    parts: [],
  }
}

export function partCount(session: UploadSession) {
  return Math.ceil(session.size / session.chunkSize)
}

/**
 * Send every part not already recorded on the session.
 *
 * Skipping parts already present is what makes resuming work: the caller
 * hands back a session restored from storage and only the gaps are sent.
 * The server holds no state of its own — `resumeMultipartUpload(key,
 * uploadId)` needs nothing else — but it also cannot tell us what already
 * landed, since R2MultipartUpload has no `listParts`. The session is the
 * only record.
 */
export async function uploadParts(
  session: UploadSession,
  file: File,
  options: {
    onProgress?: (progress: UploadProgress) => void
    onPart?: (session: UploadSession) => void | Promise<void>
    signal?: AbortSignal
  } = {},
): Promise<UploadSession> {
  const partTotal = partCount(session)
  const done = new Set(session.parts.map((part) => part.partNumber))

  const report = () =>
    options.onProgress?.({
      uploadedBytes: Math.min(session.parts.length * session.chunkSize, session.size),
      totalBytes: session.size,
      partsDone: session.parts.length,
      partTotal,
    })

  report()

  for (let part = 1; part <= partTotal; part++) {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (done.has(part)) continue

    const start = (part - 1) * session.chunkSize
    const body = file.slice(start, Math.min(start + session.chunkSize, session.size))

    const response = await fetch(
      endpoint(session, {
        multipartId: session.uploadId,
        multipartKey: session.key,
        multipartNumber: String(part),
      }),
      {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/octet-stream' },
        body,
        signal: options.signal,
      },
    )
    if (!response.ok) {
      throw new Error(await failure(response, `Part ${part} of ${partTotal} failed.`))
    }

    session.parts.push((await response.json()) as UploadedPart)
    session.parts.sort((a, b) => a.partNumber - b.partNumber)
    await options.onPart?.(session)
    report()
  }

  return session
}

export async function completeSession(session: UploadSession): Promise<void> {
  const response = await fetch(
    endpoint(session, { multipartId: session.uploadId, multipartKey: session.key }),
    {
      method: 'POST',
      credentials: 'same-origin',
      headers: json,
      body: JSON.stringify(session.parts),
    },
  )
  if (!response.ok) {
    throw new Error(await failure(response, 'Could not finish the upload.'))
  }
}

/**
 * Create the media document once the bytes are in R2.
 *
 * No `file` and no `url`: the server reads the real size and type off the
 * object, and deriving the URL is `setMediaUrl`'s job. Sending a `url` here
 * would make Payload fetch it server-side (shouldReupload -> getExternalFile).
 */
export async function createMediaDocument(input: {
  filename: string
  mimeType: string
  alt?: string
}): Promise<{ id: number }> {
  const response = await fetch('/api/media', {
    method: 'POST',
    credentials: 'same-origin',
    headers: json,
    body: JSON.stringify({
      filename: input.filename,
      mimeType: input.mimeType,
      ...(input.alt ? { alt: input.alt } : {}),
    }),
  })
  if (!response.ok) {
    throw new Error(await failure(response, 'The upload finished but the document could not be created.'))
  }
  return ((await response.json()) as { doc: { id: number } }).doc
}

/** `video.final.mp4` -> `video.final`, for prefilling the alt text. */
export function defaultAltFor(filename: string) {
  const dot = filename.lastIndexOf('.')
  return dot > 0 ? filename.slice(0, dot) : filename
}

export function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}
