import type { GlobalConfig } from 'payload'

import { isAdmin, isAdminUser } from '../access'
import { revalidateSiteGlobal } from '../collections/hooks/revalidate'

export const Site: GlobalConfig = {
  slug: 'site',
  admin: {
    // Members can't update it, so don't offer it to them.
    hidden: ({ user }) => !isAdminUser(user),
  },
  hooks: {
    afterChange: [revalidateSiteGlobal],
  },
  access: {
    read: () => true,
    // Site-wide settings (hero, nav, metadata) are admin-only.
    update: isAdmin,
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
