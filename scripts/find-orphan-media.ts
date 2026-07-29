/**
 * Report (and optionally delete) R2 objects that no media document points at.
 *
 * Direct uploads make orphans possible in a way the built-in path did not:
 * the bytes are in R2 before the document is created, so a quota rejection,
 * a closed tab, or a failed create leaves the object behind. The failed
 * 600 MB attempts that prompted this work are in the production bucket now.
 *
 * Dry run unless `--delete` is passed. Production has legacy objects that
 * predate Payload, so this must always be read first and acted on second.
 *
 * Incomplete multipart uploads are a *different* kind of debris and are not
 * visible here: `bucket.list()` does not return them and the Workers binding
 * cannot enumerate them at all. Those need a bucket lifecycle rule that
 * aborts incomplete multipart uploads after N days.
 *
 *   pnpm media:orphans                 # staging, report only
 *   pnpm media:orphans:prod            # production, report only
 *   pnpm media:orphans:prod -- --delete
 */
import { getPayload } from 'payload'
import config from '@payload-config'

const shouldDelete = process.argv.includes('--delete')

const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1)

async function main() {
  const payload = await getPayload({ config })

  const docs = await payload.find({
    collection: 'media',
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: { filename: true, url: true },
  })

  // A migrated document's `filename` is a flattened, sanitized value while
  // its real key keeps the original path segments — the same mismatch that
  // made generateFileURL rewrite every migrated image to a 404. Both forms
  // have to count as "referenced".
  const referenced = new Set<string>()
  for (const doc of docs.docs) {
    if (typeof doc.filename === 'string') referenced.add(doc.filename)
    if (typeof doc.url === 'string') {
      try {
        referenced.add(decodeURIComponent(new URL(doc.url).pathname.replace(/^\//, '')))
      } catch {
        referenced.add(doc.url.replace(/^\//, ''))
      }
    }
  }

  const r2 = await resolveBucket()

  let cursor: string | undefined
  let scanned = 0
  const orphans: { key: string; size: number }[] = []

  do {
    const listing = await r2.list({ cursor, limit: 1000 })
    for (const object of listing.objects) {
      scanned++
      if (!referenced.has(object.key)) orphans.push({ key: object.key, size: object.size })
    }
    cursor = listing.truncated ? listing.cursor : undefined
  } while (cursor)

  orphans.sort((a, b) => b.size - a.size)
  const total = orphans.reduce((sum, object) => sum + object.size, 0)

  console.log(
    `documents=${docs.docs.length} objects=${scanned} unreferenced=${orphans.length} (${mb(total)} MB)`,
  )
  for (const object of orphans) {
    console.log(`  ${mb(object.size).padStart(9)} MB  ${object.key}`)
  }

  if (!shouldDelete) {
    console.log(orphans.length ? '\nDry run. Pass --delete to remove these.' : '\nNothing to do.')
    return
  }

  for (const object of orphans) {
    await r2.delete(object.key)
    console.log(`deleted ${object.key}`)
  }
  console.log(`Removed ${orphans.length} objects (${mb(total)} MB).`)
}

async function resolveBucket(): Promise<R2Bucket> {
  const { getPlatformProxy } = await import('wrangler')
  const proxy = await getPlatformProxy({
    environment: process.env.CLOUDFLARE_ENV,
    remoteBindings: true,
  })
  return proxy.env.R2 as R2Bucket
}

await main()
process.exit(0)
