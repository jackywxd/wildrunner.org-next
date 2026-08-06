import type { Access, CollectionConfig } from 'payload'

import { isAdmin, isAdminUser } from '../access'

/**
 * What you can actually enter at a race.
 *
 * NOT CALLED "DISTANCE", and the rename is the point. Mont-Blanc's entries
 * are UTMB, CCC, OCC and TDS; Sinister 7 has a relay; Barkley has a Fun
 * Run. None of those is a distance. Calling the concept `distance` is what
 * produced the long-standing confusion that a badge "needs a distance" when
 * a schedule row has none — a schedule row has no *category*, which is a
 * different and answerable question.
 *
 * A SEPARATE COLLECTION, NOT AN ARRAY FIELD ON THE EVENT. Payload
 * relationships cannot point at an array item, and `race-records.category`
 * has to be a real foreign key. The side benefit is somewhere to put the
 * distance and elevation, which the old code catalogue had nowhere for.
 *
 * `verified` IS NOT DECORATION. Every UTMB World Series event used to be
 * given the same four categories and every World Trail Majors event the
 * same two, because the published calendars do not list them. Checked
 * against the events' own sites, that was wrong for every single one:
 * Tarawera runs TMiler/T102/T50/T21/T14, Cape Town runs six named races.
 * A category a member can pick had better be one the race actually ran, so
 * the flag records whether anybody looked. See docs/race-data-sources.md.
 */
export const RaceCategories: CollectionConfig = {
  slug: 'race-categories',
  labels: {
    singular: { en: 'Race category', 'zh-TW': '賽事分項' },
    plural: { en: 'Race categories', 'zh-TW': '賽事分項' },
  },
  defaultSort: 'order',
  admin: {
    useAsTitle: 'label',
    defaultColumns: ['label', 'event', 'distanceKm', 'elevationGainM', 'verified'],
    group: { en: 'Races', 'zh-TW': '賽事' },
  },
  access: {
    read: (() => true) as Access,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
    admin: ({ req }) => isAdminUser(req.user),
  },
  // A real database constraint rather than a beforeValidate hook. Payload
  // 3.82 emits these as unique indexes, so a duplicate cannot be written by
  // any path — including a migration or a direct API call that skips hooks.
  indexes: [{ fields: ['event', 'key'], unique: true }],
  fields: [
    {
      name: 'event',
      type: 'relationship',
      relationTo: 'race-events',
      label: { en: 'Event', 'zh-TW': '賽事' },
      required: true,
      index: true,
    },
    {
      name: 'key',
      type: 'text',
      label: { en: 'Key', 'zh-TW': '代碼' },
      required: true,
      admin: {
        description: {
          en: 'Stable within the event, e.g. ccc, 100m, relay. Member records point at it — rename the label, not this.',
          'zh-TW': '在該賽事內固定不變，例如 ccc、100m、relay。會員紀錄指著它 —— 要改就改標籤。',
        },
      },
    },
    {
      name: 'label',
      type: 'text',
      label: { en: 'Label', 'zh-TW': '名稱' },
      required: true,
      admin: {
        description: {
          en: 'What the race calls it, shown on the badge band: "CCC", "TMiler", "接力".',
          'zh-TW': '賽事自己的稱呼，會顯示在徽章上：「CCC」「TMiler」「接力」。',
        },
      },
    },
    {
      name: 'distanceKm',
      type: 'number',
      label: { en: 'Distance (km)', 'zh-TW': '距離（公里）' },
      min: 0,
      admin: {
        description: {
          en: 'The real distance, which often differs from the name — Kaçkar\'s "100K" is 82 km. Leave empty rather than deriving it from the label.',
          'zh-TW':
            '實際距離，經常和名稱不同 —— Kaçkar 的「100K」其實是 82 公里。查不到就留空，不要從名稱推。',
        },
      },
    },
    {
      name: 'elevationGainM',
      type: 'number',
      label: { en: 'Elevation gain (m)', 'zh-TW': '累積爬升（公尺）' },
      min: 0,
    },
    {
      name: 'order',
      type: 'number',
      label: { en: 'Order', 'zh-TW': '排序' },
      defaultValue: 1,
      admin: {
        description: {
          en: 'Longest first, matching how events list their own races.',
          'zh-TW': '由長到短，跟賽事官網自己的排法一致。',
        },
      },
    },
    {
      name: 'verified',
      type: 'checkbox',
      label: { en: 'Verified', 'zh-TW': '已查證' },
      defaultValue: false,
      index: true,
      admin: {
        position: 'sidebar',
        description: {
          en: 'Ticked only if somebody read the event\'s own site. Unticked means assumed, and assumed has been wrong every time it was checked.',
          'zh-TW':
            '真的看過賽事官網才勾。沒勾代表是預設值，而預設值每次被查證都是錯的。',
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
      },
    },
  ],
}
