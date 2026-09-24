import { sql } from "@payloadcms/db-d1-sqlite";

/**
 * Recording and reading how many times an article has been read.
 *
 * WHY RAW D1 RATHER THAN PAYLOAD. Two reasons, and either alone would decide
 * it. `posts` has `versions: { drafts: true }`, so writing a count through
 * `payload.update` would create a new version row **per view** — a table that
 * grows with traffic to store a number. And the collection's `afterChange`
 * runs `revalidatePosts`, so every view would invalidate the very cache entry
 * the view was served from. `post_views` is a table Payload does not know
 * about, exactly like `ai_rate_limits`, and this module is the only thing that
 * touches it.
 *
 * WHY A SEPARATE TABLE AND NOT `posts.view_count` — because Payload's update
 * path writes the whole merged document back (`dataToUpdate = { ...result }`),
 * so an increment landing between its read and its write is lost. The
 * migration header has the full reasoning.
 */

/**
 * Count one read of `postId`, if it names a published article.
 *
 * ONE STATEMENT, AND IT DOES TWO JOBS. `SELECT` then `UPDATE` from a Worker
 * means two requests that read the same value both write the same value, and
 * one read is lost — the cheapest possible version of the check-then-act bug
 * AGENTS.md records. `ON CONFLICT DO UPDATE` makes the database decide inside
 * the statement, which is the shape `checkAiRateLimit` uses and the shape the
 * gallery-merge migration had to be rewritten into.
 *
 * THE `WHERE EXISTS` IS THE SECURITY BOUNDARY, not a tidiness check. This runs
 * for anonymous visitors — that is the whole point, readers are not signed in
 * — so the id comes from whoever is calling. Without the guard,
 * `POST /api/posts/999999999/view` inserts a row, and a loop over the integers
 * fills the table from outside. With it, an id that is not a published article
 * matches nothing, inserts nothing, and returns no row: the table can only
 * ever hold one row per published post.
 *
 * It also settles a smaller question for free — a draft nobody can read cannot
 * accumulate reads, so a member cannot inflate their own numbers before
 * publishing.
 *
 * VERIFIED AGAINST REAL D1 rather than assumed, because `INSERT ... SELECT`
 * with `ON CONFLICT` is exactly the shape SQLite can find ambiguous (it needs
 * the SELECT to carry a WHERE, which this does). Measured on the local
 * database: a published id returned the incremented count, a draft id and
 * `999999999` both returned no rows and wrote nothing.
 *
 * `null` from `.first()` therefore means "refused", and the caller answers the
 * same 204 either way: telling an anonymous caller which ids exist is a
 * question this endpoint has no reason to answer.
 *
 * AN AUTHOR READING THEIR OWN ARTICLE IS NOT A READ. The count is shown only
 * to the owner, on `/members/posts`, as the answer to "how many people read
 * this" — and the owner is the one reader guaranteed to open it, to check it
 * after publishing and again after every edit. So `readerId` is the signed-in
 * user, when there is one, and a post they own matches nothing, exactly like a
 * draft. It is `owner_id` and not the `author` byline because owner is whose
 * list the number appears in.
 *
 * `?2 IS NULL` is not redundant with `IS NOT`. Without it an anonymous reader
 * binds NULL and the test becomes `owner_id IS NOT NULL`, which happens to be
 * true today for every post and would silently stop counting anonymous reads
 * of any post whose owner is ever cleared. Written out, anonymous reads never
 * depend on the owner column at all.
 */
export async function recordPostView(
  db: D1Database,
  postId: number,
  readerId: number | null,
): Promise<boolean> {
  const row = await db
    .prepare(
      `INSERT INTO post_views (post_id, count)
       SELECT ?1, 1
       WHERE EXISTS (
         SELECT 1 FROM posts
         WHERE id = ?1
           AND _status = 'published'
           AND (?2 IS NULL OR owner_id IS NOT ?2)
       )
       ON CONFLICT(post_id) DO UPDATE SET count = post_views.count + 1
       RETURNING count`,
    )
    .bind(postId, readerId)
    .first<{ count: number }>();

  return row !== null;
}

/**
 * Start a newly created post at zero reads, whatever `post_views` already says
 * about its id.
 *
 * WHY A NEW POST CAN ALREADY HAVE READS. `posts.id` is `integer PRIMARY KEY`
 * without `AUTOINCREMENT`, so SQLite hands out `MAX(id) + 1` — and when the
 * newest post is deleted, the next one created gets its id back. `post_views`
 * has no foreign key (the migration explains why), so the deleted post's row
 * survives and the new article is born carrying its reads. The migration's
 * header called that orphan harmless because nothing joins to it; id reuse is
 * exactly how something does. Found by M-VIEWSELF-T1, whose second local run
 * created post 16 again and read 1 before anyone had opened it.
 *
 * ON CREATE RATHER THAN ON DELETE, deliberately. A delete hook only covers
 * deletes that go through Payload; a row left behind any other way — a script
 * writing raw SQL, a delete from before this existed — would still be
 * inherited. Clearing at birth is right however the row got there, and it is
 * the moment the claim "this article has had no readers" is true by
 * definition, since it cannot have been published before it existed.
 *
 * By id, one row, never a pattern. Takes Payload's own connection rather than
 * `env.D1` because collection hooks also run from CLI scripts, where there is
 * no Worker context to ask.
 */
export async function resetPostViews(
  db: { run: (query: ReturnType<typeof sql>) => Promise<unknown> },
  postId: number,
): Promise<void> {
  await db.run(sql`DELETE FROM post_views WHERE post_id = ${postId}`);
}

/**
 * Read counts for several posts at once, as a Map keyed by post id.
 *
 * ONE QUERY FOR THE WHOLE LIST rather than one per row: `/members/posts`
 * renders every article a member has, and a per-row lookup would be that many
 * round trips to answer one screen.
 *
 * A POST MISSING FROM THE RESULT IS NOT AN ERROR — it has no row because
 * nobody has read it yet, and the caller renders 0. That is why this returns a
 * Map rather than an array the caller has to align by index.
 *
 * The ids are bound as parameters, never interpolated. They arrive from a
 * Payload query rather than from a request, so this is not the difference
 * between safe and unsafe today; it is the difference between a function that
 * stays safe when somebody later passes it ids from a URL, and one that
 * quietly does not.
 */
export async function readPostViews(
  db: D1Database,
  postIds: readonly number[],
): Promise<Map<number, number>> {
  if (postIds.length === 0) return new Map();

  const placeholders = postIds.map((_, index) => `?${index + 1}`).join(", ");
  const { results } = await db
    .prepare(
      `SELECT post_id, count FROM post_views WHERE post_id IN (${placeholders})`,
    )
    .bind(...postIds)
    .all<{ post_id: number; count: number }>();

  return new Map(results.map((row) => [row.post_id, row.count]));
}
