import type { CollectionBeforeDeleteHook, PayloadRequest } from 'payload'
import { APIError } from 'payload'
import { sql } from '@payloadcms/db-d1-sqlite'

import { revalidateForPost } from '../../lib/revalidate-public'
import { UNLINK_FLAG } from '../../lib/members/race-record-unlink'

/**
 * Deleting a race record an article cites: refuse once, then do it properly.
 *
 * THE CONSTRAINT. `posts.race_record_id` and `_posts_v.version_race_record_id`
 * both declare `REFERENCES race_records(id)` with no `ON DELETE` action, so
 * SQLite's `NO ACTION` applies and D1 enforces it: deleting a cited record
 * raised `SQLITE_CONSTRAINT_FOREIGNKEY`, Payload answered 500 `Something went
 * wrong.`, and the member was told 「刪除失敗，請再試一次」 — advice for a
 * transient fault, about a constraint that refuses it every single time.
 *
 * WHY NOT `ON DELETE SET NULL` IN THE SCHEMA. SQLite cannot alter a foreign
 * key in place; it takes a full rebuild of `posts` and `_posts_v`. D1 has no
 * transactional DDL and `next build` enters migrations from several worker
 * processes at once, so a half-finished rebuild of the site's content table
 * is a class of accident worth going a long way to avoid. This does the same
 * thing one layer up, in DML that is ordinary and re-runnable.
 *
 * TWO STEPS, BECAUSE THE FIRST ONE IS NOT THE MEMBER'S TO ASSUME. Deleting a
 * record clears the badge from every article citing it, including published
 * ones — readers see something different afterwards. So a plain DELETE is
 * refused with a 409 that counts the articles, and only a DELETE carrying
 * `?unlinkArticles=true` — which the UI sends after the member has read that
 * count and confirmed — goes through. The count is in the error's `data` as
 * well as its sentence, so the confirmation can be built from a number
 * rather than by parsing Chinese.
 *
 * COUNTED AS ARTICLES, NOT ROWS, and both tables. An article contributes a
 * live row and a version row per save, so rows would tell a member with one
 * draft that eleven articles use it. And the live/version split cannot be
 * shown to the member as "still using it" vs "an old draft": a draft write
 * lands only in `_posts_v`, so an article being edited right now has no live
 * row at all. The tables cannot separate "removed" from "not yet published",
 * so this does not pretend they can.
 *
 * THE UNLINK IS RAW SQL, deliberately. `payload.db.updateVersion` would mean
 * reading every version of every citing article and writing it back whole,
 * to null one column. Two UPDATEs say the same thing, and are what the
 * foreign key would have done. The cost is naming the generated column
 * `version_race_record_id` here — a rename would break this, and
 * `M-RACEDEL-T1` is what would notice, because the delete it confirms would
 * stop succeeding.
 */

/** Every article citing this record, live rows and versions alike, by slug. */
async function citingArticles(
  id: number | string,
  req: PayloadRequest,
): Promise<Map<number | string, string | null>> {
  const { payload } = req
  // `overrideAccess`: the member must be told their record is cited even when
  // the citing article is somebody else's and their own access rules would
  // hide it — the same reasoning `uniqueRaceRecord` gives for its lookup.
  const shared = { depth: 0, overrideAccess: true, pagination: false, req } as const

  const [live, versions] = await Promise.all([
    payload.find({ collection: 'posts', where: { raceRecord: { equals: id } }, ...shared }),
    payload.findVersions({
      collection: 'posts',
      where: { 'version.raceRecord': { equals: id } },
      ...shared,
    }),
  ])

  const articles = new Map<number | string, string | null>()
  for (const doc of live.docs) articles.set(doc.id, doc.slug ?? null)
  for (const row of versions.docs) {
    const parent = (row as { parent?: number | string }).parent
    // A version's own slug is the one saved with it, which is the right one
    // to revalidate when the live row is gone — and the only one available
    // for an article that has never been published.
    const slug = (row as { version?: { slug?: string | null } }).version?.slug ?? null
    if (parent === undefined) continue
    if (!articles.has(parent) || articles.get(parent) === null) {
      articles.set(parent, slug)
    }
  }
  return articles
}

export const refuseRaceRecordInUse: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const articles = await citingArticles(id, req)
  if (articles.size === 0) return

  if (req.query?.[UNLINK_FLAG] !== 'true') {
    throw new APIError(
      `這筆紀錄有 ${articles.size} 篇文章在使用（包含草稿和舊版本）。` +
        `刪除會讓那些文章的徽章一起消失，文章本身不受影響。`,
      409,
      { articles: articles.size },
      // Explicit rather than inferred. `isErrorPublic` would already pass a
      // non-500 status through, but the whole point is the sentence reaching
      // the member, so it says so rather than depending on the status code
      // keeping that side effect.
      true,
    )
  }

  // What `ON DELETE SET NULL` would have done, a layer up. Both statements
  // are safe to repeat: a second run matches no rows.
  const { drizzle } = req.payload.db
  await drizzle.run(sql`UPDATE \`posts\` SET \`race_record_id\` = NULL WHERE \`race_record_id\` = ${id};`)
  await drizzle.run(
    sql`UPDATE \`_posts_v\` SET \`version_race_record_id\` = NULL WHERE \`version_race_record_id\` = ${id};`,
  )

  // Raw SQL writes past Payload's own hooks, so the pages those articles
  // render have to be invalidated here — `revalidateRaceRecord.afterDelete`
  // only refreshes the rider's profile, which is where the badge *also*
  // appears but not the only place.
  for (const slug of articles.values()) revalidateForPost(slug)
}
