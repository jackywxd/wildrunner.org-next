import type { CollectionConfig } from 'payload'

import { isAdmin, isAuthenticated, isOwner } from '../access'
import { ownerField } from '../fields/owner'
import { setOwner } from './hooks/owner'

export const Authors: CollectionConfig = {
  slug: 'authors',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'updatedAt'],
  },
  access: {
    // Public: author names are rendered as bylines.
    read: () => true,
    create: isAuthenticated,
    update: isOwner,
    // Deleting an author would orphan every byline pointing at it.
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [setOwner],
  },
  fields: [
    ownerField,
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'bio',
      type: 'textarea',
    },
    {
      name: 'avatar',
      type: 'upload',
      relationTo: 'media',
    },
  ],
}
