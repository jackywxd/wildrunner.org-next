import type { CollectionConfig } from 'payload'

import { isAuthenticated, isOwner, ownedOnlyPublicRead } from '../access'
import { ownerField } from '../fields/owner'
import { setMediaUrl } from './hooks/media-url'
import { enforceStorageQuota } from './hooks/quota'
import { setOwner } from './hooks/owner'
import { processImageOnUpload } from './hooks/process-image'
import { streamIngestOnUpload } from './hooks/stream-ingest'
import { verifyDirectUpload } from './hooks/verify-direct-upload'

export const Media: CollectionConfig = {
  slug: 'media',
  labels: {
    singular: { en: 'Media', 'zh-TW': '媒體' },
    plural: { en: 'Media', 'zh-TW': '媒體' },
  },
  admin: {
    components: {
      beforeListTable: [
        '@/components/admin/StorageQuotaField#StorageQuotaField',
        '@/components/admin/LargeUploadPanel#LargeUploadPanel',
      ],
    },
  },
  access: {
    // Anonymous keeps full read (the public site resolves images through
    // it); a signed-in member sees only their own library.
    read: ownedOnlyPublicRead,
    create: isAuthenticated,
    update: isOwner,
    delete: isOwner,
  },
  hooks: {
    // verifyDirectUpload first: it resolves the real filesize from R2, which
    // the quota check then has to bill against.
    beforeOperation: [verifyDirectUpload, enforceStorageQuota],
    beforeChange: [setOwner, setMediaUrl],
    afterChange: [streamIngestOnUpload, processImageOnUpload],
  },
  fields: [
    ownerField,
    {
      name: 'alt',
      type: 'text',
      label: { en: 'Alt Text', 'zh-TW': '替代文字' },
      required: true,
    },
    {
      name: 'raceEdition',
      type: 'relationship',
      relationTo: 'race-editions',
      label: { en: 'Race', 'zh-TW': '比賽' },
      // A real foreign key, unlike RaceRecords' `eventId`/`distanceId` text
      // fields before validateRaceCatalogueRef existed — Payload itself
      // refuses a value that does not name a real race-editions row, so
      // there is nothing here for a beforeValidate hook to duplicate.
      //
      // Member-settable like `alt`, not owner-only like `owner`: which race
      // a photo is from is the same kind of claim as its caption, not a
      // fact about who is making it. Anyone with `update` access — the
      // uploader or an admin — can also clear it, which is the "解除關聯"
      // moderation path docs/plan's S5 asks for; nothing further to build.
      admin: {
        description: {
          en: 'Optional. Which race this photo is from — shown on that race’s public photo wall.',
          'zh-TW': '選填。這張照片是哪一場比賽的——會顯示在該場比賽的公開相片牆。',
        },
      },
    },
    {
      name: 'streamId',
      type: 'text',
      label: { en: 'Stream ID', 'zh-TW': 'Stream ID' },
      admin: {
        description: 'Cloudflare Stream UID after video ingest (Phase 5+)',
        position: 'sidebar',
      },
    },
    {
      name: 'streamReady',
      type: 'checkbox',
      label: { en: 'Stream Ready', 'zh-TW': 'Stream 已就緒' },
      defaultValue: false,
      admin: {
        readOnly: true,
        description: 'Cloudflare Stream has finished processing this video',
        position: 'sidebar',
      },
    },
    {
      name: 'blurDataURL',
      type: 'textarea',
      label: { en: 'Blur Data URL', 'zh-TW': '模糊預覽資料' },
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'width',
      type: 'number',
      label: { en: 'Width', 'zh-TW': '寬度' },
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      name: 'height',
      type: 'number',
      label: { en: 'Height', 'zh-TW': '高度' },
      admin: { readOnly: true, position: 'sidebar' },
    },
  ],
  upload: {
    // Files over ~32 MB never reach the Worker: the browser uploads them
    // straight to R2 and then creates the document from metadata alone.
    // Payload only requires a file on create so that its own upload pipeline
    // has something to work on, and that pipeline is exactly what cannot run
    // here — @payloadcms/storage-r2 refuses to hand a >50 MB object back to
    // the server (to avoid exhausting Worker memory), while Payload core
    // reads that empty response into `req.file.data` anyway and then rejects
    // the zero-byte buffer as `text/plain`.
    //
    // `verifyDirectUpload` is what makes this safe — see its comment. It is
    // not optional: with this flag and without that hook, any authenticated
    // member could create documents pointing at nothing.
    filesRequiredOnCreate: false,
    mimeTypes: ['image/*', 'video/*'],
    // These are not supported on Workers yet due to lack of sharp
    crop: false,
    focalPoint: false,
    // Closes the "paste a URL to upload" path: it lets a member make the
    // Worker fetch an arbitrary URL (SSRF) and bypasses the quota check
    // above, since a server-side fetch never populates req.file with a
    // known size beforehand. It's also the exact mechanism that caused
    // 413 duplicate R2 objects during the Velite migration (see 9bbfbf5) —
    // the migration script writes media via payload.db.create with no
    // `file`, so it never goes through this path and is unaffected.
    pasteURL: false,
  },
}
