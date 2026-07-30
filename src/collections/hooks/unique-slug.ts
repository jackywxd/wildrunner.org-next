import type { CollectionBeforeValidateHook } from 'payload'
import { ValidationError } from 'payload'

/**
 * Turn a slug collision into a field-level error.
 *
 * `slug` is `unique: true`, but that constraint is only enforced by the
 * database — the write reaches SQLite, the UNIQUE index rejects it, and the
 * driver error surfaces as a bare 500 "Something went wrong." with nothing
 * naming the field. Members pick their own slugs and the namespace is
 * global, so collisions are ordinary rather than exceptional, and a 500 is
 * both unhelpful and indistinguishable from a real fault.
 *
 * Checking here does not make the constraint redundant: two simultaneous
 * writes can still both pass this and let the index settle it. This is
 * about the message the author sees in the normal case, not about
 * correctness.
 */
export const uniquePostSlug: CollectionBeforeValidateHook = async ({
  data,
  originalDoc,
  req,
}) => {
  const slug = (data as { slug?: unknown } | undefined)?.slug
  if (typeof slug !== 'string' || slug === '') return data

  // An update that isn't changing the slug has nothing to collide with.
  const currentSlug = (originalDoc as { slug?: string } | undefined)?.slug
  if (currentSlug === slug) return data

  const existing = await req.payload.find({
    collection: 'posts',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    pagination: false,
    // Deliberately unscoped: the collision is global, and a member must be
    // told their slug is taken even when the post holding it belongs to
    // someone else and is invisible to them.
    overrideAccess: true,
    req,
  })

  const clash = existing.docs[0]
  if (clash && clash.id !== (originalDoc as { id?: number } | undefined)?.id) {
    throw new ValidationError({
      errors: [{ path: 'slug', message: `網址代稱「${slug}」已被使用，請換一個。` }],
      req,
    })
  }

  return data
}
