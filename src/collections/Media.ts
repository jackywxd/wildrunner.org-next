import type { CollectionConfig } from 'payload'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: () => true,
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => Boolean(user),
  },
  fields: [
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
    // These are not supported on Workers yet due to lack of sharp
    crop: false,
    focalPoint: false,
  },
}
