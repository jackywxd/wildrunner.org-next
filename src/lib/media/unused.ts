/**
 * What the weekly sweep should do with one media row.
 *
 * Pure, and separate from the endpoint that drives it, for the reason
 * AGENTS.md gives about probes: this decides whether a file is destroyed, so
 * it has to be testable without a database, a Worker, or R2. Everything that
 * varies — the clock, the reference set — is a parameter.
 *
 * The policy is two-stage. A run that finds a file unused does not delete
 * it; it records the date on `media.unusedSince` and the caller mails the
 * owner. Only a later run, once GRACE_MS has passed, removes it. That is
 * what turns a wrong answer here from silent data loss into a warning
 * somebody can act on, and it is the shape AGENTS.md asks for when it says
 * destructive work is proposed rather than performed.
 *
 * "Unused for over a year" is measured from `createdAt`, because nothing in
 * the schema records when a file was last *used*. There is no such column
 * and no event that would write one — a file is used by being referenced,
 * and a reference is a fact about some other document, not an action anybody
 * takes on the media row. So the question this answers is the one the data
 * can actually support: "uploaded over a year ago, and referenced by
 * nothing today".
 *
 * WHAT THIS SWEEP CAN STILL COLLECT, since `media.usage` arrived: article
 * attachments, and only those. A member's own library file is never
 * collectable — public or private, they uploaded it deliberately and it is
 * billed against their quota — so the sweep's whole remaining subject is an
 * image pasted into an article and later removed from it, plus a cover
 * chosen and then replaced. That is a real shrink, and it is the correct
 * consequence of the model rather than an accident of it: uploading to the
 * library *is* publishing now, and this file used to describe its subject as
 * files "uploaded to the library and never placed anywhere", a category that
 * no longer exists.
 *
 * Note that versions still count as references (see ./references.ts), so an
 * attachment removed from an article today is held by every `_posts_v` row
 * saved before the removal, and only becomes collectable once those age out.
 */
import type { Media } from '@/payload-types'

/** A file must be this old before it can be marked at all, measured from `createdAt`. */
export const MIN_AGE_MS = 365 * 24 * 60 * 60 * 1000

/**
 * How long a marked file waits before deletion.
 *
 * Four weeks, so a marked file is seen by four sweeps and its owner has at
 * least four chances to notice the mail. Not configurable: a grace period
 * read from the environment is a grace period that can be set to zero by
 * someone who has not read this file.
 */
export const GRACE_MS = 28 * 24 * 60 * 60 * 1000

export type MediaDecision =
  /** Referenced by something, or too new. Nothing to do, and any existing mark is stale. */
  | { action: 'keep'; clearMark: boolean }
  /** Unreferenced and over a year old, seen this way for the first time. */
  | { action: 'mark' }
  /** Already marked, grace period still running. */
  | { action: 'wait'; deleteAfter: Date }
  /** Marked, unreferenced throughout, grace period elapsed. */
  | { action: 'delete'; markedAt: Date }

/**
 * Whether anything at all makes this file "in use".
 *
 * Two sources, and the second is easy to miss: most of the media on this site
 * is not pointed at by any row. A photo on the public wall gets there because
 * `usage` says so and a *query* finds it — the same shape src/lib/race-gallery.ts
 * chose for race albums. Judged by references alone, every photo on /gallery
 * looks unreferenced and every one of them would be deleted.
 *
 * So the test is inverted: only an `attachment` can be collected, and only
 * when nothing refers to it. `gallery` and `private` are both a member's own
 * library and are kept either way — the switch between them is about who can
 * see the file, never about whether it survives.
 *
 * `=== 'attachment'` rather than a check for "not gallery": a row whose
 * `usage` is NULL has not been classified yet (the column is nullable and the
 * backfill is a separate, human-run step), and an unclassified row must be
 * kept. Unprovable is not the same as false — the same reasoning `decide`
 * applies to an unparseable `createdAt` below.
 */
export function isInUse(doc: Pick<Media, 'id' | 'usage'>, referenced: ReadonlySet<number>): boolean {
  if (referenced.has(doc.id)) return true
  return doc.usage !== 'attachment'
}

/**
 * Parse a stored timestamp, or null when it is absent or unusable.
 *
 * Null on garbage rather than `new Date(NaN)`: an invalid date compares
 * false against everything, so a corrupt `unusedSince` would make a file
 * neither waiting nor deletable and it would sit marked forever. Returning
 * null instead sends it back through `mark`, which rewrites the field with
 * a value that parses.
 */
function parseDate(value: unknown): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Decide what happens to one media row.
 *
 * `now` is a parameter rather than `new Date()` inside, matching the
 * convention `src/lib/races/calendar.ts` sets and for the same reason: a
 * function that reads the clock itself cannot be tested at the boundary,
 * and every interesting case here is a boundary.
 */
export function decide({
  doc,
  now,
  referenced,
}: {
  doc: Pick<Media, 'id' | 'createdAt' | 'usage' | 'unusedSince'>
  now: Date
  referenced: ReadonlySet<number>
}): MediaDecision {
  if (isInUse(doc, referenced)) {
    // `clearMark` rather than an unconditional write: a marked file that has
    // been used again must lose its mark, but rewriting NULL over NULL for
    // every healthy file would be one update per media row per week.
    return { action: 'keep', clearMark: Boolean(doc.unusedSince) }
  }

  const created = parseDate(doc.createdAt)
  // An unparseable createdAt means the row cannot be shown to be a year
  // old, and unprovable is not the same as false. Keeping it costs storage;
  // deleting it on a guess costs the file.
  if (!created || now.getTime() - created.getTime() < MIN_AGE_MS) {
    return { action: 'keep', clearMark: Boolean(doc.unusedSince) }
  }

  const markedAt = parseDate(doc.unusedSince)
  if (!markedAt) return { action: 'mark' }

  const deleteAfter = new Date(markedAt.getTime() + GRACE_MS)
  if (now < deleteAfter) return { action: 'wait', deleteAfter }

  return { action: 'delete', markedAt }
}
