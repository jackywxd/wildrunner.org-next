/**
 * Classify every media row that predates `media.usage`.
 *
 * The migration that added the column only reproduced what was already public
 * — a race tag meant 'gallery', everything else became 'private' — so nothing
 * changed on deploy. This is the step that actually turns the library on, and
 * it is a separate, human-run script rather than part of the migration for one
 * reason: it is the step that decides what the public can see. Run the dry
 * report, read the counts, then pass `--write`.
 *
 * THREE BUCKETS, NOT TWO, and the third is the point.
 *
 *   attachment  an article or a byline holds it — `posts.image`, an upload
 *               node inside `posts.content` (including every `_posts_v`
 *               version), or `authors.avatar`. Cannot be expressed in SQL,
 *               because a pasted image is a node in a JSON blob rather than a
 *               foreign key; the walk is reused from
 *               src/lib/media/references.ts via `collectAttachmentMediaIds`.
 *   gallery     positive evidence of photo-wall intent: the file is in a
 *               curated album, is that album's cover, or carries a race tag.
 *   unproven    neither. Left exactly as the migration set it ('private'),
 *               and published only if `--publish-unproven` is passed.
 *
 * The first draft had two buckets — "not an attachment, therefore gallery" —
 * and the local corpus disproved it in one row. Media 22
 * (`posts--2024--my-ultra-races--07.webp`) was created by the Velite importer
 * while processing an article's inline images, but the markdown rewrite never
 * placed it, so nothing references it and nothing ever will. Under the
 * two-bucket rule it would have been published to the public photo wall. "Not
 * referenced by an article" is not the same claim as "not an article
 * attachment", and the importer's own `inlineImagesUnresolved` counter says
 * production may hold more of them.
 *
 * So the unproven bucket is reported rather than guessed at, with a sample of
 * filenames — the imported ones are recognisable (`posts--…`) and a member's
 * own upload is not. Publishing them is a decision about what the public can
 * see, which makes it the operator's, not this script's.
 *
 * Gallery membership deliberately does NOT make a file an attachment: a photo
 * in a curated album is photo-wall content, and folding galleries into the
 * exclusion set would hide the entire gallery from /gallery.
 *
 * ORDER OF OPERATIONS, per environment:
 *
 *   1. Deploy, so the schema exists.
 *   2. Confirm the ledger caught up — this is a read and touches nothing:
 *      npx wrangler d1 execute <db> --remote \
 *        --command "SELECT name FROM payload_migrations ORDER BY id DESC LIMIT 3;"
 *   3. pnpm media:usage:<env>                 # report only
 *   4. pnpm media:usage:<env> -- --write
 *   5. Re-query a sample row to confirm.
 *
 * Step 2 is not optional and step 3 is NOT read-only, which is the trap worth
 * naming: these scripts run with `NODE_ENV=production`, and
 * `@payloadcms/db-d1-sqlite`'s connect() applies every pending migration on
 * connect, whatever subcommand follows. Booting this script against a
 * deployed database is therefore a write even in dry-run mode. See AGENTS.md,
 * "NODE_ENV=production applies migrations. On connect."
 *
 *   pnpm media:usage                  # local, report only
 *   pnpm media:usage:staging
 *   pnpm media:usage:prod -- --write
 *   pnpm media:usage:prod -- --write --publish-unproven
 */
import { getPayload } from 'payload'
import config from '@payload-config'

import { collectAttachmentMediaIds } from '../src/lib/media/references'

const shouldWrite = process.argv.includes('--write')
const publishUnproven = process.argv.includes('--publish-unproven')

/** Media the galleries themselves vouch for: an album row, or an album cover. */
async function collectAlbumMediaIds(
  payload: Awaited<ReturnType<typeof getPayload>>,
): Promise<Set<number>> {
  const ids = new Set<number>()
  const { docs } = await payload.find({
    collection: 'galleries',
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: { cover: true, items: true },
  })
  for (const doc of docs) {
    if (typeof doc.cover === 'number') ids.add(doc.cover)
    for (const row of doc.items ?? []) {
      if (typeof row.media === 'number') ids.add(row.media)
    }
  }
  return ids
}

async function main() {
  const payload = await getPayload({ config })

  const attachments = await collectAttachmentMediaIds(payload)
  console.log(
    `scanned ${Object.entries(attachments.counts)
      .map(([surface, n]) => `${surface}=${n}`)
      .join(' ')} -> ${attachments.ids.size} media referenced as attachments`,
  )

  const albumIds = await collectAlbumMediaIds(payload)
  console.log(`${albumIds.size} media are in a curated album or are an album cover`)

  const { docs } = await payload.find({
    collection: 'media',
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: { filename: true, raceEdition: true, usage: true },
  })

  const wanted = new Map<number | string, 'attachment' | 'gallery'>()
  const tally = { attachment: 0, gallery: 0, unchanged: 0 }
  const unproven: string[] = []

  for (const doc of docs) {
    const isAttachment = attachments.ids.has(doc.id)
    const isPhotoWall =
      !isAttachment &&
      (albumIds.has(doc.id) || (doc.raceEdition !== null && doc.raceEdition !== undefined))

    if (!isAttachment && !isPhotoWall && !publishUnproven) {
      unproven.push(`${doc.id} ${doc.filename ?? '(no filename)'}`)
      tally.unchanged += 1
      continue
    }

    const target = isAttachment ? 'attachment' : 'gallery'
    if (doc.usage === target) {
      tally.unchanged += 1
      continue
    }
    wanted.set(doc.id, target)
    tally[target] += 1
  }

  console.log(
    `media=${docs.length} -> attachment=${tally.attachment} gallery=${tally.gallery} ` +
      `unchanged=${tally.unchanged}`,
  )

  if (unproven.length > 0) {
    console.log(
      `\n${unproven.length} media have neither an article holding them nor album/race evidence.` +
        ' Left as they are. A sample:',
    )
    for (const line of unproven.slice(0, 25)) console.log(`  ${line}`)
    console.log(
      '\nRead the filenames before deciding: `posts--…` names are Velite imports whose article' +
        ' never placed them, and publishing those puts an orphaned article image on the photo wall.' +
        ' Pass --publish-unproven once you are satisfied they are members\' own uploads.',
    )
  }

  if (!shouldWrite) {
    console.log('\nDry run. Pass --write to apply.')
    return
  }

  // Straight to the adapter: payload.update would fire afterChange, and
  // streamIngestOnUpload would try to push every one of these videos into
  // Cloudflare Stream.
  for (const [id, usage] of wanted) {
    await payload.db.updateOne({ collection: 'media', id, data: { usage } })
  }

  // Polled from the database rather than from the loop above, per AGENTS.md:
  // a script that has finished its writes and a script that thinks it has are
  // indistinguishable from its own success message.
  const [galleryNow, attachmentNow, unclassifiedNow] = await Promise.all([
    payload.count({ collection: 'media', where: { usage: { equals: 'gallery' } } }),
    payload.count({ collection: 'media', where: { usage: { equals: 'attachment' } } }),
    payload.count({ collection: 'media', where: { usage: { exists: false } } }),
  ])
  console.log(
    `after: gallery=${galleryNow.totalDocs} attachment=${attachmentNow.totalDocs} ` +
      `unclassified=${unclassifiedNow.totalDocs}`,
  )
  if (unclassifiedNow.totalDocs > 0) {
    throw new Error(
      `${unclassifiedNow.totalDocs} media rows still have no usage. They are invisible on ` +
        '/gallery and the sweep cannot classify them either — investigate before deploying.',
    )
  }
}

await main()
// Booting Payload from the CLI leaves something on the event loop, so a
// script that has finished its work still never returns. See AGENTS.md.
process.exit(0)
