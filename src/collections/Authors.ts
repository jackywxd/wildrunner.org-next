import type { CollectionConfig } from 'payload'

import { isAdmin, isAuthenticated, isOwner, ownedOnlyPublicRead } from '../access'
import { ownerField } from '../fields/owner'
import { setOwner } from './hooks/owner'

export const Authors: CollectionConfig = {
  slug: 'authors',
  labels: {
    singular: { en: 'Author', 'zh-TW': '作者' },
    plural: { en: 'Authors', 'zh-TW': '作者' },
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'updatedAt'],
  },
  access: {
    // Anonymous keeps full read (bylines are public); a signed-in member
    // sees only their own record, which doubles as their alias screen.
    read: ownedOnlyPublicRead,
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
      label: { en: 'Name', 'zh-TW': '名稱' },
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      label: { en: 'Slug', 'zh-TW': '網址代稱' },
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'bio',
      type: 'textarea',
      label: { en: 'Bio', 'zh-TW': '簡介' },
    },
    {
      name: 'avatar',
      type: 'upload',
      relationTo: 'media',
      label: { en: 'Avatar', 'zh-TW': '頭像' },
    },
  ],
}
