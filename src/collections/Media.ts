/**
 * An uploaded file, and the three places it can belong.
 *
 * A media row can carry a race (`raceEdition`), can be listed by any number of
 * galleries (`galleries.items[].media`), and can be referenced from an article
 * — and all three are optional and independent. What it could *not* express
 * until `usage` existed is the one thing the site actually asks of it: is this
 * public photo-wall content, or an attachment to something else?
 *
 * `/gallery` used to answer that with `raceEdition exists`, which made a
 * category tag double as a publish switch. A member who uploaded a photo
 * without picking a race got a file that appeared nowhere and that the weekly
 * sweep would eventually delete. `usage` is that missing column.
 *
 * Two deliberate denormalizations live in this table, both older than `usage`
 * and both left alone. `originalUrl -> originalFilesize` and
 * `streamId -> streamReady` are each a fact about a *second* file identified
 * by the column above it, so strictly `id -> originalUrl -> originalFilesize`
 * is transitive and breaks 3NF. Splitting either into its own table buys
 * correctness on paper and costs a join on every read, for two nullable
 * columns describing an optional 1:0..1 attachment. Recorded here so the next
 * person knows it was weighed rather than missed.
 */
import type { CollectionConfig } from 'payload'

import { isAuthenticated, isOwner, mediaPublicRead } from '../access'
import { ownerField } from '../fields/owner'
import { setMediaUrl } from './hooks/media-url'
import { enforceStorageQuota } from './hooks/quota'
import { setOwner } from './hooks/owner'
import { revalidateMedia } from './hooks/revalidate'
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
    // Anonymous reads everything except a file its owner marked `private`;
    // a signed-in member sees only their own library. See mediaPublicRead —
    // and note it bounds the API, not the R2 object.
    read: mediaPublicRead,
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
    afterChange: [streamIngestOnUpload, revalidateMedia.afterChange],
    // The first hook on this collection that fires on delete. Its own header
    // says why the pair has to exist before /gallery is ever cached.
    afterDelete: [revalidateMedia.afterDelete],
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
      /**
       * What this file is called on screen, when somebody has said.
       *
       * A NAME IS NOT ALT TEXT, and this field exists because the two were
       * about to be conflated. `alt` describes the *content* for a screen
       * reader and is required; a title is what a visitor reads under a video
       * tile. Sharing one field means an edit made for accessibility silently
       * renames the thing on screen — and the corpus shows they are not even
       * the same string: `alt` on the migrated videos is the album name plus
       * the original filename with its extension
       * (`2023 - UTMB UTMB 2023 Vertical.m4v`), while new uploads get
       * `defaultAltFor(filename)`, which is the stem `mediaDisplayName`
       * already derives.
       *
       * OPTIONAL, AND EXPECTED TO BE EMPTY on almost every row. Empty means
       * "nobody has named this", and `mediaDisplayName` then derives a label
       * from the URL exactly as it does today — so nothing regresses and
       * there is no backfill. Filling it in is a member editing one field in
       * their library, which is the only source that can do better than a
       * guess at a filename.
       */
      name: 'title',
      type: 'text',
      label: { en: 'Display name', 'zh-TW': '顯示名稱' },
      admin: {
        description:
          'Shown under a video in the gallery and as its share page heading. Leave empty to use the file name.',
      },
    },
    {
      /**
       * What this photo or video is about, when somebody has said.
       *
       * THE THIRD STRING ON THIS ROW, AND THE THREE ARE THREE THINGS. `alt`
       * is required and describes the picture for a screen reader; `title` is
       * the short label under a tile; this is the caption — the sentence
       * somebody would say about the photo. The `title` field's own header
       * records why conflating the first two was refused, and the same
       * argument applies here with an extra edge: on the migrated corpus `alt`
       * holds the album name plus the original filename
       * (`2023 - UTMB UTMB 2023 Vertical.m4v`), so reusing it as a caption
       * would publish that string as prose under 546 files.
       *
       * `textarea`, not `text`: a caption wraps, and a single-line input tells
       * a member to write a label when what is wanted is a sentence or two.
       *
       * `maxLength` IS ALSO A PAYLOAD BUDGET, not only a content rule. The
       * photo wall ships sixty items per page and the lightbox reads this from
       * the item it is given, so every character here is carried by every
       * visitor who loads /gallery — the same cost `gallery-index.ts`'s header
       * records paying once already, at 663 KB.
       *
       * OPTIONAL, AND EXPECTED TO BE EMPTY on almost every row. Empty means
       * "nobody has written one", which every reader treats as absent rather
       * than as a blank caption, so nothing regresses and there is no backfill.
       */
      name: 'description',
      type: 'textarea',
      maxLength: 500,
      label: { en: 'Description', 'zh-TW': '描述' },
      admin: {
        description:
          'What this photo or video is about. Shown in the lightbox caption and on its share page. Not alt text — see the field header.',
      },
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
          en: 'Optional. Which race this photo is from. Shown on that race’s photo wall when Usage is “Photo wall”.',
          'zh-TW': '選填。這張照片是哪一場比賽的。當「用途」是「相片牆」時，會顯示在該場比賽的相片牆。',
        },
      },
    },
    /**
     * Whether this file is public photo-wall content, and if not, why not.
     *
     * Three values rather than a boolean, because the system genuinely
     * distinguishes three cases and a boolean collapses the last two into one
     * false that nothing can tell apart:
     *
     *   gallery     a member's upload, shown publicly
     *   private     a member's upload they chose to keep to themselves
     *   attachment  pasted into an article, a post cover, an avatar, an import
     *
     * The difference between `private` and `attachment` is what the weekly
     * sweep is allowed to delete (src/lib/media/unused.ts). A member's own
     * library file is never collectable whether or not it is public; an
     * attachment nothing references any more is. A boolean would force that
     * question back onto `references.ts`'s walk of the Lexical JSON, every
     * week, forever.
     *
     * Which is the other half of why this column exists: "is this an article
     * attachment" is today only knowable by parsing `posts.content`, a blob no
     * query can reach into. Storing it here is the one normalization available
     * against a rich-text body — the fact stops being derived and becomes a
     * column.
     *
     * Governs every public photo listing: /gallery's photo and video views and
     * its album shelf, the virtual race album /gallery/race-<key>-<year>, and
     * the race wall on /races/[key]/[year]. The race wall is included on
     * purpose — src/lib/race-gallery.ts requires the virtual album and the race
     * page to run the same query, and two different visibility rules would be
     * exactly the split-brain that file exists to avoid.
     *
     * THE DEFAULT IS `attachment`, WHICH IS FAIL-CLOSED AND IS NOT WHAT THE
     * MEMBER SEES. Every path that deliberately puts a file in the library
     * says `gallery` outright — `UploadDropzone` (with the member's own
     * checkbox) and the admin panel's `LargeUploadPanel` — so a member's
     * upload is public by default exactly as intended. What the default
     * decides is only the case where nobody said anything, and there is a real
     * one: /admin's rich-text editor uses Payload's unrestricted
     * `UploadFeature`, whose drawer POSTs to /api/media with no `usage` at
     * all. Measured with `gallery` as the default — an image inserted into an
     * article from /admin landed on the public photo wall, which is precisely
     * what this column exists to prevent, on the path this site's own author
     * uses most. "Unspecified" therefore means "keep it off the wall", the
     * same direction `20260830_090000_add_media_usage` chose for rows it could
     * not classify.
     *
     * Curated albums (`galleries.items[]`) are NOT governed by it: an editor
     * putting a file in an album is its own explicit act.
     *
     * NOT INDEXED, matching `unusedSince` and the qualifiers migration:
     * SQLite refuses `DROP COLUMN` on an indexed column, which would force
     * `down()` to rebuild the table.
     *
     * Unrelated to `src/lib/quota.ts`'s storage usage, which counts bytes.
     */
    {
      name: 'usage',
      type: 'select',
      label: { en: 'Usage', 'zh-TW': '用途' },
      defaultValue: 'attachment',
      options: [
        { label: { en: 'Photo wall', 'zh-TW': '相片牆' }, value: 'gallery' },
        { label: { en: 'Private', 'zh-TW': '不公開' }, value: 'private' },
        { label: { en: 'Article attachment', 'zh-TW': '文章附件' }, value: 'attachment' },
      ],
      admin: {
        description: {
          en: 'Whether this file appears on the public photo walls. Uploads default to “Photo wall”; images placed in an article are “Article attachment”.',
          'zh-TW': '這個檔案是否出現在公開相片牆。上傳預設為「相片牆」；放進文章裡的圖片是「文章附件」。',
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
     * What the kept original still costs, so the quota can charge for it.
     *
     * `filesize` is overwritten with the transcoded size on success, which
     * is right for display — that is the file being served — but it made the
     * quota *fall* after a transcode while R2 usage rose, since the original
     * is deliberately never deleted. A member could upload to the ceiling,
     * wait for transcodes, watch the number drop, and upload to the ceiling
     * again; nothing bounded real storage at all.
     *
     * Recorded at the same moment as `originalUrl` and never overwritten, so
     * the pair always describes the same file. `usedBytesFor` adds the two.
     */
    {
      name: 'originalFilesize',
      type: 'number',
      label: { en: 'Original size', 'zh-TW': '原始檔大小' },
      admin: {
        readOnly: true,
        description: 'Bytes the pre-transcode file still occupies in R2.',
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
    /**
     * When the unused-media sweep first found nothing referencing this file.
     *
     * NULL means "not currently marked", which is both the starting state
     * and what the sweep writes back the moment a marked file is used
     * again — so a member who reinstates a photo during the grace period
     * simply stops being warned, with nothing to undo.
     *
     * The date is what makes the deletion two-stage rather than immediate:
     * the run that finds a file unused only records this and mails the
     * owner, and a later run removes it once GRACE_MS has passed. See
     * src/lib/media/unused.ts for the policy and src/endpoints/
     * unusedMediaSweep.ts for what drives it.
     *
     * Read-only in the admin like every other field the sweep owns. A date
     * an admin could type would be a deletion date an admin could bring
     * forward by accident.
     */
    {
      name: 'unusedSince',
      type: 'date',
      label: { en: 'Unused since', 'zh-TW': '未使用起算日' },
      admin: {
        readOnly: true,
        description: 'Set by the weekly sweep. Cleared as soon as something references this file again.',
        position: 'sidebar',
      },
    },
    /**
     * The share-page id this file had before the id became the media id.
     *
     * `/gallery/[slug]/v/[videoId]` used to resolve a video through
     * `galleries_videos.video_id` — an identifier of the *media* stored on the
     * membership row, so a video in two albums had two of them and a video in
     * no album had none and could not be shared at all. The identity now lives
     * where it belongs: the media id.
     *
     * This column exists only so the links already published keep working, and
     * it is needed rather than assumed. Measured: all 22 videos in
     * `.velite/galleries.json` carry an `id`, and none differs from
     * `videoIdFromFilename(velite's filename)` — but the database's
     * `media.filename` is `migrationFilename(url)`, a flattened value
     * (`galleries--2023--foo--clip.mp4`) rather than velite's `clip.mp4`, so
     * deriving the id from `filename` does NOT reproduce the stored value.
     * Dropping the column would 404 every one of those permalinks.
     *
     * Never written by new code. Read only as the second step of
     * `getGalleryVideo`'s lookup, after the media id.
     *
     * Not uniquely indexed, for the same `DROP COLUMN` reason as `usage`; the
     * migration that fills it asserts uniqueness instead, and refuses to run if
     * one media ever carried two different ids.
     */
    {
      name: 'legacyVideoId',
      type: 'text',
      label: { en: 'Legacy share id', 'zh-TW': '舊分享代碼' },
      admin: {
        readOnly: true,
        description: 'The pre-2026 /gallery/[slug]/v/[id] identifier. Kept so old links resolve; never set on new uploads.',
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
      /**
       * A still frame from a video, so the grid can draw the video instead of
       * a placeholder.
       *
       * Written only by the transcoder's callback, from a frame the container
       * takes one second in. Videos only: an image is its own poster, and
       * nothing sets this for one.
       *
       * NULLABLE AND EXPECTED TO BE NULL for a long time. Every video that
       * predates this — 22 of 22 locally, 27 in production — has none until
       * something re-runs the container over it, so every reader has to have
       * a fallback and `MediaGrid` keeps its dark card for exactly that.
       */
      name: 'posterUrl',
      type: 'text',
      label: { en: 'Poster', 'zh-TW': '影片預覽圖' },
      admin: {
        readOnly: true,
        description: 'Extracted from the video by the transcoder. Empty until it has run.',
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
