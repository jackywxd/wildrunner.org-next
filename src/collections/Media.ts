import type { CollectionConfig } from 'payload'

import { isAuthenticated, isOwner } from '../access'
import { ownerField } from '../fields/owner'
import { setOwner } from './hooks/owner'
import { streamIngestOnUpload } from './hooks/stream-ingest'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    // Public: every rendered page needs to resolve its images.
    read: () => true,
    create: isAuthenticated,
    update: isOwner,
    delete: isOwner,
  },
  hooks: {
    beforeChange: [setOwner],
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
  },
}
