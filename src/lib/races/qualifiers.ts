/**
 * Which lottery a race entry qualifies you for, and which entry it was.
 *
 * WESTERN STATES AND HARDROCK EACH PUBLISH A LIST OF ENTRIES, NOT EVENTS.
 * At Mont-Blanc the UTMB and the CCC are on the Western States list and the
 * OCC is not; Zugspitz's 107K is on it explicitly *un*-qualified. So the
 * flags live on `race-categories` and the answer this module gives is a
 * list of category labels — never a bare boolean. A schedule row covering
 * 20K through 100M would otherwise carry a badge claiming the 20K counts
 * toward a 100-mile lottery, which is the exact fabrication
 * `RaceEntryRow.tsx` refuses to make about distances.
 *
 * PURE, AND DELIBERATELY NOT IMPORTING PAYLOAD. Same split as
 * `catalogue-shape.ts` against `catalogue-db.ts`: this takes the minimal
 * shape it actually reads, so a unit spec can exercise it without booting
 * a database and a client component can import the labels without dragging
 * in `@payload-config`.
 */

export const RACE_QUALIFIERS = ['wser', 'hardrock'] as const

export type RaceQualifier = (typeof RACE_QUALIFIERS)[number]

/** Used by both the filter chip and the row tag, so they cannot drift apart. */
export const RACE_QUALIFIER_LABELS_ZH: Record<RaceQualifier, string> = {
  hardrock: 'Hardrock 資格賽',
  wser: '西部100 資格賽',
}

/**
 * The subset of a `race-categories` row this needs.
 *
 * `null` as well as `undefined` because that is what Payload hands back for
 * an unset checkbox, and `Boolean(null)` and `Boolean(undefined)` differ
 * from `null === false` in exactly the way that would silently drop every
 * flag on a database that has never been imported into.
 */
export type QualifiableCategory = {
  label: string
  qualifiesWser?: boolean | null
  qualifiesHardrock?: boolean | null
}

/** Category labels per lottery, or `undefined` when none qualify. */
export type RaceQualifiers = Partial<Record<RaceQualifier, string[]>>

export function qualifiersFor(
  categories: QualifiableCategory[] | undefined,
): RaceQualifiers | undefined {
  if (!categories || categories.length === 0) return undefined

  const wser = categories.filter((c) => c.qualifiesWser).map((c) => c.label)
  const hardrock = categories.filter((c) => c.qualifiesHardrock).map((c) => c.label)

  // `undefined` rather than `{}` so the field is absent from the entry
  // altogether, matching the `orUndefined` convention in content.ts — and
  // so `entry.qualifiers` is falsy for the common case of a race on
  // neither list.
  if (wser.length === 0 && hardrock.length === 0) return undefined

  return {
    ...(wser.length > 0 ? { wser } : {}),
    ...(hardrock.length > 0 ? { hardrock } : {}),
  }
}

/** Whether a schedule entry has at least one entry on the given list. */
export function hasQualifier(
  entry: { qualifiers?: RaceQualifiers },
  qualifier: RaceQualifier,
): boolean {
  return (entry.qualifiers?.[qualifier]?.length ?? 0) > 0
}
