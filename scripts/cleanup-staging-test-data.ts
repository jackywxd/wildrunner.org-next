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
import { readFileSync } from 'node:fs'

import { getPayload } from 'payload'
import config from '@payload-config'

import galleriesSource from '../.velite/galleries.json'
import postsSource from '../.velite/posts.json'

const dryRun = process.argv.includes('--dry-run')
/**
 * Delete rows the heuristics found but no run claimed.
 *
 * Off by default, and that is the change. This script used to choose what to
 * destroy by shape — schedule rows whose name starts with `E2E `, posts whose
 * slug is missing from production. A keep-list built from prod's live API kept
 * that *mostly* safe, and mostly is the wrong property for a delete against a
 * shared database anyone on the internet can reach: a genuine post titled
 * `E2E 訓練心得` matches the same rule as a fixture.
 *
 * Now the run's own ledger decides (e2e/helpers/created.ts). Anything the
 * heuristics flag but the ledger does not claim is *reported* and left alone.
 * `--sweep` deletes it anyway, for a person who has read that report and
 * accepts it — which is the only circumstance in which a pattern should be
 * allowed to remove data.
 */
const sweep = process.argv.includes('--sweep')

/**
 * `collection:id` for every row this run recorded creating. Missing file means
 * an empty ledger, which means nothing is claimed and — without `--sweep` —
 * nothing is deleted. Failing safe is the point: a cleanup that cannot tell
 * what it made should remove nothing.
 */
function loadLedger(): Set<string> {
  const path = process.env.E2E_CREATED_LEDGER ?? 'test-results/created-on-staging.jsonl'
  const claimed = new Set<string>()
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    console.log(`[cleanup] no ledger at ${path} — nothing is claimed`)
    return claimed
  }
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      const row = JSON.parse(line) as { collection?: string; id?: string | number }
      if (row.collection && row.id !== undefined) {
        claimed.add(`${row.collection}:${row.id}`)
      }
    } catch {
      // One truncated line from a crashed spec must not discard the rest.
      console.log(`[cleanup] ledger line unparsable, skipping: ${line.slice(0, 80)}`)
    }
  }
  console.log(`[cleanup] ledger claims ${claimed.size} row(s)`)
  return claimed
}

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

/**
 * What production actually publishes today.
 *
 * The Velite source below is a snapshot frozen at the migration, so anything
 * production has gained since then looks like test junk to it — and staging
 * is kept in step with prod by `pnpm sync:staging`, so that content is
 * genuinely present here. Without this, cleanup deleted exactly what the
 * sync had just copied.
 *
 * Read-only, and additive: prod slugs *widen* the keep-list, never narrow
 * it. If prod is unreachable the Velite snapshot still applies on its own,
 * so a network failure can only make this more conservative, never less.
 */
async function prodDocs<T>(
  collection: 'galleries' | 'media' | 'posts',
): Promise<T[]> {
  const base = process.env.PROD_BASE_URL ?? 'https://wildrunner.org'
  try {
    const response = await fetch(`${base}/api/${collection}?limit=2000&depth=0`)
    if (!response.ok) throw new Error(`${response.status}`)
    return ((await response.json()) as { docs: T[] }).docs
  } catch (error) {
    console.warn(
      `cleanup: could not read prod ${collection} ` +
        `(${(error as Error).message}); falling back to the Velite snapshot only. ` +
        `Content added to prod after the migration may be reported as test data — ` +
        `re-check before deleting.`,
    )
    return []
  }
}

const slugsOf = (docs: { slug?: string }[]) =>
  docs.map((d) => d.slug).filter((s): s is string => Boolean(s))

async function main() {
  const payload = await getPayload({ config })

  const [prodPosts, prodGalleries, prodMedia] = await Promise.all([
    prodDocs<{ slug?: string }>('posts'),
    prodDocs<{ slug?: string }>('galleries'),
    prodDocs<{ filename?: string }>('media'),
  ])

  const realPostSlugs = new Set([
    ...(postsSource as VelitePost[]).map((p) => p.slug),
    ...slugsOf(prodPosts),
  ])
  const realGallerySlugs = new Set([
    ...(galleriesSource as VeliteGallery[]).map((g) => g.slug),
    ...slugsOf(prodGalleries),
  ])

  // Filenames as production stores them, for media that reached prod after
  // the migration (member uploads, new galleries) and was then copied here
  // by `pnpm sync:staging`.
  const realMediaFilenames = new Set<string>(
    prodMedia.map((m) => m.filename).filter((f): f is string => Boolean(f)),
  )
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
    raceSchedule: [] as string[],
    raceRecords: [] as string[],
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

  /**
   * Schedule rows the e2e suite created.
   *
   * Unlike posts and galleries there is no migrated "real" set to diff
   * against, so the marker is the name prefix every spec uses. It matters
   * more here than for the other collections: race-schedule read access is
   * public and undated rows render on staging's own /races page, so a
   * leftover test row is visible to anyone who visits.
   *
   * The suite also deletes its own rows in afterAll; this covers the runs
   * that failed hard before getting there.
   */
  const scheduleRows = await payload.find({
    collection: 'race-schedule',
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  for (const row of scheduleRows.docs) {
    if (typeof row.name === 'string' && row.name.startsWith('E2E ')) {
      report.raceSchedule.push(`${row.id}:${row.name}`)
    }
  }

  // Records belonging to the throwaway accounts above. Pre-existing gap:
  // race-records was never in this script, so every e2e run left rows
  // behind pointing at users this script then deleted.
  const raceRecords = await payload.find({
    collection: 'race-records',
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  for (const record of raceRecords.docs) {
    const ownerId =
      typeof record.owner === 'object' && record.owner ? record.owner.id : record.owner
    if (typeof ownerId === 'number' && testUserIds.includes(ownerId)) {
      report.raceRecords.push(`${record.id}:${record.eventId}`)
    }
  }

  // Split every heuristic finding into what this run claims and what it does
  // not. Claimed rows are deleted in the order below; unclaimed ones are
  // reported so drift stays visible without a pattern deciding a delete.
  const claimed = loadLedger()
  const unclaimed: Record<string, string[]> = {}
  for (const [key, collection] of [
    ['posts', 'posts'],
    ['galleries', 'galleries'],
    ['media', 'media'],
    ['users', 'users'],
    ['authors', 'authors'],
    ['raceSchedule', 'race-schedule'],
    ['raceRecords', 'race-records'],
  ] as const) {
    const entries = report[key] as string[]
    const keep = entries.filter((e) => claimed.has(`${collection}:${e.split(':')[0]}`))
    unclaimed[key] = entries.filter((e) => !keep.includes(e))
    if (!sweep) {
      report[key] = keep as never
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: dryRun ? 'dry-run' : sweep ? 'delete (sweep)' : 'delete (claimed only)',
        unclaimedLeftAlone: sweep
          ? 'none — --sweep deletes these too'
          : Object.fromEntries(
              Object.entries(unclaimed).map(([k, v]) => [k, v.length]),
            ),
        unclaimedSamples: Object.fromEntries(
          Object.entries(unclaimed).map(([k, v]) => [k, v.slice(0, 5)]),
        ),
        wouldDelete: {
          posts: report.posts.length,
          galleries: report.galleries.length,
          media: report.media.length,
          users: report.users.length,
          authors: report.authors.length,
          raceSchedule: report.raceSchedule.length,
          raceRecords: report.raceRecords.length,
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
          raceSchedule: report.raceSchedule.slice(0, 5),
        },
      },
      null,
      2,
    ),
  )

  if (dryRun) {
    process.exit(0)
  }

  // Race data first: schedule rows stand alone, and records must go before
  // the accounts that own them.
  for (const entry of report.raceSchedule) {
    await payload.delete({
      collection: 'race-schedule',
      id: Number(entry.split(':')[0]),
      overrideAccess: true,
    })
  }
  for (const entry of report.raceRecords) {
    await payload.delete({
      collection: 'race-records',
      id: Number(entry.split(':')[0]),
      overrideAccess: true,
    })
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
