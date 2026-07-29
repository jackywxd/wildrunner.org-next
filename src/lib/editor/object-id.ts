/**
 * A 24-character hex string shaped like a MongoDB ObjectID, matching what
 * Payload's own node classes stamp onto `upload` and `link` nodes (they use
 * `bson-objectid`; see UploadNode.js / LinkNode.js in
 * @payloadcms/richtext-lexical). Nothing here reads it as a real ObjectID —
 * Payload's Lexical field just needs `id` to look like one, since importJSON
 * mints one the same way when an older serialized node lacks it (the
 * version:2 -> 3 migration in both node classes).
 *
 * Deliberately not a dependency on `bson-objectid` itself: the shape is all
 * that's needed, and generating it is one call to the platform's own CSPRNG.
 */
export function newObjectIdHex(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}
