/**
 * Live, and the newest version is a draft nobody has published yet.
 *
 * In its own file because the posts list is a Client Component and needs this;
 * `live-posts.ts` beside it reads the database and must not be imported there.
 * `live` comes from that file — never from the post's own `_status`, which is
 * the newest version's and reads "draft" for a live post after an autosave.
 */
export function hasUnpublishedChanges(
  live: boolean,
  latestStatus: string | null | undefined,
): boolean {
  return live && latestStatus !== "published";
}
