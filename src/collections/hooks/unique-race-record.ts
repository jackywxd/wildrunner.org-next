import type { CollectionBeforeValidateHook } from 'payload'
import { ValidationError } from 'payload'

/**
 * Reject a race a member has already logged.
 *
 * (owner, eventId, distanceId, year) is the natural key — running the same
 * race twice in one year is not a thing — but it cannot be a database UNIQUE
 * constraint the way `posts.slug` is, because `owner` is a relationship and
 * the composite spans four columns. So this is the only guard, and unlike
 * `uniquePostSlug` it is load-bearing rather than a nicer error message.
 *
 * A duplicate is an ordinary mis-click (submit twice, or forget you already
 * added it), not an exceptional case, so it gets a field-level message.
 *
 * OWNER RESOLUTION. `setOwner` stamps `data.owner` in beforeChange, which
 * runs *after* this hook — so on create `data.owner` is still undefined here
 * and scoping the lookup to it would silently match nothing, letting every
 * duplicate through. The owner is therefore derived the same way `setOwner`
 * derives it, and the two must stay in step.
 */
export const uniqueRaceRecord: CollectionBeforeValidateHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (!data) return data

  const eventId = data.eventId
  const distanceId = data.distanceId
  const year = data.year
  if (!eventId || !distanceId || typeof year !== 'number') return data

  // Mirrors setOwner: the creating user, unless an admin named someone else.
  const suppliedOwner = data.owner
  const ownerId =
    typeof suppliedOwner === 'object' && suppliedOwner !== null
      ? (suppliedOwner as { id: number }).id
      : (suppliedOwner ?? req.user?.id)

  // No owner to scope by (an unauthenticated write) — access control rejects
  // it before this matters.
  if (!ownerId) return data

  const existing = await req.payload.find({
    collection: 'race-records',
    where: {
      and: [
        { owner: { equals: ownerId } },
        { eventId: { equals: eventId } },
        { distanceId: { equals: distanceId } },
        { year: { equals: year } },
      ],
    },
    limit: 1,
    depth: 0,
    pagination: false,
    // Unscoped on purpose: the member must be told the record exists even
    // when their own access rules would hide it from a list.
    overrideAccess: true,
    req,
  })

  const clash = existing.docs[0]
  const currentId = (originalDoc as { id?: number } | undefined)?.id
  if (clash && clash.id !== currentId) {
    throw new ValidationError({
      errors: [{ path: 'eventId', message: '這場比賽的這個年份與距離已經登錄過了。' }],
      req,
    })
  }

  // `operation` is unused but kept in the signature for the next reader:
  // this guard deliberately applies to updates too, because an edit can
  // collide just as easily as a create.
  void operation

  return data
}
