import type { CollectionConfig } from 'payload'

import {
  isAdminFieldLevel,
  isAdminUser,
  isAuthenticated,
  isOwner,
  ownedOnly,
} from '../access'
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
      /**
       * The race this post is about, as one of the author's own finish
       * records — not a bare catalogue id.
       *
       * A badge needs three things (eventId, distanceId, year) and a record
       * already carries all three, so pointing at one means the badge on a
       * race report and the badge on its author's profile can never
       * disagree. Storing the trio again on the post would let them drift,
       * and there would be no answer to which was right.
       *
       * The cost is that a post can only be tagged with a race its author
       * logged. That is the intended nudge — `race-records` is barely used
       * — but it does mean this cannot mark a post *about* a race the
       * author did not run. If that is ever wanted it is a second, separate
       * field, not a loosening of this one.
       */
      name: 'raceRecord',
      type: 'relationship',
      relationTo: 'race-records',
      label: { en: 'Related race', 'zh-TW': '相關賽事' },
      admin: {
        position: 'sidebar',
        description: {
          en: 'One of your own race records. Its badge is shown on the post.',
          'zh-TW': '從你自己的完賽紀錄中選擇，該賽事的徽章會顯示在文章上。',
        },
      },
      /**
       * Own records only. `race-records` is publicly readable by design (a
       * badge exists to be seen), so without this the picker would list
       * every member's finishes and let one member attach another's record
       * to their post.
       */
      filterOptions: ({ user }) =>
        isAdminUser(user) ? true : { owner: { equals: user?.id } },
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
