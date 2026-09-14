import type { CollectionBeforeChangeHook } from 'payload'

/**
 * Two dates that answer two different questions: when this article first
 * appeared, and when it was last changed after that.
 *
 * `publishedAt` USED TO MOVE. The member editor stamped `new Date()` into
 * every publish request (`src/lib/members/posts.ts`), so fixing a typo in a
 * year-old article re-dated it to today and floated it back to the top of
 * `/posts` — the one place a reader looks to find what is new. That stamp is
 * gone; `publishedAt` is now written once, here, and never again.
 *
 * WHY THE SERVER AND NOT THE CLIENT. The editor is one of several ways a post
 * gets published — `/admin` is another, and the API a third — and a date that
 * only one of them sets is a date that is right only some of the time. It is
 * also a value a member must not be able to choose by editing a request body.
 *
 * WHAT COUNTS AS AN UPDATE, and this is a product decision rather than a
 * technical one: re-publishing does, and nothing else. An autosave while
 * drafting is not a revision of the published article — the public page has
 * not changed — so a member can leave a half-written edit open for a week
 * without the live article claiming it was touched. Payload's own `updatedAt`
 * moves on every draft write, which is exactly why it cannot be used for this.
 */

/**
 * Whether a date field holds a real value.
 *
 * `unknown` in and both shapes tested, because a Payload date arrives as an
 * ISO string almost everywhere and as a `Date` from a caller that passed one.
 * An empty string is what an admin clearing the sidebar field leaves behind
 * and it means "no date", not "the epoch".
 */
function isStamped(value: unknown): boolean {
  if (value instanceof Date) return true
  return typeof value === 'string' && value.trim() !== ''
}

/**
 * The dates to write, given what is being saved and what is already stored.
 *
 * Pure, and separate from the hook for that reason: the branch that matters
 * is "has this ever been published", which is a question about two values and
 * nothing else. `U-PUBDATE` covers it without a database.
 *
 * An empty object means write neither — returned for every draft save, and
 * for a first publish that already carries its own date (an imported MDX
 * whose frontmatter names the day it was written; the member is republishing
 * an old piece, not authoring it today).
 */
export function publishStamp(args: {
  now: string
  /** `data.publishedAt` — what this request is asking to store, if anything. */
  publishedAt: unknown
  /** `data._status`. */
  status: unknown
  /** `originalDoc.publishedAt` — what is already stored. */
  storedPublishedAt: unknown
}): { publishedAt?: string; revisedAt?: string } {
  if (args.status !== 'published') return {}

  /**
   * `publishedAt` is the marker of "has been on the public site", not
   * `_status`, and that distinction is the whole reason this works.
   * `originalDoc` comes from `getLatestCollectionVersion`, so for a published
   * article that somebody is part-way through editing it is the *draft*
   * version — `_status: 'draft'` on an article the public can read right now.
   * A draft version is a full copy of the document, so it carries the stored
   * `publishedAt` forward, which `_status` cannot do.
   */
  if (isStamped(args.storedPublishedAt)) return { revisedAt: args.now }

  return isStamped(args.publishedAt) ? {} : { publishedAt: args.now }
}

/**
 * `data` here is the incoming patch, not the merged document (Payload merges
 * it over `originalDoc` later, in the field-level `beforeChange` —
 * `payload/dist/collections/operations/utilities/update.js`). So leaving
 * `publishedAt` out of the returned object is what keeps the stored value:
 * an absent key changes nothing, while `publishedAt: originalDoc.publishedAt`
 * would be a rewrite that happens to land on the same string. It also means
 * an admin who edits the date in the sidebar while publishing keeps their
 * value — it is in `data`, and nothing here touches it.
 */
export const stampPublishDates: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const stamp = publishStamp({
    now: new Date().toISOString(),
    publishedAt: data.publishedAt,
    status: data._status,
    storedPublishedAt: originalDoc?.publishedAt,
  })

  return Object.keys(stamp).length === 0 ? data : { ...data, ...stamp }
}
