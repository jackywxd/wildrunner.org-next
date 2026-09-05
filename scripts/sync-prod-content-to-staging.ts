/**
 * Backfill published content that exists in production but not in staging.
 *
 * Staging is the database production cuts over to, so the two drifting apart
 * makes staging a weaker rehearsal. This closes the gap in one direction
 * only — prod is the source of truth, staging never writes back.
 *
 * What it does NOT touch:
 *
 * - `users`. Production rows carry real emails and bcrypt hashes, and there
 *   is no reason to duplicate either into an environment whose admin
 *   password is a constant in e2e/helpers/. Owner references are remapped to
 *   a staging account instead (--owner).
 *
 *   Note on email: staging's RESEND_API_KEY is currently *empty*, so
 *   `isEmailConfigured()` is false and Payload only logs mail — an invite or
 *   reset there sends nothing today. That is a config away from changing,
 *   though, and filling the key in while real addresses sat in this database
 *   would start mailing real members. Keeping `users` out means that stays
 *   impossible rather than merely unlikely.
 * - Drafts. Prod is read over its public REST API, which only exposes
 *   published documents. Unpublished work is nobody else's business.
 * - R2 objects. Migrated media rows hold absolute `images.wildrunner.org`
 *   URLs, which staging reads directly (see wrangler.jsonc) — so a 515 MB
 *   video needs its row copied, not its bytes.
 *
 * Media rows are created through `payload.db.create`, not `payload.create`,
 * for the reason spelled out in migrate-velite-to-payload.ts: Payload treats
 * a create carrying `url` on an upload collection as "paste this URL to
 * upload" and would re-fetch and re-host the file.
 *
 *   pnpm sync:staging --dry-run
 *   pnpm sync:staging
 */
import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'

const PROD = process.env.PROD_BASE_URL ?? 'https://wildrunner.org'
const dryRun = process.argv.includes('--dry-run')

function argValue(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit?.split('=').slice(1).join('=')
}

/** Staging account to attribute synced content to. */
const ownerEmail = argValue('owner') ?? 'admin@wildrunner.test'

type ProdMedia = {
  alt?: string
  blurDataURL?: string | null
  filename?: string | null
  height?: number | null
  id: number
  legacyVideoId?: string | null
  mimeType?: string | null
  url?: string | null
  usage?: 'gallery' | 'private' | 'attachment' | null
  width?: number | null
}

async function prodList<T>(collection: string): Promise<T[]> {
  const response = await fetch(
    `${PROD}/api/${collection}?limit=500&depth=1`,
    { headers: { Accept: 'application/json' } },
  )
  if (!response.ok) {
    throw new Error(`prod ${collection}: ${response.status} ${await response.text()}`)
  }
  return ((await response.json()) as { docs: T[] }).docs
}

async function main() {
  const payload = await getPayload({ config })

  const owner = (
    await payload.find({
      collection: 'users',
      where: { email: { equals: ownerEmail } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0]
  if (!owner) throw new Error(`No staging user ${ownerEmail} — pass --owner=<email>`)

  /** prod media id -> staging media id, filled lazily as references are hit. */
  const mediaMap = new Map<number, number>()

  async function ensureMedia(prod: ProdMedia | number | null | undefined) {
    if (prod === null || prod === undefined) return null
    if (typeof prod === 'number') return null // depth:1 should have expanded it
    if (mediaMap.has(prod.id)) return mediaMap.get(prod.id)!
    if (!prod.url) return null

    // Keyed on filename: the same object may already be on staging under a
    // different row id (both databases were seeded from the same migration).
    const existing = prod.filename
      ? (
          await payload.find({
            collection: 'media',
            where: { filename: { equals: prod.filename } },
            limit: 1,
            depth: 0,
            overrideAccess: true,
          })
        ).docs[0]
      : undefined

    if (existing) {
      mediaMap.set(prod.id, existing.id)
      return existing.id
    }

    console.log(`  + media ${prod.filename} (${prod.mimeType ?? '?'})`)
    if (dryRun) {
      mediaMap.set(prod.id, -1)
      return -1
    }

    const created = await payload.db.create({
      collection: 'media',
      data: {
        alt: prod.alt ?? prod.filename ?? 'synced',
        url: prod.url,
        filename: prod.filename,
        mimeType: prod.mimeType,
        width: prod.width ?? undefined,
        height: prod.height ?? undefined,
        blurDataURL: prod.blurDataURL ?? undefined,
        // Copied from production rather than defaulted, and stated explicitly
        // rather than omitted: `payload.db.create` skips the document layer,
        // and Drizzle binds a column's declared default as an INSERT parameter,
        // so leaving this out would silently publish production's article
        // images on staging's photo wall.
        usage: prod.usage ?? 'attachment',
        legacyVideoId: prod.legacyVideoId ?? undefined,
        owner: owner.id,
      },
    })
    mediaMap.set(prod.id, created.id as number)
    return created.id as number
  }

  const summary = { galleries: 0, media: 0, posts: 0 }

  // ---- galleries ----
  type ProdGallery = {
    cover?: ProdMedia | number | null
    eventDate?: string | null
    featured?: boolean | null
    // One list for photos and videos alike — see Galleries.ts. `featured`
    // marks the album's hero image.
    items?: { featured?: boolean | null; media?: ProdMedia | number | null }[]
    location?: string | null
    name: string
    slug: string
  }

  for (const gallery of await prodList<ProdGallery>('galleries')) {
    const already = await payload.find({
      collection: 'galleries',
      where: { slug: { equals: gallery.slug } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (already.totalDocs > 0) continue

    console.log(`gallery ${gallery.slug}`)
    const cover = await ensureMedia(gallery.cover as ProdMedia)
    const items: { featured?: boolean; media: number }[] = []
    for (const row of gallery.items ?? []) {
      const id = await ensureMedia(row.media as ProdMedia)
      if (id) items.push({ media: id, featured: row.featured ?? false })
    }

    summary.galleries += 1
    if (dryRun) continue

    await payload.create({
      collection: 'galleries',
      data: {
        name: gallery.name,
        slug: gallery.slug,
        location: gallery.location ?? undefined,
        eventDate: gallery.eventDate ?? undefined,
        featured: gallery.featured ?? false,
        cover: cover ?? undefined,
        items,
        owner: owner.id,
        _status: 'published',
      },
      overrideAccess: true,
    })
  }

  /**
   * Rewrite the `upload` nodes inside a post's body to staging's media ids.
   *
   * Production is read at `depth=1`, and Payload populates *every*
   * relationship at that depth — including the upload nodes inside rich
   * text, whose `value` comes back as the entire Media document.
   * `guardPostContent` refuses exactly that shape, because a populated
   * value corrupts the field both Payload's own population and the public
   * converter expect to be a bare id. So a post with any image in its body
   * could never be copied: the create died with one ValidationError per
   * upload node, and the cover media it had already written stayed behind as
   * an orphan.
   *
   * Found by running this against production for the first time on
   * 2026-08-31 — `whistler-by-utmb-2026-crew`, four upload nodes, four
   * errors. It had been unreachable before only because nothing had asked
   * this script to copy a post with pictures in it.
   *
   * Depth 1 is not the thing to change: `ensureMedia` needs the populated
   * object to key on filename, and the cover goes through it too. The body
   * simply gets the same treatment the cover already had.
   *
   * A node that cannot be mapped throws rather than writing `undefined`:
   * the guard would reject that too, but with a message about the shape
   * rather than about the media that could not be resolved.
   */
  async function remapContentUploads(content: unknown, slug: string) {
    const walk = async (node: unknown): Promise<void> => {
      if (!node || typeof node !== 'object') return
      const record = node as Record<string, unknown>

      if (record.type === 'upload' && record.value && typeof record.value === 'object') {
        const mapped = await ensureMedia(record.value as ProdMedia)
        if (mapped === null) {
          const source = record.value as ProdMedia
          throw new Error(
            `${slug}: cannot map the upload ${source.filename ?? source.id} in its body ` +
              `to a staging media row — it has no url, so ensureMedia could not copy it`,
          )
        }
        record.value = mapped
      }

      if (Array.isArray(record.children)) {
        const kept: unknown[] = []
        for (const child of record.children) {
          if (isEmptyUpload(child)) {
            dropped += 1
            continue
          }
          await walk(child)
          kept.push(child)
        }
        record.children = kept
      }
    }

    let dropped = 0
    await walk((content as { root?: unknown } | undefined)?.root)
    if (dropped > 0) {
      console.log(`  ~ ${slug}: dropped ${dropped} upload node(s) pointing at nothing`)
    }
  }

  /**
   * An `upload` node whose `value` is null — a picture that is not there.
   *
   * WHAT THESE ARE. Production really holds them: `post-1788195110040` has
   * four, at `children[38]`, `[75]`, `[111]` and one before those. The media
   * row they pointed at is gone, so Payload's own population at `depth=1`
   * fills the node's `value` with `null` rather than a document.
   *
   * WHY DROPPING THEM IS THE FAITHFUL COPY, not a loss. The public renderer
   * already draws nothing for them — `payload-rich-text.tsx`'s upload
   * converter opens with `if (!value || typeof value !== "object" ||
   * !value.url) return null`. So the article as a reader sees it on
   * production is the article without these nodes, and staging showing the
   * same thing is the point of the sync. Keeping them would mean carrying a
   * node that cannot render into a database whose `guardPostContent` refuses
   * it outright.
   *
   * WHY `remapContentUploads` MISSED THEM BEFORE. Its rewrite is guarded by
   * `record.value && typeof record.value === 'object'`, and `null` is falsy
   * — so the node was skipped rather than handled, and the value it was
   * skipped with is exactly the one the guard rejects. The 2026-08-31 fix
   * addressed the opposite shape (a *populated* value) and could not see
   * this one.
   */
  function isEmptyUpload(node: unknown): boolean {
    if (!node || typeof node !== 'object') return false
    const record = node as Record<string, unknown>
    return record.type === 'upload' && (record.value === null || record.value === undefined)
  }

  // ---- posts ----
  type ProdPost = {
    content?: unknown
    description?: string
    image?: ProdMedia | number | null
    publishedAt?: string | null
    slug: string
    title: string
  }

  for (const post of await prodList<ProdPost>('posts')) {
    const already = await payload.find({
      collection: 'posts',
      where: { slug: { equals: post.slug } },
      limit: 1,
      depth: 0,
      draft: true,
      overrideAccess: true,
    })
    if (already.totalDocs > 0) continue

    console.log(`post ${post.slug}`)
    const image = await ensureMedia(post.image as ProdMedia)
    // Before the dry-run return, so a dry run counts the body's media too.
    // It reported `media: 1` for a post carrying four more.
    await remapContentUploads(post.content, post.slug)
    summary.posts += 1
    if (dryRun) continue

    await payload.create({
      collection: 'posts',
      data: {
        title: post.title,
        slug: post.slug,
        description: post.description ?? ' ',
        content: post.content as never,
        image: image ?? undefined,
        publishedAt: post.publishedAt ?? new Date().toISOString(),
        owner: owner.id,
        _status: 'published',
      },
      overrideAccess: true,
    })
  }

  summary.media = mediaMap.size
  console.log(
    `\n${dryRun ? 'Would sync' : 'Synced'}: ${JSON.stringify(summary)}` +
      `\nowner: ${ownerEmail} (id ${owner.id})`,
  )
  process.exit(0)
}

/**
 * Every message a Payload `ValidationError` is carrying.
 *
 * WHY THIS EXISTS. `console.error` on a ValidationError prints
 * `data: { errors: [ [Object], [Object], [Object], [Object] ] }` — Node's
 * default inspect depth stops exactly one level above the only part that
 * says what was wrong. A run against production on 2026-09-05 failed with
 * four content errors on `post-1788195110040` and the log could not say
 * which of `guardPostContent`'s two refusals had fired, and those two have
 * different fixes: a populated upload `value` is this script's bug, a
 * `pending` key is a defect in the stored document.
 *
 * The same lesson `scripts/import-race-qualifiers.ts` already carries about
 * its own failure line: a message that hides the complaint costs a whole
 * round trip to a deployed environment to recover.
 */
function validationMessages(error: unknown): string[] {
  const errors = (error as { data?: { errors?: unknown } } | undefined)?.data?.errors
  if (!Array.isArray(errors)) return []
  return errors.map((entry, index) => {
    const { path, message } = (entry ?? {}) as { path?: unknown; message?: unknown }
    return `  [${index}] ${String(path ?? '?')}: ${String(message ?? JSON.stringify(entry))}`
  })
}

main().catch((error) => {
  console.error(error)
  const details = validationMessages(error)
  if (details.length > 0) {
    console.error(`\n${details.length} validation error(s):`)
    for (const line of details) console.error(line)
  }
  process.exit(1)
})
