/**
 * Remove e2e-generated content from the shared staging D1/R2.
 *
 * The e2e suite runs against the same database production will cut over to,
 * so every run leaves accounts, posts, galleries and uploads behind. This
 * deletes them.
 *
 * Safety: "real" is defined as *present in the Velite source* — the
 * authoritative list of what was migrated (15 posts, 20 galleries) — not by
 * guessing at test naming conventions. Anything whose slug isn't in that
 * list is test data. Media is keyed off the R2 objects the migration
 * references, so a genuinely migrated file is never touched even if a test
 * happened to reuse its name.
 *
 *   pnpm cleanup:staging --dry-run   # report only
 *   pnpm cleanup:staging             # actually delete
 */
import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'

import galleriesSource from '../.velite/galleries.json'
import postsSource from '../.velite/posts.json'

const dryRun = process.argv.includes('--dry-run')

type VelitePost = { slug: string }
type VeliteGallery = {
  slug: string
  images?: { src: string }[]
  videos?: { src: string }[]
}

/**
 * Byte-for-byte the same derivation as migrate-velite-to-payload.ts.
 *
 * Must not diverge: it does NOT url-decode, and it replaces every
 * non-[a-zA-Z0-9._-] character with '-', which matters a lot for the
 * CJK filenames in this dataset (e.g. 馬營2019-final.mp4). Deriving it
 * differently here would classify real migrated media as test junk.
 */
function migrationFilename(url: string): string {
  const parsed = new URL(url)
  return parsed.pathname
    .replace(/^\/+/, '')
    .replaceAll('/', '--')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
}

async function main() {
  const payload = await getPayload({ config })

  const realPostSlugs = new Set((postsSource as VelitePost[]).map((p) => p.slug))
  const realGallerySlugs = new Set(
    (galleriesSource as VeliteGallery[]).map((g) => g.slug),
  )

  const realMediaFilenames = new Set<string>()
  for (const gallery of galleriesSource as VeliteGallery[]) {
    for (const image of gallery.images ?? []) {
      realMediaFilenames.add(migrationFilename(image.src))
    }
    for (const video of gallery.videos ?? []) {
      realMediaFilenames.add(migrationFilename(video.src))
    }
  }
  // Post cover images live on the post records themselves.
  for (const post of postsSource as (VelitePost & { image?: { src: string } })[]) {
    if (post.image?.src) realMediaFilenames.add(migrationFilename(post.image.src))
  }

  // Inline images inside post bodies. Easy to miss — they are not in any
  // `images` array, only in the compiled MDX as resolved <img> src values,
  // which is exactly how the migration registers them. Omitting them here
  // classified all 112 as test junk and deleted their media rows, leaving
  // every upload node in the 8 affected posts pointing at nothing (the
  // underlying R2 objects survived, since the delete hook targets the
  // flattened `filename`, not the real slash-separated key).
  const imgCall = /\w+\.img\s*,\s*\{([^}]*)\}/g
  for (const post of postsSource as (VelitePost & { body?: string })[]) {
    for (const match of (post.body ?? '').matchAll(imgCall)) {
      const src = match[1].match(/src\s*:\s*"((?:[^"\\]|\\.)*)"/)?.[1]
      if (src) realMediaFilenames.add(migrationFilename(src))
    }
  }

  const report = {
    posts: [] as string[],
    galleries: [] as string[],
    media: [] as string[],
    users: [] as string[],
    authors: [] as string[],
  }

  const posts = await payload.find({
    collection: 'posts',
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  for (const post of posts.docs) {
    if (!realPostSlugs.has(post.slug)) report.posts.push(`${post.id}:${post.slug}`)
  }

  const galleries = await payload.find({
    collection: 'galleries',
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  for (const gallery of galleries.docs) {
    if (!realGallerySlugs.has(gallery.slug)) {
      report.galleries.push(`${gallery.id}:${gallery.slug}`)
    }
  }

  const media = await payload.find({
    collection: 'media',
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  for (const doc of media.docs) {
    if (doc.filename && !realMediaFilenames.has(doc.filename)) {
      report.media.push(`${doc.id}:${doc.filename}`)
    }
  }

  // Test accounts: anything on a .test domain. Real invitees use real
  // domains, so this can't catch a genuine member.
  //
  // Except the two named fixtures the e2e suite logs in as — deleting them
  // makes every authenticated test fail, and the admin one can't even be
  // recreated (users.create is admin-only, and the empty-install bootstrap
  // no longer applies). They're listed for deletion at production cutover
  // instead (see PLAN-members.md M7).
  const FIXTURE_ACCOUNTS = new Set([
    'admin@wildrunner.test',
    'member@wildrunner.test',
    'member2@wildrunner.test',
  ])

  const users = await payload.find({
    collection: 'users',
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const testUserIds: number[] = []
  for (const user of users.docs) {
    if (user.email.endsWith('.test') && !FIXTURE_ACCOUNTS.has(user.email)) {
      report.users.push(`${user.id}:${user.email}`)
      testUserIds.push(user.id)
    }
  }

  const authors = await payload.find({
    collection: 'authors',
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  for (const author of authors.docs) {
    const ownerId =
      typeof author.owner === 'object' && author.owner ? author.owner.id : author.owner
    if (typeof ownerId === 'number' && testUserIds.includes(ownerId)) {
      report.authors.push(`${author.id}:${author.slug}`)
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: dryRun ? 'dry-run' : 'delete',
        wouldDelete: {
          posts: report.posts.length,
          galleries: report.galleries.length,
          media: report.media.length,
          users: report.users.length,
          authors: report.authors.length,
        },
        keeping: {
          posts: posts.totalDocs - report.posts.length,
          galleries: galleries.totalDocs - report.galleries.length,
          media: media.totalDocs - report.media.length,
        },
        samples: {
          posts: report.posts.slice(0, 5),
          galleries: report.galleries.slice(0, 5),
          media: report.media.slice(0, 5),
          users: report.users.slice(0, 5),
        },
      },
      null,
      2,
    ),
  )

  if (dryRun) {
    process.exit(0)
  }

  // Order matters: galleries and posts reference media, users own authors.
  for (const entry of report.galleries) {
    await payload.delete({
      collection: 'galleries',
      id: Number(entry.split(':')[0]),
      overrideAccess: true,
    })
  }
  for (const entry of report.posts) {
    await payload.delete({
      collection: 'posts',
      id: Number(entry.split(':')[0]),
      overrideAccess: true,
    })
  }
  // Deleting through the Local API (not raw SQL) so the storage adapter's
  // afterDelete hook removes the R2 object too — otherwise every test upload
  // stays in the bucket forever and quota accounting drifts.
  for (const entry of report.media) {
    await payload.delete({
      collection: 'media',
      id: Number(entry.split(':')[0]),
      overrideAccess: true,
    })
  }
  // users.author_id -> authors.id and authors.owner_id -> users.id form a
  // cycle, so neither can be deleted first. Break it by clearing the user's
  // byline pointer, then delete authors, then the users themselves.
  for (const entry of report.users) {
    await payload.update({
      collection: 'users',
      id: Number(entry.split(':')[0]),
      data: { author: null },
      overrideAccess: true,
    })
  }
  for (const entry of report.authors) {
    await payload.delete({
      collection: 'authors',
      id: Number(entry.split(':')[0]),
      overrideAccess: true,
    })
  }
  for (const entry of report.users) {
    await payload.delete({
      collection: 'users',
      id: Number(entry.split(':')[0]),
      overrideAccess: true,
    })
  }

  console.log('Cleanup complete.')
  process.exit(0)
}

await main()
