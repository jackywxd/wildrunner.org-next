import type { CollectionConfig } from 'payload'

import { isAuthenticated, isOwner, ownedOnly } from '../access'
import { ownerField } from '../fields/owner'
import { setOwner } from './hooks/owner'
import { revalidateGalleries } from './hooks/revalidate'

export const Galleries: CollectionConfig = {
  slug: 'galleries',
  labels: {
    singular: { en: 'Gallery', 'zh-TW': '相簿' },
    plural: { en: 'Galleries', 'zh-TW': '相簿' },
  },
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
    read: ownedOnly,
    create: isAuthenticated,
    update: isOwner,
    delete: isOwner,
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
      name: 'location',
      type: 'text',
      label: { en: 'Location', 'zh-TW': '地點' },
    },
    {
      name: 'featured',
      type: 'checkbox',
      label: { en: 'Featured', 'zh-TW': '精選' },
      defaultValue: false,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'eventDate',
      type: 'date',
      label: { en: 'Event Date', 'zh-TW': '活動日期' },
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'cover',
      type: 'upload',
      relationTo: 'media',
      label: { en: 'Cover Image', 'zh-TW': '封面圖片' },
    },
    {
      name: 'images',
      type: 'array',
      label: { en: 'Images', 'zh-TW': '圖片' },
      labels: {
        singular: { en: 'Image', 'zh-TW': '圖片' },
        plural: { en: 'Images', 'zh-TW': '圖片' },
      },
      fields: [
        {
          name: 'media',
          type: 'upload',
          relationTo: 'media',
          label: { en: 'Media', 'zh-TW': '媒體' },
          required: true,
        },
        {
          name: 'featured',
          type: 'checkbox',
          label: { en: 'Featured', 'zh-TW': '精選' },
          defaultValue: false,
        },
      ],
    },
    {
      name: 'videos',
      type: 'array',
      label: { en: 'Videos', 'zh-TW': '影片' },
      labels: {
        singular: { en: 'Video', 'zh-TW': '影片' },
        plural: { en: 'Videos', 'zh-TW': '影片' },
      },
      fields: [
        {
          name: 'media',
          type: 'upload',
          relationTo: 'media',
          label: { en: 'Media', 'zh-TW': '媒體' },
          required: true,
        },
        {
          name: 'videoId',
          type: 'text',
          label: { en: 'Video ID', 'zh-TW': '影片代碼' },
          admin: {
            description: 'Stable public id for /gallery/[slug]/v/[videoId]',
          },
        },
      ],
    },
  ],
}
