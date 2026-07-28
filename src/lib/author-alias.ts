import type { Payload, PayloadRequest } from 'payload'

/**
 * Author identity for a user account.
 *
 * The alias shown on the site lives on the `authors` record, not on the
 * user — posts already reference authors, so the public site needs no
 * changes. `authors.slug` is an ASCII handle derived from the email
 * (matching the migrated content, e.g. name "追雲逐雪" / slug "jackywxd")
 * and never follows later renames, so links cannot break.
 */

export function aliasSlugBase(email: string): string {
  const local = email.split('@')[0] ?? ''
  const slug = local
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  // Non-ASCII local parts collapse to nothing; the numeric suffix added by
  // uniqueAuthorSlug then keeps them distinct.
  return slug || 'author'
}

async function uniqueAuthorSlug(
  payload: Payload,
  base: string,
  req?: PayloadRequest,
): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`
    const existing = await payload.find({
      collection: 'authors',
      where: { slug: { equals: candidate } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })
    if (existing.totalDocs === 0) return candidate
  }

  return `${base}-${Date.now()}`
}

type EnsureArgs = {
  payload: Payload
  req?: PayloadRequest
  user: {
    id: number
    email: string
    displayName?: string | null
    author?: number | { id: number } | null
  }
}

const relationId = (value: number | { id: number } | null | undefined) =>
  typeof value === 'object' && value !== null ? value.id : value

/** Idempotent: safe to call on every account, however it was created. */
export async function ensureAuthorForUser({
  payload,
  req,
  user,
}: EnsureArgs): Promise<number | null> {
  const linked = relationId(user.author)
  if (linked) return linked

  // Content migrated before members existed was re-owned to the first admin
  // by the M1 backfill, so that admin already has an author record — reuse
  // it instead of creating a duplicate byline.
  const owned = await payload.find({
    collection: 'authors',
    where: { owner: { equals: user.id } },
    sort: 'id',
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })

  let authorId = owned.docs[0]?.id as number | undefined

  if (!authorId) {
    const base = aliasSlugBase(user.email)
    const created = await payload.create({
      collection: 'authors',
      data: {
        name: user.displayName?.trim() || base,
        slug: await uniqueAuthorSlug(payload, base, req),
        owner: user.id,
      },
      overrideAccess: true,
      req,
    })
    authorId = created.id
  }

  await payload.update({
    collection: 'users',
    id: user.id,
    data: { author: authorId },
    overrideAccess: true,
    req,
  })

  return authorId
}
