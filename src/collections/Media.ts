import type { CollectionConfig } from 'payload'

import { isAuthenticated, isOwner, ownedOnlyPublicRead } from '../access'
import { ownerField } from '../fields/owner'
import { setMediaUrl } from './hooks/media-url'
import { enforceStorageQuota } from './hooks/quota'
import { setOwner } from './hooks/owner'
import { streamIngestOnUpload } from './hooks/stream-ingest'

export const Media: CollectionConfig = {
  slug: 'media',
  admin: {
    components: {
      beforeListTable: ['@/components/admin/StorageQuotaField#StorageQuotaField'],
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
    beforeOperation: [enforceStorageQuota],
    beforeChange: [setOwner, setMediaUrl],
    afterChange: [streamIngestOnUpload],
  },
  fields: [
    ownerField,
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
    {
      name: 'streamId',
      type: 'text',
      admin: {
        description: 'Cloudflare Stream UID after video ingest (Phase 5+)',
        position: 'sidebar',
      },
    },
    {
      name: 'streamReady',
      type: 'checkbox',
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
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'width',
      type: 'number',
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      name: 'height',
      type: 'number',
      admin: { readOnly: true, position: 'sidebar' },
    },
  ],
  upload: {
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
