import type { GlobalConfig } from 'payload'

import { revalidateSiteGlobal } from '../collections/hooks/revalidate'

export const Site: GlobalConfig = {
  slug: 'site',
  hooks: {
    afterChange: [revalidateSiteGlobal],
  },
  access: {
    read: () => true,
    update: ({ req: { user } }) => Boolean(user),
  },
  fields: [
    {
      name: 'heroTitleEn',
      type: 'text',
      defaultValue: 'Run wild, run free',
    },
    {
      name: 'heroTitleZh',
      type: 'text',
      defaultValue: '心如野馬，馳騁天下',
    },
    {
      name: 'metadata',
      type: 'group',
      fields: [
        {
          name: 'titleDefault',
          type: 'text',
          defaultValue: '野馬營',
        },
        {
          name: 'titleTemplate',
          type: 'text',
          defaultValue: '%s | 野馬營',
        },
        {
          name: 'description',
          type: 'textarea',
        },
      ],
    },
    {
      name: 'social',
      type: 'group',
      fields: [
        {
          name: 'github',
          type: 'text',
        },
      ],
    },
    {
      name: 'topNavItems',
      type: 'array',
      fields: [
        {
          name: 'label',
          type: 'text',
          required: true,
        },
        {
          name: 'href',
          type: 'text',
          required: true,
        },
        {
          name: 'icon',
          type: 'text',
        },
      ],
    },
  ],
}
