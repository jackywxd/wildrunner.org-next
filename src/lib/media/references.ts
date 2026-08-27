/**
 * Everything in the database that points at a media file.
 *
 * This module exists because the obvious way to answer "is this photo used?"
 * is wrong in a way that destroys published content, and the wrongness is
 * invisible until someone opens an old article.
 *
 * Nine columns carry a real foreign key to `media` — `posts.image_id`,
 * `galleries.cover_id`, `galleries_images.media_id`,
 * `galleries_videos.media_id`, `authors.avatar_id`, and the four `_v`
 * version tables that shadow them. A query written against those columns
 * looks complete and passes review.
 *
 * It is not complete. **An image pasted into an article is not a foreign
 * key.** It is a node inside the `posts.content` JSON blob:
 *
 *     { "type": "upload", "relationTo": "media", "value": 123 }
 *
 * The database knows nothing about it. So `WHERE id NOT IN (SELECT image_id
 * ...)` classifies every in-article photo as unreferenced — which is both
 * the largest category of media on this site and the one most obviously in
 * use. Worse, every one of those foreign keys is `ON DELETE set null`, so
 * acting on that answer does not fail loudly: the R2 object goes, the post's
 * cover silently becomes blank, and nothing anywhere reports an error.
 *
 * Hence the generic walk in `collectUploadIds` rather than a list of the
 * places uploads are allowed to appear. Lexical nests — tables, lists, and
 * this repo's `BlocksFeature` blocks all hold arbitrary children — and a
 * hand-maintained list of container types is a list that goes stale the
 * first time somebody enables a feature. Walking every object and matching
 * on the node's own shape cannot go stale that way.
 *
 * Versions are scanned as thoroughly as live rows, which is a product
 * decision rather than a technical one: an image removed from an article
 * still sits in every `_posts_v` row saved before the removal, and treating
 * that as "in use" is what makes restoring an old version safe. It is also
 * what keeps this sweep from ever collecting a pasted-then-deleted photo,
 * so the files it actually reclaims are the ones uploaded to the library
 * and never placed anywhere.
 */
import type { Payload, PayloadRequest } from 'payload'

/**
 * How many documents to pull per page.
 *
 * Small because the rows are large: `content` is a whole article's JSON and
 * a version row carries a complete copy of one. The sweep runs weekly and
 * has no deadline, so the only thing worth optimising for is not holding a
 * hundred articles in a Worker's memory at once.
 */
const PAGE_SIZE = 100

/**
 * A ceiling on pages, so a bug here cannot become an unbounded loop.
 *
 * Reached rather than exceeded is a real condition the caller must not
 * treat as success — a truncated scan under-reports references, which is
 * exactly the direction that deletes a used file. `collectReferencedMediaIds`
 * throws rather than returning a short answer.
 */
const MAX_PAGES = 1000

/** A media id as it appears in the database: always the integer primary key. */
export type MediaId = number

/**
 * Pull every `media` id out of an arbitrary lexical tree.
 *
 * Exported for its own tests. The shape it matches is the one both
 * `MemberUploadNode` (src/lib/editor/nodes/upload-node.tsx) and Payload's
 * own `UploadServerNode` serialize — deliberately identical, as that file's
 * header records.
 *
 * `value` is accepted as a number, a numeric string, or a populated object.
 * The sweep reads at depth 0 so it should always be a bare id, but Payload's
 * upload feature replaces it with the whole media document at depth >= 1,
 * and a resolver that silently found nothing in a populated tree would
 * report every image in every article as unused.
 */
export function collectUploadIds(node: unknown, into: Set<MediaId> = new Set()): Set<MediaId> {
  if (node === null || typeof node !== 'object') return into

  if (Array.isArray(node)) {
    for (const entry of node) collectUploadIds(entry, into)
    return into
  }

  const record = node as Record<string, unknown>

  if (record.type === 'upload' && record.relationTo === 'media') {
    const id = toMediaId(record.value)
    if (id !== null) into.add(id)
    // Deliberately no `return`: an upload node still has children in some
    // Lexical versions, and skipping them would be an assumption with no
    // upside — walking an empty children array costs nothing.
  }

  for (const value of Object.values(record)) collectUploadIds(value, into)
  return into
}

/**
 * The id inside an upload node's `value`, or null if there isn't one.
 *
 * Rejects anything that is not a whole positive number. A `NaN` from a
 * malformed node must not become a `Set` member — `new Set([NaN])` swallows
 * it silently and every subsequent lookup misses, so the failure would show
 * up as a deleted file rather than an error.
 */
function toMediaId(value: unknown): MediaId | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? value : null
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
  }
  if (value && typeof value === 'object') return toMediaId((value as { id?: unknown }).id)
  return null
}

/** Add a relationship field's value, however Payload chose to represent it. */
function addRelation(value: unknown, into: Set<MediaId>): void {
  const id = toMediaId(value)
  if (id !== null) into.add(id)
}

/**
 * Walk one collection page by page, handing each document to `visit`.
 *
 * `pagination: false` is not used here on purpose. It would return the whole
 * collection in one response — every version of every article, content JSON
 * included — which is the one shape guaranteed to exhaust a Worker as the
 * site grows.
 */
async function eachDocument(
  run: (page: number) => Promise<{ docs: unknown[]; hasNextPage: boolean }>,
  visit: (doc: Record<string, unknown>) => void,
  label: string,
): Promise<number> {
  let page = 1
  let seen = 0

  for (;;) {
    const result = await run(page)
    for (const doc of result.docs) {
      visit(doc as Record<string, unknown>)
      seen += 1
    }
    if (!result.hasNextPage) return seen
    page += 1
    if (page > MAX_PAGES) {
      throw new Error(
        `Refusing to finish: ${label} still had pages after ${MAX_PAGES}. ` +
          'A truncated scan under-reports references, which deletes files that are in use.',
      )
    }
  }
}

export type ReferenceScan = {
  /** Every media id referenced from anywhere. */
  ids: Set<MediaId>
  /** What was read, per surface. Logged so a scan that silently read nothing is visible. */
  counts: Record<string, number>
}

/**
 * Every media id that anything in the database points at.
 *
 * Note what is NOT here: `media.raceEdition`. That is a media row pointing
 * *out* at a race, not something pointing in, but it still means the photo
 * is published — it is what puts it on that race's public wall (see
 * src/lib/race-gallery.ts, where a race album is a query over this tag
 * rather than a stored gallery). The policy in ./unused.ts treats it as a
 * use for that reason; keeping it out of here leaves this function with one
 * job, "what refers to media", and no exceptions to it.
 */
export async function collectReferencedMediaIds(
  payload: Payload,
  req?: PayloadRequest,
): Promise<ReferenceScan> {
  const ids = new Set<MediaId>()
  const counts: Record<string, number> = {}

  counts.posts = await eachDocument(
    (page) =>
      payload.find({
        collection: 'posts',
        depth: 0,
        limit: PAGE_SIZE,
        page,
        overrideAccess: true,
        req,
      }),
    (doc) => {
      addRelation(doc.image, ids)
      collectUploadIds(doc.content, ids)
    },
    'posts',
  )

  counts.postVersions = await eachDocument(
    (page) =>
      payload.findVersions({
        collection: 'posts',
        depth: 0,
        limit: PAGE_SIZE,
        page,
        overrideAccess: true,
        req,
      }),
    (doc) => {
      const version = (doc.version ?? {}) as Record<string, unknown>
      addRelation(version.image, ids)
      collectUploadIds(version.content, ids)
    },
    'post versions',
  )

  counts.galleries = await eachDocument(
    (page) =>
      payload.find({
        collection: 'galleries',
        depth: 0,
        limit: PAGE_SIZE,
        page,
        overrideAccess: true,
        req,
      }),
    (doc) => collectGalleryFields(doc, ids),
    'galleries',
  )

  counts.galleryVersions = await eachDocument(
    (page) =>
      payload.findVersions({
        collection: 'galleries',
        depth: 0,
        limit: PAGE_SIZE,
        page,
        overrideAccess: true,
        req,
      }),
    (doc) => collectGalleryFields((doc.version ?? {}) as Record<string, unknown>, ids),
    'gallery versions',
  )

  counts.authors = await eachDocument(
    (page) =>
      payload.find({
        collection: 'authors',
        depth: 0,
        limit: PAGE_SIZE,
        page,
        overrideAccess: true,
        req,
      }),
    (doc) => addRelation(doc.avatar, ids),
    'authors',
  )

  return { counts, ids }
}

/** `cover`, plus the media on every image and video row. Shared by live rows and versions. */
function collectGalleryFields(doc: Record<string, unknown>, into: Set<MediaId>): void {
  addRelation(doc.cover, into)
  for (const key of ['images', 'videos'] as const) {
    const rows = doc[key]
    if (!Array.isArray(rows)) continue
    for (const row of rows) {
      if (row && typeof row === 'object') addRelation((row as { media?: unknown }).media, into)
    }
  }
}
