import { CHUNK_SIZE, type UploadSession } from './direct-upload'

/**
 * Persisted progress for in-flight direct uploads.
 *
 * R2's Workers binding exposes only `uploadPart`, `abort` and `complete` on
 * a multipart upload — there is no `listParts`. So the server genuinely
 * cannot tell a returning browser which parts already landed, and this
 * record is the only thing that makes resuming possible.
 *
 * That also bounds what resume can survive: a pause, a dropped connection,
 * a reload, a browser restart — but not clearing site data, and not moving
 * to another browser or machine. Recovering those would need a server-side
 * endpoint using the S3 API's ListParts.
 *
 * IndexedDB rather than localStorage because the part list on a multi-gigabyte
 * file runs to hundreds of entries and localStorage is both synchronous and
 * small.
 */

const DB_NAME = 'wildrunner-uploads'
const STORE = 'sessions'
const VERSION = 1

/** Identifies a file well enough to refuse to resume against a different one. */
export function fingerprint(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = work(db.transaction(STORE, mode).objectStore(STORE))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      }).finally(() => db.close()),
  )
}

const unavailable = () => typeof indexedDB === 'undefined'

/**
 * Every one of these swallows its errors on purpose. Persistence is what
 * makes resuming *possible*, not what makes uploading work — a browser in
 * private mode, or one that has blocked storage, should still be able to
 * upload, just without the ability to pick up where it left off.
 */
export async function saveSession(file: File, session: UploadSession): Promise<void> {
  if (unavailable()) return
  try {
    await run('readwrite', (store) => store.put(session, fingerprint(file)))
  } catch {
    /* resume is best-effort */
  }
}

export async function loadSession(file: File): Promise<UploadSession | null> {
  if (unavailable()) return null
  try {
    const stored = await run<UploadSession | undefined>('readonly', (store) =>
      store.get(fingerprint(file)),
    )
    if (!stored) return null
    // A session recorded under a different chunk size cannot be continued:
    // R2 requires every part but the last to be the same size, so resuming
    // one with today's CHUNK_SIZE would corrupt the object at `complete`.
    // Reachable whenever CHUNK_SIZE changes between deploys.
    if (stored.chunkSize !== CHUNK_SIZE) return null
    return stored
  } catch {
    return null
  }
}

export async function clearSession(file: File): Promise<void> {
  if (unavailable()) return
  try {
    await run('readwrite', (store) => store.delete(fingerprint(file)))
  } catch {
    /* nothing to do */
  }
}
