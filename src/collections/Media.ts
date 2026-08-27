import type { CollectionConfig } from 'payload'

import { isAuthenticated, isOwner, ownedOnlyPublicRead } from '../access'
import { ownerField } from '../fields/owner'
import { setMediaUrl } from './hooks/media-url'
import { enforceStorageQuota } from './hooks/quota'
import { setOwner } from './hooks/owner'
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
    // Image processing (blurDataURL, dimensions, HEIC→WebP) is NOT here —
    // see src/endpoints/processMediaImage.ts for why an afterChange hook
    // doesn't work for it.
    afterChange: [streamIngestOnUpload],
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
    /**
     * The transcode job's state, and the queue it is queued in.
     *
     * There is no Cloudflare Queue behind this: these three columns *are*
     * the queue. `queued` is the backlog, `running` is a lease, `attempts`
     * is the retry count and `failed` is the dead letter. That works
     * because the thing which can fail is a container that Cloudflare
     * explicitly does not promise to keep alive ("does not guarantee that
     * any container instance will run for any set period of time") — so the
     * state has to live somewhere that outlives it, and the row already
     * does.
     *
     * The lease is swept by the scheduled worker: a row left `running` past
     * the timeout is handed back to `queued` until `attempts` runs out. See
     * src/lib/media/transcode-state.ts.
     */
    {
      name: 'transcodeStatus',
      type: 'select',
      label: { en: 'Transcode', 'zh-TW': '轉檔狀態' },
      options: [
        { label: { en: 'Queued', 'zh-TW': '排隊中' }, value: 'queued' },
        { label: { en: 'Running', 'zh-TW': '轉檔中' }, value: 'running' },
        { label: { en: 'Done', 'zh-TW': '已完成' }, value: 'done' },
        { label: { en: 'Failed', 'zh-TW': '失敗' }, value: 'failed' },
        { label: { en: 'Skipped', 'zh-TW': '不需轉檔' }, value: 'skipped' },
      ],
      admin: {
        readOnly: true,
        description: 'Set by the transcoder; never edited by hand.',
        position: 'sidebar',
      },
    },
    {
      name: 'transcodeAttempts',
      type: 'number',
      label: { en: 'Transcode attempts', 'zh-TW': '轉檔嘗試次數' },
      defaultValue: 0,
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    /**
     * Where the file lived before transcoding, kept forever.
     *
     * The transcoder writes its output to a *new* key and repoints `url`;
     * it never overwrites the source. A container can be `SIGKILL`ed
     * mid-write, and overwriting would make that a case where neither file
     * is whole. Deleting the originals once the results have been reviewed
     * is a separate, human decision — AGENTS.md's rule that destructive work
     * is proposed rather than performed.
     */
    {
      name: 'originalUrl',
      type: 'text',
      label: { en: 'Original URL', 'zh-TW': '原始檔網址' },
      admin: {
        readOnly: true,
        description: 'The pre-transcode file. Kept; never deleted automatically.',
        position: 'sidebar',
      },
    },
    /**
     * Identifies a file the member has already uploaded, so the library can
     * refuse a second copy of the same thing.
     *
     * Set by the client at upload time and never recomputed server-side:
     * the value is derived from bytes the browser already has in hand, and
     * recomputing it here would mean pulling the whole object back out of R2
     * for every upload. It is `readOnly` for the same reason every other
     * derived field here is — nothing but the upload path should write it.
     *
     * Indexed because it is only ever queried by equality, once per upload,
     * and a member with several hundred photos would otherwise scan them
     * all. See src/lib/media/fingerprint.ts for what the value actually is
     * and why it is not a whole-file hash.
     */
    {
      name: 'contentFingerprint',
      type: 'text',
      index: true,
      label: { en: 'Content fingerprint', 'zh-TW': '檔案指紋' },
      admin: {
        readOnly: true,
        description: 'Size and edge digest, used to spot a repeat upload.',
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
