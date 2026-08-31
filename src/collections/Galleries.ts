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
    /**
     * Everything in this album, photos and videos in one ordered list.
     *
     * Two arrays split by mime type is how this started, and it was the same
     * relation twice: identical columns apart from `featured` on one and
     * `videoId` on the other, four tables once the version shadows are counted,
     * and a union in every consumer. Splitting on the file's type also meant
     * `featured` was unavailable to videos for no reason anyone recorded.
     *
     * `featured` belongs here rather than on `media` because it is a fact about
     * *this membership* — the same photo can be featured in one album and not
     * another. `videoId` did not, and that is why it is gone: it identified the
     * media, not the membership, so the same video in two albums had two public
     * ids and a video in no album had none. It now lives on `media` as
     * `legacyVideoId`, read only to keep already-published links working.
     *
     * Readers split back out by `media.mimeType` (`mapPayloadGallery`), which
     * is what the /gallery client was already doing to build its photo and
     * video views.
     *
     * `(gallery, media)` is deliberately NOT unique. The same file can be added
     * twice, as it could before. Enforcing it in the database would turn a
     * validation message into a 500: drafts are on, and a draft save skips
     * required/uniqueness validation.
     */
    {
      name: 'items',
      type: 'array',
      label: { en: 'Items', 'zh-TW': '內容' },
      labels: {
        singular: { en: 'Item', 'zh-TW': '項目' },
        plural: { en: 'Items', 'zh-TW': '項目' },
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
  ],
}
