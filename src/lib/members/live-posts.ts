import { memberFind } from "@/lib/members/data";

/**
 * Which of a member's posts are live — meaning a published version exists.
 *
 * WHY THIS IS NOT `post._status`. The members area reads posts with
 * `draft: true`, so a post shows the member's newest title and text and not
 * the stale published one (F1-T6). But with `draft: true` Payload reports the
 * *newest version's* status, and autosave writes a draft version on every
 * pause in typing. So the moment a published post has been autosaved it
 * reads `_status: "draft"` — measured against the dev server: published, one
 * draft write, and `?draft=true` says `draft` while the read without it says
 * `published` and the public page still serves 200. The list showed 「草稿」,
 * the dashboard counted a draft and no published post, and the editor opened
 * offering 發布 instead of 更新已發布內容 and hiding 取消發布 — for an article
 * anybody could read.
 *
 * Two different facts, so two different reads:
 * - live: does a published version exist? A read *without* `draft` is the
 *   collection's own table, which holds the last published state.
 * - unpublished changes: live, and the newest version is a draft.
 */

/** The subset of `ids` that are live. Empty in, empty out, with no query. */
export async function livePostIds(ids: number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const result = await memberFind("posts", {
    depth: 0,
    limit: ids.length,
    select: { _status: true },
    where: { and: [{ id: { in: ids } }, { _status: { equals: "published" } }] },
  });
  return new Set(result.docs.map((doc) => doc.id));
}

/** How many of the member's posts are live, for the dashboard's count. */
export async function livePostCount(): Promise<number> {
  const result = await memberFind("posts", {
    depth: 0,
    limit: 1,
    select: { _status: true },
    where: { _status: { equals: "published" } },
  });
  return result.totalDocs;
}
