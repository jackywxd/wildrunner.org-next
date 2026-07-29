import type { CollectionConfig } from 'payload'

import { isAdminFieldLevel, isAuthenticated, isOwner, ownedOnly } from '../access'
import { ownerField } from '../fields/owner'
import { setOwner } from './hooks/owner'
import { revalidatePosts } from './hooks/revalidate'

export const Posts: CollectionConfig = {
  slug: 'posts',
  labels: {
    singular: { en: 'Post', 'zh-TW': '文章' },
    plural: { en: 'Posts', 'zh-TW': '文章' },
  },
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
    read: ownedOnly,
    create: isAuthenticated,
    update: isOwner,
    delete: isOwner,
  },
  fields: [
    ownerField,
    {
      name: 'title',
      type: 'text',
      label: { en: 'Title', 'zh-TW': '標題' },
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      label: { en: 'Slug', 'zh-TW': '網址代稱' },
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
      label: { en: 'Description', 'zh-TW': '描述' },
      required: true,
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      label: { en: 'Cover Image', 'zh-TW': '封面圖片' },
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'authors',
      label: { en: 'Author', 'zh-TW': '作者' },
      // Field access strips a forged author, and the fallback then applies:
      // defaultValue on create, the existing value on update. So a member
      // always publishes under their own byline and cannot move a post to
      // someone else's.
      access: {
        create: isAdminFieldLevel,
        update: isAdminFieldLevel,
      },
      defaultValue: ({ user }) => {
        const author = (user as { author?: number | { id: number } } | null)?.author
        return typeof author === 'object' && author !== null ? author.id : author
      },
    },
    {
      name: 'featured',
      type: 'checkbox',
      label: { en: 'Featured', 'zh-TW': '精選' },
      defaultValue: false,
    },
    {
      name: 'publishedAt',
      type: 'date',
      label: { en: 'Published At', 'zh-TW': '發布時間' },
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
      label: { en: 'Content', 'zh-TW': '內容' },
      required: true,
    },
  ],
}
