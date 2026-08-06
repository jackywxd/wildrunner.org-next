import type { CollectionConfig } from 'payload'

import { isAdminFieldLevel, isAuthenticated, isOwner, ownedOnly } from '../access'
import { ownerField } from '../fields/owner'
import { guardPostContent } from './hooks/guard-content'
import { setOwner } from './hooks/owner'
import { revalidatePosts } from './hooks/revalidate'
import { uniquePostSlug } from './hooks/unique-slug'

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
    beforeValidate: [guardPostContent, uniquePostSlug],
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
      /**
       * What makes a post a race report rather than an ordinary post.
       *
       * Points at a `race-records` document, NOT at a `race-schedule` row.
       * A schedule row says an event ran on given dates; it has no distance,
       * because one row covers a race offering 20K through 100M. A badge
       * asserts "this member finished this event, at this distance, in this
       * year" — which is precisely what a race record is. Linking to the
       * schedule instead would leave the badge with no distance to show.
       *
       * The relationship runs one way, and only one way: a record can exist
       * with no post (a badge earned but never written about), a post can
       * exist with no record (any post that isn't a race report). Only the
       * pairing is stored here.
       *
       * `filterOptions` scopes the picker to the member's own records so the
       * admin panel cannot be used to claim someone else's finish. It is a
       * query constraint, so it is enforced on write, not just in the UI.
       */
      name: 'raceRecord',
      type: 'relationship',
      relationTo: 'race-records',
      label: { en: 'Race record', 'zh-TW': '比賽紀錄' },
      index: true,
      admin: {
        position: 'sidebar',
        description: '這篇文章記錄的比賽。只有已結束的比賽可以寫賽記。',
      },
      filterOptions: ({ user }) => {
        if (!user) return false
        if ((user as { role?: string }).role === 'admin') return true
        return { owner: { equals: user.id } }
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
