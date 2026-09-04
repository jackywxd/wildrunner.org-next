import type { Access, FieldAccess, Where } from 'payload'

import type { User } from '@/payload-types'

/**
 * Shared access-control helpers.
 *
 * Payload enforces access at three independent layers — collection,
 * field, and global. A rule missing from any one of them is a hole, so
 * every restriction below has a matching negative test in
 * `e2e/members/roles.spec.ts`.
 */

export const isAdminUser = (user: unknown): boolean =>
  Boolean(user && (user as User).role === 'admin')

export const isAdmin: Access = ({ req: { user } }) => isAdminUser(user)

export const isAdminFieldLevel: FieldAccess = ({ req: { user } }) => isAdminUser(user)

export const isAuthenticated: Access = ({ req: { user } }) => Boolean(user)

/**
 * Admins reach every document; everyone else is constrained to their own.
 * Returning a query (rather than false) keeps list views working — the
 * member simply sees a single row.
 */
export const isAdminOrSelf: Access = ({ req: { user } }) => {
  if (!user) return false
  if (isAdminUser(user)) return true

  return {
    id: {
      equals: user.id,
    },
  }
}

/**
 * Read rule for draft-enabled content (posts, galleries).
 *
 * A member sees only their own work in the admin — not other members'
 * published content. The public site is unaffected: it queries through the
 * Local API, which defaults to `overrideAccess: true`, and enforces
 * visibility with an explicit `where: { _status: 'published' }` instead.
 * So a member's published post is still public; it just doesn't clutter
 * (or leak through) anyone else's admin list.
 */
export const ownedOnly: Access = ({ req: { user } }) => {
  if (isAdminUser(user)) return true

  // No session: the REST API is the only caller that lands here, and it
  // should still expose published content.
  if (!user) return { _status: { equals: 'published' } } as Where

  return { owner: { equals: user.id } } as Where
}

/**
 * Read rule for collections without a draft status (media, authors).
 *
 * Same shape as `ownedOnly` minus the published fallback — anonymous
 * readers keep full read access because these are the records the public
 * site resolves images and bylines from.
 */
export const ownedOnlyPublicRead: Access = ({ req: { user } }) => {
  if (isAdminUser(user)) return true
  if (!user) return true

  return { owner: { equals: user.id } }
}

/**
 * Read rule for `media` specifically: `ownedOnlyPublicRead`, minus the files a
 * member asked not to publish.
 *
 * Split out from `ownedOnlyPublicRead` rather than changing it, because that
 * helper is also `authors`' read rule and `authors` has no `usage` column.
 *
 * Only the anonymous branch differs, and it is there because the media library
 * now offers a member a checkbox that says the file will not be shown. Without
 * this, `usage` was purely a rendering filter: every query in
 * src/lib/content.ts narrows what the site *draws*, and nothing narrowed what
 * the REST API *serves*, so an unauthenticated
 * `GET /api/media?where[usage][equals]=private` returned those rows in full,
 * `url` and `filename` included. Reproduced before this was written.
 *
 * `not_equals` also excludes a NULL `usage`, which is deliberate: unclassified
 * is not a claim that something is publishable, and the field default plus
 * `20260830_090000_add_media_usage` mean no such row should exist anyway.
 *
 * THIS DOES NOT MAKE A FILE PRIVATE, and the member-facing copy is worded for
 * what it does do. R2 is served from a public origin with no signing
 * (`R2_PUBLIC_URL`, and `r2Storage` sets no `generateFileURL`), so anyone
 * holding the object URL can still fetch the bytes. Closing that means serving
 * these files through an authenticated route instead, which is a separate
 * piece of work.
 *
 * The public site is unaffected: its pages read through the Local API, whose
 * `overrideAccess` defaults to `true`
 * (node_modules/payload/dist/collections/operations/local/find.js), so this
 * rule is not consulted for anything the site renders.
 *
 * TWO DIFFERENT QUESTIONS REACH THIS RULE, and answering them the same way
 * breaks the site. `isReadingStaticFile` is how Payload tells them apart.
 *
 *   listing   `GET /api/media`, and GraphQL. Anonymous gets exactly what the
 *             public photo wall shows, because nothing else needs it: no page
 *             under src/app/[lang]/(site)/(public) fetches /api/media from the
 *             browser (only the admin's LargeUploadPanel does). `not_equals
 *             private` was too wide — with the backfill done, production holds
 *             zero `private` rows, so it returned all 568, including the 138
 *             article attachments and with them the cover images of 9 posts
 *             that are still drafts. Their `url` and `filename` were
 *             enumerable before the article was ever published.
 *
 *   the bytes `/api/media/file/<name>`. `checkFileAccess` ANDs whatever Where
 *             this returns with the filename and throws `Forbidden` when
 *             nothing matches (node_modules/payload/dist/uploads/
 *             checkFileAccess.js). Narrowing to `gallery` here would 403 every
 *             article image wherever Payload serves the file itself — dev, and
 *             any origin without `R2_PUBLIC_URL`, which is where the whole e2e
 *             suite runs. It would also buy nothing: production serves those
 *             bytes from a public, unsigned R2 origin, so anyone holding the
 *             URL already has them, exactly as the paragraph above says.
 *
 * So the narrow answer goes to the question that is actually about disclosure,
 * and the wide one to the question that is only about a redirect target.
 */
export const mediaPublicRead: Access = ({ isReadingStaticFile, req: { user } }) => {
  if (isAdminUser(user)) return true
  if (!user) {
    return isReadingStaticFile
      ? ({ usage: { not_equals: 'private' } } as Where)
      : ({ usage: { equals: 'gallery' } } as Where)
  }

  return { owner: { equals: user.id } } as Where
}

/** Write rule: admins anywhere, members only on documents they own. */
export const isOwner: Access = ({ req: { user } }) => {
  if (!user) return false
  if (isAdminUser(user)) return true

  return {
    owner: {
      equals: user.id,
    },
  }
}
