/**
 * The query flag that turns a refused race-record delete into a real one.
 *
 * `DELETE /api/race-records/:id` is refused with a 409 while any article
 * cites the record, because deleting it clears the badge from those articles
 * — including published ones. Repeating the request with this flag is the
 * member's confirmation, and `refuseRaceRecordInUse` (the collection's
 * `beforeDelete` hook) reads it and does the unlinking.
 *
 * It lives here rather than beside the hook because `RaceRecordManager` is a
 * Client Component: importing the hook to reach one string would pull
 * `payload` and `@payloadcms/db-d1-sqlite` into the browser bundle. One
 * dependency-free module is what keeps the two ends of an HTTP contract from
 * drifting without doing that.
 */
export const UNLINK_FLAG = 'unlinkArticles'
