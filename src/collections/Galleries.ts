import type { CollectionConfig } from 'payload'

import { isAuthenticated, isOwner, ownedOrPublished } from '../access'
import { ownerField } from '../fields/owner'
import { setOwner } from './hooks/owner'
import { revalidateGalleries } from './hooks/revalidate'

export const Galleries: CollectionConfig = {
  slug: 'galleries',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', '_status', 'updatedAt'],
  },
  hooks: {
    beforeChange: [setOwner],
    afterChange: [revalidateGalleries],
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
      name: 'location',
      type: 'text',
    },
    {
      name: 'featured',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'eventDate',
      type: 'date',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'cover',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'images',
      type: 'array',
      labels: {
        singular: 'Image',
        plural: 'Images',
      },
      fields: [
        {
          name: 'media',
          type: 'upload',
          relationTo: 'media',
          required: true,
        },
        {
          name: 'featured',
          type: 'checkbox',
          defaultValue: false,
        },
      ],
    },
    {
      name: 'videos',
      type: 'array',
      labels: {
        singular: 'Video',
        plural: 'Videos',
      },
      fields: [
        {
          name: 'media',
          type: 'upload',
          relationTo: 'media',
          required: true,
        },
        {
          name: 'videoId',
          type: 'text',
          admin: {
            description: 'Stable public id for /gallery/[slug]/v/[videoId]',
          },
        },
      ],
    },
  ],
}
