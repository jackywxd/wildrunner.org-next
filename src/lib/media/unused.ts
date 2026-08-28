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
 * Two sources, and the second is easy to miss. A photo carrying
 * `raceEdition` appears on that race's public wall even though no row
 * anywhere points at it: the album is a *query* over the tag rather than a
 * stored gallery, which src/lib/race-gallery.ts explains at length and
 * chose deliberately. Judged by references alone, every race photo on the
 * site is unreferenced.
 */
export function isInUse(doc: Pick<Media, 'id' | 'raceEdition'>, referenced: ReadonlySet<number>): boolean {
  if (referenced.has(doc.id)) return true
  return doc.raceEdition !== null && doc.raceEdition !== undefined
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
  doc: Pick<Media, 'id' | 'createdAt' | 'raceEdition' | 'unusedSince'>
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
