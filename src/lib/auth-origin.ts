/**
 * Telling Payload that a page render came from us.
 *
 * `payload.auth()` resolves the session through `extractJWT`
 * (`node_modules/payload/dist/auth/extractJWT.js`), which gates the cookie on
 * where the request came from:
 *
 *   Origin present            → accepted only if `config.csrf` includes it
 *   Origin absent, csrf empty → accepted
 *   Origin absent, csrf set   → accepted only for Sec-Fetch-Site
 *                               same-origin / same-site / none
 *
 * `config.csrf` is **not** empty here and cannot be made empty: sanitize.js
 * pushes `serverURL` into it whenever `serverURL !== ''`, and this project
 * must set `serverURL` for Payload to recognise externally-hosted media URLs
 * (see payload.config.ts). So every page render lands in the third row.
 *
 * And a page render is exactly the request with no `Origin`: browsers send
 * one on `fetch`, not on ordinary top-level navigations. So whether a signed-
 * in member is seen as signed in comes down to one header they do not
 * control — while the *same* session resolves perfectly through any
 * client-side fetch, which sends `Origin`.
 *
 * That asymmetry is what a member reported: editing a post, leaving the tab,
 * refreshing, and landing on `/members/login` — where the login page's own
 * `/api/users/me` fetch found the session alive and bounced them to
 * `/members`, losing the article they had open. The login page already
 * carries a comment about the same gate biting a cross-site navigation; this
 * is the same gate, reached the other way.
 *
 * **Only when it is missing.** A request that carries a real `Origin` keeps
 * it and is still checked against the allowlist — overwriting one would
 * disable that check for genuine cross-site requests. This only fills in the
 * blank on a navigation, and only for reading who is signed in: Payload's
 * REST API builds its own request, so every mutation is gated exactly as
 * before.
 */
export function withOwnOrigin(incoming: Headers, serverURL: string): Headers {
  const headers = new Headers(incoming);
  if (serverURL && !headers.get("Origin")) headers.set("Origin", serverURL);
  return headers;
}
