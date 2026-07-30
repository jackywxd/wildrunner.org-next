/**
 * Backfill published content that exists in production but not in staging.
 *
 * Staging is the database production cuts over to, so the two drifting apart
 * makes staging a weaker rehearsal. This closes the gap in one direction
 * only — prod is the source of truth, staging never writes back.
 *
 * What it does NOT touch:
 *
 * - `users`. Production rows carry real emails and password hashes, and
 *   staging has a live RESEND_API_KEY sending from noreply@wildrunner.org —
 *   an invite or reset triggered on staging would email real members. Owner
 *   references are remapped to a staging account instead (--owner).
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
  mimeType?: string | null
  url?: string | null
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
    // Both `images` rows and `videos` rows key the upload as `media` — see
    // Galleries.ts. `featured` marks the album's hero image.
    images?: { featured?: boolean | null; media?: ProdMedia | number | null }[]
    location?: string | null
    name: string
    slug: string
    videos?: { media?: ProdMedia | number | null; videoId?: string | null }[]
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
    const images: { featured?: boolean; media: number }[] = []
    for (const row of gallery.images ?? []) {
      const id = await ensureMedia(row.media as ProdMedia)
      if (id) images.push({ media: id, featured: row.featured ?? false })
    }
    const videos: { media: number; videoId?: string | null }[] = []
    for (const row of gallery.videos ?? []) {
      const id = await ensureMedia(row.media as ProdMedia)
      if (id) videos.push({ media: id, videoId: row.videoId ?? undefined })
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
        images,
        videos,
        owner: owner.id,
        _status: 'published',
      },
      overrideAccess: true,
    })
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

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
