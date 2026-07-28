import type { CollectionBeforeChangeHook } from 'payload'

import { isAdminUser } from '../../access'

/**
 * Stamp the creating user onto new documents.
 *
 * Runs on create only — ownership never changes implicitly, and an admin
 * reassigning it explicitly is left alone. Field-level access has already
 * stripped any `owner` a member tried to send by the time this runs
 * (beforeValidate precedes beforeChange).
 */
export const setOwner: CollectionBeforeChangeHook = ({ data, operation, req }) => {
  if (operation !== 'create') return data
  if (!req.user) return data
  if (isAdminUser(req.user) && data.owner) return data

  return { ...data, owner: req.user.id }
}
