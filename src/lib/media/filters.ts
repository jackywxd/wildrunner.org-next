/**
 * The filter vocabulary both media libraries speak.
 *
 * A type module rather than a home for the filtering itself, because the
 * filtering cannot be shared and pretending otherwise would break one of the
 * two callers quietly. /gallery's wall is a union of album membership and
 * `media.usage`, reduced in memory (`arrangeMedia`); /members/media is a
 * `/api/media` query whose narrowing happens in SQL under the collection's own
 * access rules. Same words, two mechanisms — and each is the only correct one
 * for its side, for reasons gallery-index.ts's header spells out at length.
 *
 * What is worth having in one place is the words, so a chip labelled 影片 in
 * one library cannot come to mean something else in the other.
 */

export type MediaKindFilter = "all" | "photo" | "video";

/**
 * `media.usage`, plus `all`. The three values match the collection's own
 * select options — see src/collections/Media.ts, where each is explained; a
 * fourth added there and not here is a filter that silently hides rows.
 */
export type MediaUsageFilter = "all" | "gallery" | "private" | "attachment";
