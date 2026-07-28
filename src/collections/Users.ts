import type { CollectionConfig } from 'payload'

import { isAdmin, isAdminFieldLevel, isAdminOrSelf, isAdminUser } from '../access'
import { ensureFirstUserIsAdmin } from './hooks/first-user-admin'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'role', 'updatedAt'],
    // Members still reach /admin/account for their own profile; this only
    // drops the collection from the sidebar. Access control is the gate.
    hidden: ({ user }) => !isAdminUser(user),
  },
  auth: true,
  access: {
    read: isAdminOrSelf,
    create: async ({ req }) => {
      if (isAdminUser(req.user)) return true
      // A logged-in member must not be able to mint further accounts.
      if (req.user) return false

      // Bootstrap: the very first user of an empty install.
      const existing = await req.payload.find({
        collection: 'users',
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      return existing.totalDocs === 0
    },
    update: isAdminOrSelf,
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [ensureFirstUserIsAdmin],
  },
  fields: [
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'member',
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Member', value: 'member' },
      ],
      saveToJWT: true,
      access: {
        create: isAdminFieldLevel,
        update: isAdminFieldLevel,
      },
      admin: {
        position: 'sidebar',
        description: 'Admins manage everything; members only their own content.',
      },
    },
  ],
  versions: false,
}
