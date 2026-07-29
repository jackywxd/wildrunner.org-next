/**
 * Fill in `media.filesize` for documents created without one.
 *
 * The Velite migration wrote documents with `payload.db.create` and no file,
 * so every migrated row has filesize NULL. Storage quotas are a sum of that
 * column (see lib/quota.ts), which means those files currently count as
 * zero bytes and the usage shown in the admin UI is wrong. Nobody is over
 * their allowance today — the rows belong to an admin, who is exempt, or to
 * nobody — but the number is wrong and any change of ownership inherits it.
 *
 * Dry run unless `--write` is passed.
 *
 *   pnpm media:backfill-size            # staging, report only
 *   pnpm media:backfill-size:prod       # production, report only
 *   pnpm media:backfill-size:prod -- --write
 */
import { getPayload } from 'payload'
import config from '@payload-config'

const shouldWrite = process.argv.includes('--write')

const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1)

/**
 * A migrated document's `filename` is flattened and sanitized
 * (`posts--2023--utmb--cover.webp`) while the object it refers to kept its
 * path (`posts/2023/utmb/cover.webp`) — the mismatch that made
 * generateFileURL rewrite every migrated image to a 404. The URL is the
 * reliable source for the key; `filename` is the fallback for anything
 * uploaded since.
 */
function candidateKeys(doc: { filename?: unknown; url?: unknown }): string[] {
  const keys: string[] = []
  if (typeof doc.url === 'string' && doc.url) {
    try {
      keys.push(decodeURIComponent(new URL(doc.url).pathname.replace(/^\//, '')))
    } catch {
      keys.push(doc.url.replace(/^\//, ''))
    }
  }
  if (typeof doc.filename === 'string' && doc.filename) keys.push(doc.filename)
  return keys
}

async function main() {
  const payload = await getPayload({ config })
  const { getPlatformProxy } = await import('wrangler')
  const proxy = await getPlatformProxy({
    environment: process.env.CLOUDFLARE_ENV,
    remoteBindings: true,
  })
  const bucket = proxy.env.R2 as R2Bucket

  const { docs } = await payload.find({
    collection: 'media',
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: { filename: true, url: true, filesize: true },
  })

  const updates: { id: number | string; size: number }[] = []
  const unresolved: string[] = []
  const pending = docs.filter((doc) => !(typeof doc.filesize === 'number' && doc.filesize > 0))
  const alreadySet = docs.length - pending.length

  // Each lookup is a round trip to R2 through the remote proxy, so doing
  // them one at a time takes minutes for a few hundred rows. Bounded rather
  // than unbounded: five hundred simultaneous head requests is a good way to
  // get rate limited.
  const CONCURRENCY = 16
  let cursor = 0
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (cursor < pending.length) {
        const doc = pending[cursor++]!
        let size: number | null = null
        for (const key of candidateKeys(doc)) {
          const object = await bucket.head(key)
          if (object) {
            size = object.size
            break
          }
        }
        if (size === null) {
          unresolved.push(String(doc.filename ?? doc.id))
        } else {
          updates.push({ id: doc.id, size })
        }
      }
    }),
  )

  const total = updates.reduce((sum, update) => sum + update.size, 0)
  console.log(
    `documents=${docs.length} already-set=${alreadySet} to-update=${updates.length} ` +
      `(${mb(total)} MB) unresolved=${unresolved.length}`,
  )
  for (const name of unresolved.slice(0, 20)) console.log(`  unresolved: ${name}`)

  if (!shouldWrite) {
    console.log('\nDry run. Pass --write to apply.')
    await proxy.dispose()
    return
  }

  // Straight to the adapter: payload.update would fire afterChange, and
  // streamIngestOnUpload would try to push every one of these videos into
  // Cloudflare Stream.
  for (const update of updates) {
    await payload.db.updateOne({
      collection: 'media',
      id: update.id,
      data: { filesize: update.size },
    })
  }
  console.log(`Updated ${updates.length} documents.`)
  await proxy.dispose()
}

await main()
process.exit(0)
