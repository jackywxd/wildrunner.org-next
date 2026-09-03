import type { CollectionConfig } from 'payload'

import { isAdminFieldLevel, isAuthenticated, isOwner, ownedOnly } from '../access'
import { ownerField } from '../fields/owner'
import { guardPostContent } from './hooks/guard-content'
import { setOwner } from './hooks/owner'
import { revalidatePosts } from './hooks/revalidate'
import { derivePostSlug } from './hooks/derive-slug'
import { uniquePostSlug } from './hooks/unique-slug'
import { youTubeVideoId } from '../lib/youtube'

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
    // derivePostSlug before uniquePostSlug, and the order is the point: the
    // first fills an empty slug, the second checks whatever slug is now there.
    // Reversed, a member who cleared the field would be told nothing collides
    // and then have the save refused for a missing required value anyway.
    beforeValidate: [guardPostContent, derivePostSlug, uniquePostSlug],
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
    /**
     * What plays behind the article while it is read aloud.
     *
     * THE SAME FIELD AS AN ALBUM'S, deliberately down to the validator, and it
     * resolves through the same `buildMusicPlaylist`: this post's own link
     * first, then the site-wide fallback list on the `site` global. An article
     * and an album are the same question — "what should be playing?" — asked
     * about a different thing, and the answer already had one implementation.
     *
     * `validate` REFUSES ANYTHING THAT IS NOT ONE VIDEO. A playlist or channel
     * URL has no single video, so `youTubeVideoId` returns null for it and it
     * is rejected at save time rather than stored and silently ignored — the
     * failure where an author sets background music, sees no error, and hears
     * nothing.
     *
     * MEMBER-FACING, unlike the album's, which is admin-only because there is
     * no member album editor. A member owns their posts, so this control has
     * to exist on their editor too — `scripts/assert-schema-screen.mjs` only
     * demands that of a *required* field, and this one is optional, so nothing
     * forces the pairing. It is added because the alternative is a field only
     * an admin can reach on content a member owns.
     */
    {
      name: 'musicUrl',
      type: 'text',
      label: { en: 'Background music (YouTube)', 'zh-TW': '背景音樂（YouTube）' },
      admin: {
        position: 'sidebar',
        description: {
          en: 'A YouTube video link. Plays while a visitor has this article read aloud; they can always mute it.',
          'zh-TW':
            '貼一個 YouTube 影片連結。訪客朗讀這篇文章時當背景音樂，隨時可以關掉。',
        },
      },
      validate: (value: unknown) => {
        if (value === null || value === undefined || value === '') return true
        if (typeof value !== 'string') return 'Enter a YouTube video link.'
        return youTubeVideoId(value) !== null
          ? true
          : '請貼一個 YouTube 影片連結（播放清單或頻道沒有單一影片，不能用）'
      },
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
