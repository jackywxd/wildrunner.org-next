import type { GlobalConfig } from 'payload'

import { isAdmin, isAdminUser } from '../access'
import { revalidateSiteGlobal } from '../collections/hooks/revalidate'
import { youTubeVideoId } from '../lib/youtube'

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
    /**
     * What an album plays when it names no music of its own.
     *
     * A LIST RATHER THAN ONE TRACK, so a visitor who browses several albums in
     * a sitting does not hear the same thirty seconds each time. Which one an
     * album gets is decided from the album's own slug, not at random — see
     * `buildMusicPlaylist`: a list that started somewhere else on every reload
     * same album sound different every visit for no reason the visitor could
     * see, and would make the behaviour untestable.
     *
     * SITE-WIDE AND ADMIN-ONLY, like everything else on this global. An album
     * or a race edition that sets its own `musicUrl` always wins; this is the
     * floor, not an override.
     *
     * Empty is the normal state and means "no music unless an album asks for
     * it", which is what the site did before this list existed.
     */
    {
      name: 'backgroundMusic',
      type: 'array',
      label: { en: 'Default background music', 'zh-TW': '預設背景音樂' },
      labels: {
        singular: { en: 'Track', 'zh-TW': '曲目' },
        plural: { en: 'Tracks', 'zh-TW': '曲目' },
      },
      admin: {
        description: {
          en: 'Used by an album that has no music of its own. Which track an album gets is decided from its slug, so it stays the same between visits.',
          'zh-TW':
            '沒有自己設定音樂的相簿會用這裡的曲目。哪一首由相簿的網址代稱決定，所以每次進去都一樣。',
        },
      },
      fields: [
        {
          name: 'url',
          type: 'text',
          label: { en: 'YouTube link', 'zh-TW': 'YouTube 連結' },
          required: true,
          validate: (value: unknown) => {
            if (typeof value !== 'string' || value === '') {
              return 'Enter a YouTube video link.'
            }
            return youTubeVideoId(value) !== null
              ? true
              : '請貼一個 YouTube 影片連結（播放清單或頻道沒有單一影片，不能用）'
          },
        },
        {
          name: 'label',
          type: 'text',
          label: { en: 'Note', 'zh-TW': '備註' },
          admin: {
            description: {
              en: 'For your own reference. Never shown to visitors.',
              'zh-TW': '給自己看的，不會顯示給訪客。',
            },
          },
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
