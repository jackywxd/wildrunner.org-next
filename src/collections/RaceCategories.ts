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
    /**
     * WHETHER THIS ENTRY IS ON A LOTTERY QUALIFIER LIST.
     *
     * Western States and Hardrock each publish their own list of races a
     * finish counts from, and both list *entries*, not events: at
     * Mont-Blanc the UTMB and the CCC qualify for Western States and the
     * OCC does not. That is why these live here and not on `race-events`
     * — a flag on the event would tell somebody a 20K qualifies them for
     * a 100-mile lottery.
     *
     * SEPARATE FROM `verified`/`source`/`verifiedAt` ABOVE, deliberately.
     * Those record whether anybody read the *event's own site* to confirm
     * this entry exists at all. A qualifier list is a different document,
     * from a different publisher, on a different clock — and `verified=no`
     * with a qualifier flag set is a real, common state: the line-up was
     * assumed, but the list names the event. Folding them together makes
     * that unrepresentable and lets a qualifier re-read pass itself off as
     * a line-up re-read.
     *
     * ONE DATE PER LIST, not one for both. The two lists republish on
     * their own schedules and get re-read at different times, so a shared
     * date would stamp "checked" onto a flag nobody looked at — the exact
     * thing AGENTS.md forbids, because a staleness report is worth nothing
     * if the dates are not true.
     *
     * NOT INDEXED, unlike `verified` and `verifiedAt` above. SQLite
     * refuses `DROP COLUMN` on an indexed column, so an index here would
     * force this migration's `down()` to rebuild the whole table and
     * re-declare the `(event, key)` unique constraint by hand. Nothing
     * would use the index anyway: the schedule filter is an in-memory
     * `Array.filter` over categories the page has already loaded.
     */
    {
      name: 'qualifiesWser',
      type: 'checkbox',
      label: { en: 'Western States qualifier', 'zh-TW': '西部100 資格賽' },
      defaultValue: false,
      admin: {
        position: 'sidebar',
        description: {
          en: 'On the published Western States qualifying-race list (wser.org/qualifying-races). Tick only against the list itself.',
          'zh-TW':
            '在西部100 官方公布的資格賽名單上（wser.org/qualifying-races）。只有對照名單本身才勾。',
        },
      },
    },
    {
      name: 'wserVerifiedAt',
      type: 'date',
      label: { en: 'WS list checked on', 'zh-TW': '西部100 名單查證日期' },
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayOnly', displayFormat: 'yyyy-MM-dd' },
        description: {
          en: 'The day somebody read the WS list. EMPTY MEANS NEVER — without it, "not a qualifier" and "nobody has looked" are the same row.',
          'zh-TW':
            '真的去讀過西部100 名單的那一天。留空代表從沒查過 —— 沒有它，「不是資格賽」和「沒人查過」長得一模一樣。',
        },
      },
    },
    {
      name: 'qualifiesHardrock',
      type: 'checkbox',
      label: { en: 'Hardrock qualifier', 'zh-TW': 'Hardrock 資格賽' },
      defaultValue: false,
      admin: {
        position: 'sidebar',
        description: {
          en: 'On the published Hardrock qualifying-race list (hardrock100.com/qualifying-races.php). Far shorter than the WS list, and not a subset of it.',
          'zh-TW':
            '在 Hardrock 官方公布的資格賽名單上（hardrock100.com/qualifying-races.php）。比西部100 名單短很多，而且不是它的子集。',
        },
      },
    },
    {
      name: 'hardrockVerifiedAt',
      type: 'date',
      label: { en: 'Hardrock list checked on', 'zh-TW': 'Hardrock 名單查證日期' },
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayOnly', displayFormat: 'yyyy-MM-dd' },
        description: {
          en: 'The day somebody read the Hardrock list. Empty means never — the same rule as the WS date above.',
          'zh-TW': '真的去讀過 Hardrock 名單的那一天。留空代表從沒查過，規則同上。',
        },
      },
    },
  ],
}
