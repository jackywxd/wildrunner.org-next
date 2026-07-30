import type { GlobalConfig } from 'payload'

import { isAdmin, isAdminUser } from '../access'
import { revalidateSiteGlobal } from '../collections/hooks/revalidate'

export const Site: GlobalConfig = {
  slug: 'site',
  label: { en: 'Site', 'zh-TW': '網站設定' },
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
      label: { en: 'Hero Title (English)', 'zh-TW': '首頁標題（英文）' },
      defaultValue: 'Run wild, run free',
    },
    {
      name: 'heroTitleZh',
      type: 'text',
      label: { en: 'Hero Title (Chinese)', 'zh-TW': '首頁標題（中文）' },
      defaultValue: '心如野馬，馳騁天下',
    },
    {
      name: 'metadata',
      type: 'group',
      label: { en: 'Metadata', 'zh-TW': '中繼資料' },
      fields: [
        {
          name: 'titleDefault',
          type: 'text',
          label: { en: 'Default Title', 'zh-TW': '預設標題' },
          defaultValue: '野馬營',
        },
        {
          name: 'titleTemplate',
          type: 'text',
          label: { en: 'Title Template', 'zh-TW': '標題樣板' },
          defaultValue: '%s | 野馬營',
        },
        {
          name: 'description',
          type: 'textarea',
          label: { en: 'Description', 'zh-TW': '描述' },
        },
      ],
    },
    {
      name: 'social',
      type: 'group',
      label: { en: 'Social', 'zh-TW': '社群連結' },
      fields: [
        {
          name: 'github',
          type: 'text',
          label: { en: 'GitHub', 'zh-TW': 'GitHub' },
        },
      ],
    },
    {
      name: 'topNavItems',
      type: 'array',
      label: { en: 'Top Nav Items', 'zh-TW': '頂部導覽項目' },
      fields: [
        {
          name: 'label',
          type: 'text',
          label: { en: 'Label', 'zh-TW': '標籤' },
          required: true,
        },
        {
          name: 'href',
          type: 'text',
          label: { en: 'Link', 'zh-TW': '連結' },
          required: true,
        },
        {
          name: 'icon',
          type: 'text',
          label: { en: 'Icon', 'zh-TW': '圖示' },
        },
      ],
    },
  ],
}
