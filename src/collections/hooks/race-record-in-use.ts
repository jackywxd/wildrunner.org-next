import type { CollectionBeforeDeleteHook } from 'payload'
import { APIError } from 'payload'

/**
 * Refuse to delete a race record an article still cites, and say why.
 *
 * **This does not make the delete succeed.** `posts.race_record_id` and
 * `_posts_v.version_race_record_id` both declare `REFERENCES
 * race_records(id)` with no `ON DELETE` action, so SQLite's default —
 * `NO ACTION` — applies and D1 enforces it. Deleting a cited record raises
 * `SQLITE_CONSTRAINT_FOREIGNKEY`, Payload returns a 500 reading
 * `Something went wrong.`, and the member was told 「刪除失敗，請再試一次」:
 * advice for a transient fault, offered for a constraint that refuses it
 * every single time. So this changes the sentence, not the outcome. Letting
 * the record go would mean deciding what happens to the article citing it,
 * and SQLite cannot alter a foreign key in place — a table rebuild, not a
 * message.
 *
 * **BOTH TABLES, COUNTED AS ARTICLES.** The obvious shape — live rows are
 * "still using it", version rows are "an old draft that has not caught up" —
 * is wrong, and writing it that way is what this file did first. A draft
 * write lands only in `_posts_v`, so an article the member is editing right
 * now, citing the race, has *no* live row at all; telling them it was
 * "already removed and only lingers in old versions" is a false sentence
 * about the article open in the next tab. The two tables cannot separate
 * "removed" from "not yet published", so this does not claim they can: it
 * counts the distinct articles involved and says the one thing true of all
 * of them.
 *
 * **THE ADVICE IS TESTED, NOT ASSUMED.** Deleting the article takes its
 * versions with it, which frees the record — measured, and asserted by
 * `M-RACEDEL-T1`, because advice that does not work is worse than the
 * silence it replaced.
 *
 * What this does not cover: `payload_locked_documents_rels` also references
 * this table (Payload's admin edit lock). Race records are hidden from the
 * member admin panel and those rows expire, so it is rare — but it can still
 * block a delete this hook has just allowed. That path keeps Payload's
 * generic failure; `RaceRecordManager` no longer tells the member to retry
 * it, which is the part that was actively wrong.
 */
export const refuseRaceRecordInUse: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const { payload } = req

  // `overrideAccess` on both: the member must be told their record is cited
  // even when the citing article is somebody else's and their own access
  // rules would hide it — the same reasoning `uniqueRaceRecord` gives for
  // its lookup. Only the count crosses the boundary; no title, no author.
  const shared = { depth: 0, overrideAccess: true, pagination: false, req } as const

  const [live, versions] = await Promise.all([
    payload.find({
      collection: 'posts',
      where: { raceRecord: { equals: id } },
      ...shared,
    }),
    // The version table is queried through `findVersions` rather than raw
    // SQL so `version.raceRecord` stays Payload's business: `_posts_v`'s
    // column names are generated, and a migration that renames one would
    // silently stop matching here.
    payload.findVersions({
      collection: 'posts',
      where: { 'version.raceRecord': { equals: id } },
      ...shared,
    }),
  ])

  // Distinct articles, not rows. One article contributes a live row and a
  // version row per save, so counting rows would tell a member with one
  // draft that eleven articles use it.
  const articles = new Set<number | string>(live.docs.map((doc) => doc.id))
  for (const version of versions.docs) {
    const parent = (version as { parent?: number | string }).parent
    if (parent !== undefined) articles.add(parent)
  }

  if (articles.size > 0) {
    throw new APIError(
      `這筆紀錄有 ${articles.size} 篇文章在使用（包含草稿和舊版本），所以不能刪除。` +
        `要刪掉它，得先把那些文章刪掉。`,
      409,
      null,
      // Explicit rather than inferred. `isErrorPublic` would already pass a
      // non-500 status through, but the whole point of this hook is the
      // sentence reaching the member, so it says so rather than depending on
      // the status code keeping that side effect.
      true,
    )
  }
}
