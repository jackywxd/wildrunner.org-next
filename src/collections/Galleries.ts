import type { CollectionConfig } from 'payload'

import { isAuthenticated, isOwner, ownedOnly } from '../access'
import { ownerField } from '../fields/owner'
import { youTubeVideoId } from '../lib/youtube'
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
     * Which race this whole album is of.
     *
     * THE SAME ASSOCIATION `media.raceEdition` ALREADY EXPRESSES, one level
     * up, and it exists because the per-file form is unusable at album scale:
     * tagging `UTMB 2025` means 28 edits, and measured on the seeded corpus
     * the day this field was added, **420 media rows carried 0 tags** while
     * four of the twenty albums were named after races. The association was
     * real and lived only in the titles.
     *
     * ADDITIVE. `media.raceEdition` stays authoritative for a single file — a
     * photo of the finish line that ended up in a general album still belongs
     * to that race. A reader takes this when it is set and otherwise falls
     * back to the tags the album's own items carry (`albumRaceEditionId`), so
     * nothing that works today changes.
     *
     * A REAL FOREIGN KEY, so Payload itself refuses an edition that does not
     * exist — the same reasoning `Media.raceEdition` records, and the reason
     * neither needs a `beforeValidate` hook the way `race-records` did before
     * `validateRaceCatalogueRef`.
     *
     * ADMIN-ONLY, like `musicUrl` above and for the same reason: nothing under
     * `src/app/(site)/members` edits `galleries`, so the control is the one
     * Payload generates and there is no second screen for it to drift from.
     */
    {
      name: 'raceEdition',
      type: 'relationship',
      relationTo: 'race-editions',
      label: { en: 'Race', 'zh-TW': '比賽' },
      admin: {
        position: 'sidebar',
        description: {
          en: 'Optional. Which race this album is of. Puts the album on that race’s row in 穿越時光 instead of in a month of its own.',
          'zh-TW':
            '選填。這本相簿是哪一場比賽的。設了之後，相簿會出現在穿越時光上那場比賽那一列，而不是自己佔一個月份。',
        },
      },
    },
    /**
     * A YouTube link this album plays while its slideshow runs.
     *
     * STORED AS THE URL SOMEBODY PASTED, not as the id. The id is re-derived
     * on every read (`mapPayloadGallery`) so that the rule
     * `src/lib/youtube.ts` exists for has exactly one place to hold: the
     * author's own string never reaches an `<iframe src>`, because the only
     * thing that crosses to the client is eleven characters this codebase
     * parsed out itself. Storing the id instead would make the round trip
     * lossy for no gain — an admin who wants to check what they pasted would
     * be shown something they did not type.
     *
     * `validate` REFUSES ANYTHING THAT IS NOT ONE VIDEO. A playlist or channel
     * URL has no single video, so `youTubeVideoId` returns null for it and it
     * is rejected at save time rather than stored and silently ignored — the
     * failure where an admin sets background music, sees no error, and hears
     * nothing.
     *
     * ADMIN-ONLY BY CONSTRUCTION. There is no member-facing album editor
     * (nothing under src/app/(site)/members touches `galleries`), so this
     * control is the one Payload generates from this field and there is no
     * second screen for it to drift from. `scripts/assert-schema-screen.mjs`
     * covers member-facing forms only, and correctly does not reach here.
     *
     * The virtual race albums have no row and therefore no music; see
     * `src/lib/race-gallery.ts` for why they are derived rather than stored.
     */
    {
      name: 'musicUrl',
      type: 'text',
      label: { en: 'Background music (YouTube)', 'zh-TW': '背景音樂（YouTube）' },
      admin: {
        position: 'sidebar',
        description: {
          en: 'A YouTube video link. Plays while a visitor runs this album as a slideshow; they can always mute it.',
          'zh-TW':
            '貼一個 YouTube 影片連結。訪客播放這本相簿的投影片時當背景音樂，隨時可以關掉。',
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
