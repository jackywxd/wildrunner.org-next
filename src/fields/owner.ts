import type { Field } from 'payload'

import { isAdminFieldLevel } from '../access'

/**
 * Ownership marker used by the `isOwner` / `ownedOnly` access rules.
 *
 * Field access blocks members from writing it (Payload strips the value in
 * beforeValidate), and `setOwner` then fills in the real owner during
 * beforeChange — so a forged `owner` in the request body cannot survive
 * either way.
 */
export const ownerField: Field = {
  name: 'owner',
  type: 'relationship',
  relationTo: 'users',
  index: true,
  access: {
    create: isAdminFieldLevel,
    update: isAdminFieldLevel,
  },
  admin: {
    position: 'sidebar',
    description: 'Whoever created this. Only admins can reassign it.',
  },
}
