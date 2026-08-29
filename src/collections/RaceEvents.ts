import type { Access, CollectionConfig } from 'payload'

import { isAdmin, isAdminUser } from '../access'

/**
 * A race's identity: what it is, not when it runs.
 *
 * Split from `race-editions` because the two change at different rates. A
 * race's identity survives decades — Hardrock is Hardrock — while its dates
 * and registration window change every year. Modelling them as one row is
 * what made the old `race-schedule` duplicate a name and a country on every
 * edition, and what made adding a race require a deploy.
 *
 * WHY `key` EXISTS ALONGSIDE THE INTEGER id. The badge's colour is derived
 * by hashing the event's identifier (`badgeToken` → FNV-1a). An integer
 * primary key is assigned by whichever database inserted the row first, so
 * staging and production would disagree and the same race would be a
 * different colour in each. `key` is stable across environments, so it is
 * what the hash sees; foreign keys still use the integer id.
 *
 * `key` is also immutable for the older reason `RaceEvent.id` always was:
 * a member's record points at it, and renaming it would orphan their badge.
 * Rename `name`; never `key`.
 *
 * DATA GOES STALE. Series membership in particular moves every year — 宁海
 * was mainland China's first UTMB World Series stage in 2023 and had left
 * before 2026. `source` and `verifiedAt` exist so a row can be re-checked
 * without archaeology. See docs/race-data-sources.md.
 */
export const RaceEvents: CollectionConfig = {
  slug: 'race-events',
  labels: {
    singular: { en: 'Race event', 'zh-TW': '賽事' },
    plural: { en: 'Race events', 'zh-TW': '賽事' },
  },
  defaultSort: 'name',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'key', 'series', 'country', 'verifiedAt'],
    group: { en: 'Races', 'zh-TW': '賽事' },
    description: {
      en: 'The race itself. Dates live on editions. Renaming is fine; changing the key is not — a member badge points at it.',
      'zh-TW':
        '賽事本身，日期在「屆次」裡。改名沒問題，但不要改代碼 —— 會員的徽章指著它。',
    },
  },
  access: {
    // Public reference data with no PII, read by /races and every badge.
    read: (() => true) as Access,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
    admin: ({ req }) => isAdminUser(req.user),
  },
  fields: [
    {
      name: 'key',
      type: 'text',
      label: { en: 'Key', 'zh-TW': '代碼' },
      required: true,
      unique: true,
      index: true,
      admin: {
        description: {
          en: 'Stable identifier, e.g. utmb-mont-blanc. Immutable — the badge colour is derived from it and member records point at it.',
          'zh-TW':
            '穩定代碼，例如 utmb-mont-blanc。不可變更 —— 徽章顏色由它算出，會員紀錄也指著它。',
        },
      },
      validate: (value: unknown) => {
        if (typeof value !== 'string' || value === '') return 'Key is required.'
        // Lowercase, hyphenated, no spaces: it appears in seed data, in
        // URLs and in a hash, and a stray capital or space would make two
        // spellings of the same race look like two races.
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(value)) {
          return 'Key must be lowercase words joined by hyphens, e.g. utmb-mont-blanc.'
        }
        return true
      },
    },
    {
      name: 'name',
      type: 'text',
      label: { en: 'Name', 'zh-TW': '名稱' },
      required: true,
    },
    {
      name: 'nameZh',
      type: 'text',
      label: { en: 'Name (Chinese)', 'zh-TW': '中文名稱' },
      admin: {
        description: {
          en: 'Only where Chinese runners actually use one. The site shows this instead of the name, so a transliteration nobody uses would hide the race.',
          'zh-TW':
            '只有華語跑者真的這樣叫才填。網站會用它取代原名，沒人在用的音譯反而會把賽事藏起來。',
        },
      },
    },
    {
      name: 'series',
      type: 'select',
      label: { en: 'Series', 'zh-TW': '系列' },
      required: true,
      index: true,
      defaultValue: 'others',
      options: [
        { label: { en: 'UTMB World Series', 'zh-TW': 'UTMB 世界系列賽' }, value: 'utmb' },
        { label: { en: 'World Trail Majors', 'zh-TW': 'World Trail Majors' }, value: 'wtm' },
        { label: { en: 'Marathon Majors', 'zh-TW': '馬拉松' }, value: 'marathon' },
        { label: { en: 'Independent', 'zh-TW': '其他獨立賽事' }, value: 'others' },
      ],
      admin: {
        description: {
          en: 'Changes between seasons — races join and leave. Re-check it when the next calendar is published.',
          'zh-TW': '會逐年變動 —— 賽事有加入也有退出。新賽季公布時要重新確認。',
        },
      },
    },
    {
      name: 'country',
      type: 'text',
      label: { en: 'Country', 'zh-TW': '國家' },
      admin: {
        description: { en: 'ISO 3166-1 alpha-3, e.g. FRA.', 'zh-TW': 'ISO 3166-1 三碼國碼。' },
      },
      validate: (value: unknown) => {
        if (value === undefined || value === null || value === '') return true
        if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) {
          return 'Country must be an ISO 3166-1 alpha-3 code, e.g. FRA.'
        }
        return true
      },
    },
    {
      name: 'website',
      type: 'text',
      label: { en: 'Official website', 'zh-TW': '官方網站' },
      admin: {
        position: 'sidebar',
        description: {
          en: 'Empty is allowed only when there genuinely is none — the Barkley has no site at all. Say so in Source.',
          'zh-TW': '真的沒有官網才留空（例如 Barkley），並在「資料來源」說明。',
        },
      },
    },
    {
      name: 'itraUrl',
      type: 'text',
      label: { en: 'ITRA page', 'zh-TW': 'ITRA 頁面' },
      admin: {
        position: 'sidebar',
        description: {
          en: 'itra.run/Races/RaceDetails/<id>. The race pages are plain HTML; the calendar is not, so use the race page.',
          'zh-TW': 'itra.run/Races/RaceDetails/<id>。個別賽事頁抓得到，行事曆抓不到。',
        },
      },
    },
    {
      name: 'source',
      type: 'text',
      label: { en: 'Source', 'zh-TW': '資料來源' },
      admin: { position: 'sidebar' },
    },
    {
      name: 'verifiedAt',
      type: 'date',
      label: { en: 'Verified on', 'zh-TW': '最後確認日期' },
      index: true,
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayOnly', displayFormat: 'yyyy-MM-dd' },
        description: {
          en: 'The day somebody read the source. Empty means never. Do not bump it for rows you did not actually re-read.',
          'zh-TW': '真的去看過來源的那一天。留空代表從沒查過。沒重新查的列不要順手更新。',
        },
      },
    },
  ],
}
