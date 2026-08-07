import type { Access, CollectionConfig } from 'payload'

import { isAdmin, isAdminUser } from '../access'

/**
 * One running of a race: the 2026 Hardrock, the 2015 Hardrock.
 *
 * Replaces `race-schedule`, whose name described what the page did with the
 * rows rather than what a row is. A schedule is a view; an edition is a
 * thing that happened.
 *
 * `startDate` IS OPTIONAL, and that is the whole reason this collection can
 * carry history. A member logging their 2015 Hardrock is claiming a real
 * edition, but nobody has its dates and inventing them would put a wrong
 * date on the public calendar. So an edition may exist with a year and
 * nothing else; `/races` queries only rows that have a start date, and the
 * dateless ones sit behind the badges that reference them.
 *
 * UNIQUE ON (event, year), NOT (event, startDate). A race running twice in
 * one calendar year is, in practice, two differently-named races. Keying on
 * the year is what makes "which edition does this record point at" have
 * exactly one answer, and what lets a member's claim find-or-create an
 * edition without risking duplicates.
 *
 * `nameOverride` REPLACES THE OLD UNCONDITIONAL `name`. The previous
 * collection stored a name on every row so that renaming a catalogue entry
 * could not rewrite a published schedule — a deliberate historical
 * snapshot. Kept, but only where it differs: an override on every row is
 * indistinguishable from denormalisation, and nobody could tell which rows
 * were deliberate.
 *
 * DATA ACCURACY. No organiser publishes an API, so every row is copied by
 * hand and will go stale — registration windows fastest of all. Leave a
 * field empty rather than guessing: an empty window renders as "報名資訊待
 * 公布", which is true, while a guessed one sends somebody to a form that
 * closed. See docs/race-data-sources.md.
 */
export const RaceEditions: CollectionConfig = {
  slug: 'race-editions',
  labels: {
    singular: { en: 'Race edition', 'zh-TW': '賽事屆次' },
    plural: { en: 'Race editions', 'zh-TW': '賽事屆次' },
  },
  defaultSort: '-year',
  admin: {
    useAsTitle: 'year',
    defaultColumns: ['event', 'year', 'startDate', 'location', 'verifiedAt'],
    group: { en: 'Races', 'zh-TW': '賽事' },
    description: {
      en: 'One row per running of a race. A row with no start date is a historical edition somebody has a record for — that is expected, not missing data.',
      'zh-TW':
        '一場賽事的每一屆一列。沒有日期的列是有人留下紀錄的歷史屆次 —— 那是預期的，不是漏填。',
    },
  },
  access: {
    read: (() => true) as Access,
    // Admin only, including create — and that is load-bearing. `/races` is
    // a public page reading this collection, so member write access would
    // let anyone put arbitrary rows on it. Members reach it only through
    // `populateRaceRecordRefs` (RaceRecords.ts, hooks.beforeChange), which
    // writes an event and a year via overrideAccess when a claim names a
    // combination with no existing edition — nothing else on the row is
    // ever set from member input.
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
    admin: ({ req }) => isAdminUser(req.user),
  },
  indexes: [{ fields: ['event', 'year'], unique: true }],
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
      name: 'year',
      type: 'number',
      label: { en: 'Year', 'zh-TW': '年份' },
      required: true,
      index: true,
      validate: (value: unknown) => {
        if (typeof value !== 'number' || !Number.isInteger(value)) {
          return 'Year is required.'
        }
        // Matches EARLIEST_RACE_YEAR's reasoning: members ran these races
        // before any series existed. Next year is allowed because entries
        // open well ahead.
        const latest = new Date().getUTCFullYear() + 1
        if (value < 2010 || value > latest) {
          return `Year must be between 2010 and ${latest}.`
        }
        return true
      },
    },
    {
      name: 'startDate',
      type: 'date',
      label: { en: 'Start date', 'zh-TW': '賽事日期' },
      index: true,
      admin: {
        date: { pickerAppearance: 'dayOnly', displayFormat: 'yyyy-MM-dd' },
        description: {
          en: 'Empty for a historical edition nobody recorded the dates of. It will not appear on /races, which is correct — it exists so a record can point at it.',
          'zh-TW':
            '沒人記下日期的歷史屆次就留空。它不會出現在 /races，那是對的 —— 它存在只是為了讓紀錄指得到。',
        },
      },
    },
    {
      name: 'endDate',
      type: 'date',
      label: { en: 'End date', 'zh-TW': '結束日期' },
      admin: {
        date: { pickerAppearance: 'dayOnly', displayFormat: 'yyyy-MM-dd' },
        description: {
          en: 'Multi-day events only. Leave empty for a single day.',
          'zh-TW': '只有多日賽事需要填。',
        },
      },
    },
    {
      name: 'nameOverride',
      type: 'text',
      label: { en: 'Name override', 'zh-TW': '名稱覆寫' },
      admin: {
        description: {
          en: 'Only when this edition was published under a different name than the event carries now. Otherwise leave empty and the event name is used.',
          'zh-TW':
            '只有這一屆當年公布的名稱和現在的賽事名稱不同才填，否則留空、直接用賽事名稱。',
        },
      },
    },
    { name: 'location', type: 'text', label: { en: 'Location', 'zh-TW': '地點' } },
    {
      name: 'url',
      type: 'text',
      label: { en: 'Edition website', 'zh-TW': '本屆網址' },
      admin: {
        description: {
          en: "Only if this edition has its own page. The event's own website lives on the event.",
          'zh-TW': '只有這一屆有自己的頁面才填；賽事官網放在賽事上。',
        },
      },
    },
    {
      name: 'registrationOpensAt',
      type: 'date',
      label: { en: 'Registration opens', 'zh-TW': '報名開放日期' },
      index: true,
      admin: {
        date: { pickerAppearance: 'dayOnly', displayFormat: 'yyyy-MM-dd' },
        description: {
          en: 'Leave empty if not announced. Never guess — a wrong date makes people miss entry.',
          'zh-TW': '尚未公布就留空。千萬不要猜 —— 錯的日期會害人錯過報名。',
        },
      },
    },
    {
      name: 'registrationClosesAt',
      type: 'date',
      label: { en: 'Registration closes', 'zh-TW': '報名截止日期' },
      admin: { date: { pickerAppearance: 'dayOnly', displayFormat: 'yyyy-MM-dd' } },
    },
    {
      name: 'registrationUrl',
      type: 'text',
      label: { en: 'Registration link', 'zh-TW': '報名連結' },
    },
    {
      name: 'registrationType',
      type: 'select',
      label: { en: 'Registration type', 'zh-TW': '報名方式' },
      defaultValue: 'first-come',
      options: [
        { label: { en: 'First come, first served', 'zh-TW': '先到先得' }, value: 'first-come' },
        { label: { en: 'Lottery', 'zh-TW': '抽籤制' }, value: 'lottery' },
        { label: { en: 'Qualifier required', 'zh-TW': '需資格賽' }, value: 'qualifier' },
        { label: { en: 'Invitational', 'zh-TW': '邀請制' }, value: 'invitational' },
      ],
    },
    {
      name: 'registrationStatusOverride',
      type: 'select',
      label: { en: 'Status override', 'zh-TW': '狀態覆寫' },
      options: [
        { label: { en: 'Full', 'zh-TW': '額滿' }, value: 'full' },
        { label: { en: 'Waitlist', 'zh-TW': '候補中' }, value: 'waitlist' },
        { label: { en: 'Cancelled', 'zh-TW': '取消' }, value: 'cancelled' },
        { label: { en: 'To be announced', 'zh-TW': '待公布' }, value: 'tba' },
      ],
      admin: {
        position: 'sidebar',
        description: {
          en: 'Only for what dates cannot express. Clear it once the race has run — the daily maintenance job clears stale ones.',
          'zh-TW': '只在日期表達不出來時才用。賽事結束後記得清掉。',
        },
      },
    },
    {
      name: 'sourceUrl',
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
    { name: 'notes', type: 'textarea', label: { en: 'Notes', 'zh-TW': '備註' } },
  ],
}
