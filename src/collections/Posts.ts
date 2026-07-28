import type { CollectionConfig } from 'payload'

import { isAuthenticated, isOwner, ownedOrPublished } from '../access'
import { ownerField } from '../fields/owner'
import { setOwner } from './hooks/owner'
import { revalidatePosts } from './hooks/revalidate'

export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', '_status', 'publishedAt', 'updatedAt'],
  },
  hooks: {
    beforeChange: [setOwner],
    afterChange: [revalidatePosts],
  },
  versions: {
    drafts: true,
  },
  access: {
    read: ownedOrPublished,
    create: isAuthenticated,
    update: isOwner,
    delete: isOwner,
  },
  fields: [
    ownerField,
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        description: 'Public path segment, e.g. 2024/utmb → /posts/2024/utmb',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      required: true,
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'authors',
    },
    {
      name: 'featured',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'publishedAt',
      type: 'date',
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
        position: 'sidebar',
      },
    },
    {
      name: 'aiAssist',
      type: 'ui',
      admin: {
        components: {
          Field: '@/components/admin/AIAssistField#AIAssistField',
        },
      },
    },
    {
      name: 'content',
      type: 'richText',
      required: true,
    },
  ],
}
