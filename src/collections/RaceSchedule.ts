import type { Access, CollectionConfig } from 'payload'

import { isAdmin, isAdminUser } from '../access'
import {
  RACE_SERIES_LABELS,
  RACE_SERIES_LABELS_ZH,
  SCHEDULE_SERIES,
  findRaceEvent,
} from '../lib/races/catalogue'
import { uniqueScheduleEntry } from './hooks/unique-schedule-entry'
import { revalidateRaceSchedule } from './hooks/revalidate'

/**
 * A dated race edition: when it runs, where, and whether you can still enter.
 *
 * THE SPLIT WITH THE CATALOGUE. `src/lib/races/catalogue.ts` owns a race's
 * *identity* — the id a member's badge points at, which must never change.
 * This collection owns a race's *edition* — the 2026 running of it, with a
 * date and a registration window that change every year and must be
 * editable without a deploy. `eventId` links the two, and it is REQUIRED.
 *
 * It used to be optional, on the reasoning that a row with no catalogue
 * entry still renders fine — it just shows no badge. That stopped being
 * true when race reports were tied to race records: a member writes a
 * report by picking a finished race, and the record behind it needs an
 * event and a distance, both of which come from the catalogue. A row with
 * no `eventId` is therefore a race nobody can write about, silently — the
 * button is simply absent and nothing says why. Five such rows existed
 * (Whistler, Sinister 7, Canadian Death Race, Squamish 50, Ticino
 * Wildlands); all five were added to the catalogue instead.
 *
 * The cost is that scheduling a brand-new race is no longer purely an admin
 * action — it needs a catalogue line first, which is a deploy. That is the
 * intended trade: the catalogue is what a badge id points at forever, so
 * inventing one from a text box was never safe anyway.
 *
 * It also means the two can disagree on purpose. Western States is a UTMB
 * World Series event and its catalogue id says so, but a schedule row for
 * it may be tagged `others` if that reads better on the page — the row
 * stores its own `series` rather than deriving it, precisely so the
 * presentation can differ from the badge without renaming anything.
 *
 * NO DRAFTS. `versions: { drafts: true }` would double the schema (a whole
 * `_race_schedule_v` table mirroring every column) to buy an editorial
 * workflow this content does not have: a race either runs on a day or it
 * does not, and visibility is decided by the date window the page queries.
 * If staging next season privately ever becomes a real need, a `published`
 * checkbox is the cheap answer, not the versions machinery.
 *
 * NO OWNER. This is site-wide reference data, closer to the Site global
 * than to a member's post. Adding `ownerField` would put a `users`
 * relationship on a collection the public page reads, which is the PII
 * footgun src/lib/content.ts opens by warning about.
 *
 * DATA ACCURACY. There is no official API for any of this — UTMB, World
 * Trail Majors and the independent races all publish web pages only — so
 * every row is hand-curated and will go stale. `sourceUrl` and `verifiedAt`
 * exist so a row can be re-checked without archaeology, and the daily
 * maintenance endpoint (src/endpoints/raceScheduleMaintenance.ts) reports
 * the ones that have not been looked at lately. Deliberately NOT scraped:
 * with no stable API and a different page structure per organiser, a
 * scraper breaks silently and writes wrong dates, which is worse than
 * having none. Leave a field empty rather than guessing at it.
 */

// SCHEDULE_SERIES, not RACE_SERIES. This is the legacy trail schedule; the
// `marathon` series exists only so six road races can be recorded, and they
// are never scheduled here — offering the option would invite a row that
// nothing reads.
const seriesOptions = SCHEDULE_SERIES.map((value) => ({
  label: { en: RACE_SERIES_LABELS[value], 'zh-TW': RACE_SERIES_LABELS_ZH[value] },
  value,
}))

/** Payload gives a date field a full ISO string; the calendar day is what matters. */
const day = (value: unknown): string | null =>
  typeof value === 'string' && value.length >= 10 ? value.slice(0, 10) : null

/**
 * Link fields must be absolute http(s) URLs.
 *
 * Typing a bare domain is the natural thing to do and silently produces a
 * link to nowhere: `hardrock100.com` in an href is *relative*, so it
 * resolves against our own origin and lands on wildrunner.org/hardrock100.com,
 * a 404 on our own site. The browser gives no hint, and neither did we.
 *
 * Rejected rather than auto-prefixed: guessing `https://` is right almost
 * always, and silently rewriting what somebody typed is how "almost" turns
 * into a wrong link nobody looks at again.
 */
const validateHttpUrl = (value: unknown): true | string => {
  if (value === undefined || value === null || value === '') return true
  if (typeof value !== 'string') return 'Link must be text.'
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return `Link must start with https:// — "${value}" is read as a path on this site, not an external address.`
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return `Link must be http(s), got "${parsed.protocol}".`
  }
  return true
}

export const RaceSchedule: CollectionConfig = {
  slug: 'race-schedule',
  // Sorted by date rather than by creation order, so the admin list reads
  // as a schedule. `defaultSort` is a top-level option here, not an
  // `admin.*` one — putting it under `admin` type-errors.
  defaultSort: 'startDate',
  labels: {
    singular: { en: 'Race schedule entry', 'zh-TW': '賽事場次' },
    plural: { en: 'Race schedule', 'zh-TW': '賽事日程' },
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'series', 'startDate', 'country', 'verifiedAt'],
    group: { en: 'Races', 'zh-TW': '賽事' },
    description: {
      en: 'Upcoming races shown on /races. Dates and registration windows change often — leave a field empty rather than guessing, and update "Verified on" whenever you check a row against the official site.',
      'zh-TW':
        '/races 頁面顯示的賽事。日期與報名時間經常異動 —— 查不到就留空，不要猜；每次對照官網確認過後，記得更新「最後確認日期」。',
    },
  },
  access: {
    // Public reference data with no PII. The date window, not access
    // control, is what decides which rows a visitor sees.
    read: (() => true) as Access,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
    // Members have no business here, and leaving it visible would put a
    // site-wide collection in their admin sidebar next to their own content.
    admin: ({ req }) => isAdminUser(req.user),
  },
  hooks: {
    beforeValidate: [uniqueScheduleEntry],
    afterChange: [revalidateRaceSchedule.afterChange],
    afterDelete: [revalidateRaceSchedule.afterDelete],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      label: { en: 'Name', 'zh-TW': '賽事名稱' },
      required: true,
      admin: {
        description: {
          en: 'Stored even when linked to a catalogue event — renaming a catalogue entry must not rewrite a published schedule.',
          'zh-TW': '即使已連結賽事目錄也照樣儲存 —— 目錄改名不該悄悄改寫已公布的日程。',
        },
      },
    },
    {
      name: 'nameZh',
      type: 'text',
      label: { en: 'Name (Chinese)', 'zh-TW': '中文名稱' },
    },
    {
      name: 'series',
      type: 'select',
      label: { en: 'Series', 'zh-TW': '系列' },
      required: true,
      index: true,
      defaultValue: 'others',
      options: seriesOptions,
    },
    {
      name: 'startDate',
      type: 'date',
      label: { en: 'Start date', 'zh-TW': '賽事日期' },
      required: true,
      index: true,
      admin: { date: { pickerAppearance: 'dayOnly', displayFormat: 'yyyy-MM-dd' } },
    },
    {
      name: 'endDate',
      type: 'date',
      label: { en: 'End date', 'zh-TW': '結束日期' },
      admin: {
        date: { pickerAppearance: 'dayOnly', displayFormat: 'yyyy-MM-dd' },
        description: {
          en: 'Multi-day events only. Leave empty for a single day.',
          'zh-TW': '只有多日賽事需要填。單日賽事請留空。',
        },
      },
      validate: (value: unknown, { data }: { data?: Partial<{ startDate: unknown }> }) => {
        const end = day(value)
        if (!end) return true
        const start = day(data?.startDate)
        if (!start) return true
        if (end < start) return 'End date is before the start date.'
        // A mistyped year here would stripe the whole calendar. 21 days is
        // well past the longest stage race anyone schedules here.
        const spanDays =
          (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000
        if (spanDays > 21) return 'End date is more than 21 days after the start — check the year.'
        return true
      },
    },
    {
      name: 'eventId',
      type: 'text',
      label: { en: 'Catalogue event', 'zh-TW': '賽事目錄代碼' },
      index: true,
      admin: {
        description: {
          en: 'Required. An id from the race catalogue (e.g. utmb-mont-blanc). Without it this race can carry no badge and no member can write a report about it. If the race is not in the catalogue yet, add it to src/lib/races/catalogue.ts first.',
          'zh-TW':
            '必填。賽事目錄裡的代碼（例如 utmb-mont-blanc）。沒有它，這場賽事就沒有徽章，會員也無法寫賽記。目錄裡還沒有的話，要先加進 src/lib/races/catalogue.ts。',
        },
      },
      /**
       * Enforced here rather than with `required: true`.
       *
       * `required` on a text field makes drizzle emit NOT NULL, and adding
       * NOT NULL to an existing SQLite column means a full table rebuild —
       * create, copy, drop, rename — for a constraint this validator
       * already enforces on every write that goes through Payload. Nothing
       * writes to this collection except Payload and the seed script, which
       * also goes through Payload. The rebuild would buy a guarantee
       * against a writer that does not exist, at the cost of the riskiest
       * migration shape D1 has.
       */
      validate: (value: unknown) => {
        if (value === undefined || value === null || value === '') {
          return 'Catalogue event is required — add the race to src/lib/races/catalogue.ts if it is not there yet.'
        }
        if (typeof value !== 'string') return 'Catalogue event must be text.'
        if (!findRaceEvent(value)) return `Unknown race event: ${value}`
        return true
      },
    },
    {
      name: 'country',
      type: 'text',
      label: { en: 'Country', 'zh-TW': '國家' },
      admin: {
        description: { en: 'ISO 3166-1 alpha-3, e.g. FRA.', 'zh-TW': 'ISO 3166-1 三碼國碼，例如 FRA。' },
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
      name: 'location',
      type: 'text',
      label: { en: 'Location', 'zh-TW': '地點' },
    },
    {
      name: 'distanceSummary',
      type: 'text',
      label: { en: 'Distances', 'zh-TW': '距離' },
      admin: {
        description: {
          en: 'Free text, e.g. "20K / 50K / 100K / 100M". Deliberately not the catalogue distance enum, so a race outside the catalogue can still be scheduled.',
          'zh-TW':
            '自由文字，例如「20K / 50K / 100K / 100M」。刻意不用目錄的距離選項，目錄以外的賽事才排得進來。',
        },
      },
    },
    {
      name: 'url',
      type: 'text',
      label: { en: 'Official website', 'zh-TW': '官方網站' },
      admin: {
        description: {
          en: 'Full address including https://',
          'zh-TW': '完整網址，含 https://',
        },
      },
      validate: validateHttpUrl,
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
      validate: (
        value: unknown,
        { data }: { data?: Partial<{ registrationOpensAt: unknown; startDate: unknown }> },
      ) => {
        const closes = day(value)
        if (!closes) return true
        const opens = day(data?.registrationOpensAt)
        if (opens && closes < opens) return 'Registration closes before it opens.'
        const start = day(data?.startDate)
        if (start && closes > start) return 'Registration closes after the race has run.'
        return true
      },
    },
    {
      name: 'registrationUrl',
      type: 'text',
      label: { en: 'Registration link', 'zh-TW': '報名連結' },
      admin: {
        description: {
          en: 'Separate from the official site — many races register through a third-party platform. Falls back to the official site when empty.',
          'zh-TW': '與官網分開 —— 很多賽事透過第三方平台報名。留空時前端會退回顯示官網。完整網址，含 https://',
        },
      },
      validate: validateHttpUrl,
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
      admin: {
        description: {
          en: 'Hardrock, Western States and UTMB Mont-Blanc are lotteries — saying only "open" would mislead.',
          'zh-TW': 'Hardrock、Western States、UTMB Mont-Blanc 都是抽籤制，只寫「報名中」會誤導。',
        },
      },
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
          en: 'Only for what dates cannot express. Setting this overrides the date-derived status, so clear it once the race has run — the daily maintenance job clears stale ones.',
          'zh-TW':
            '只在日期表達不出來時才用。設了就會蓋掉由日期推導的狀態，賽事結束後記得清掉 —— 每日維護工作會清理過期的覆寫。',
        },
      },
    },
    {
      name: 'sourceUrl',
      type: 'text',
      label: { en: 'Source', 'zh-TW': '資料來源' },
      admin: {
        position: 'sidebar',
        description: {
          en: 'Where this row was copied from. For re-checking later, not shown to visitors.',
          'zh-TW': '這筆資料是從哪裡抄來的。供日後查證用，不會顯示給訪客。',
        },
      },
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
          en: 'Set to today whenever you check this row against the official site.',
          'zh-TW': '每次對照官網確認過，就把它改成今天。',
        },
      },
    },
    {
      name: 'notes',
      type: 'textarea',
      label: { en: 'Notes', 'zh-TW': '備註' },
    },
  ],
}
