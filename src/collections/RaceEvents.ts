import type { Access, CollectionConfig } from 'payload'

import { isAdmin, isAdminUser } from '../access'
import { markHandEditedPoint, scheduleEventGeocode } from './hooks/geocode-race-event'

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
 *
 * WHERE ON THE MAP (`lat`, `lng` and the `geo*` fields). City-level only —
 * the 野馬足跡 map draws one dot per race, so the point is rounded to 0.1° and
 * never claims to be a start line. It is filled in automatically, from the
 * newest edition's location or else from a model's idea of the starting town,
 * then turned into coordinates by a geocoder (src/lib/geo/). The model never
 * supplies the numbers. `geoSource` says who is responsible for the point and
 * `manual` — set by editing the coordinates here — is never overwritten by
 * any automatic process. `geoStatus` is the admin's review queue: filter the
 * list on `no-place`, `not-found` or `failed` to see what still needs a person.
 */
/**
 * A coordinate is a number on the globe, and a point needs both of them. One
 * alone draws nothing and would still read as "has coordinates" to anything
 * checking `lat != null`.
 *
 * The range is checked HERE and not only by `min`/`max` on the field: a custom
 * `validate` replaces Payload's own number validation wholesale, so a field
 * that declares both gets only the custom one. Found by `M-GEO-T3`, which
 * posted latitude 91 to a field that said `max: 90` and got a 200.
 */
const coordinate =
  (self: 'lat' | 'lng') =>
  (value: unknown, { siblingData }: { siblingData: Record<string, unknown> }) => {
    const limit = self === 'lat' ? 90 : 180
    const has = (v: unknown) => v !== undefined && v !== null && v !== ''
    if (has(value)) {
      const n = Number(value)
      if (!Number.isFinite(n) || Math.abs(n) > limit) {
        return `${self === 'lat' ? 'Latitude' : 'Longitude'} must be between -${limit} and ${limit}.`
      }
      return true
    }
    if (has(siblingData?.[self === 'lat' ? 'lng' : 'lat'])) {
      return self === 'lat'
        ? 'Latitude is required when longitude is set.'
        : 'Longitude is required when latitude is set.'
    }
    return true
  }

export const RaceEvents: CollectionConfig = {
  slug: 'race-events',
  labels: {
    singular: { en: 'Race event', 'zh-TW': '賽事' },
    plural: { en: 'Race events', 'zh-TW': '賽事' },
  },
  defaultSort: 'name',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'key', 'series', 'country', 'geoStatus', 'verifiedAt'],
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
  hooks: {
    beforeChange: [markHandEditedPoint],
    afterChange: [scheduleEventGeocode],
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
      /**
       * One UltraSignup event title per line. The catalogue `name` is already
       * an alias. These exist for the titles that are a different string —
       * "Western States Endurance Run" against "Western States 100" — and
       * only after somebody has read both. A guessed line imports the wrong
       * finish for every member who fetches.
       */
      name: 'ultrasignupAliases',
      type: 'textarea',
      label: { en: 'UltraSignup names', 'zh-TW': 'UltraSignup 名稱' },
      admin: {
        description: {
          en: 'One event title per line, as UltraSignup prints it before the distance. Leave empty until you have read that page.',
          'zh-TW': '一行一個賽事名稱，寫 UltraSignup 在距離前面印的那段。沒對過頁面就留空。',
        },
      },
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
    {
      type: 'collapsible',
      label: { en: 'Map position', 'zh-TW': '地圖位置' },
      admin: {
        initCollapsed: false,
        description: {
          en: 'City-level, filled in automatically. Edit the coordinates to correct a dot — a hand-edited point is marked manual and no automatic process will move it. To hand it back, clear both coordinates and the source.',
          'zh-TW':
            '城市級位置，自動填入。手動改座標就能修正圓點 —— 手改過的會標成 manual，之後任何自動流程都不會動它。要交還給自動流程，把兩個座標和來源都清空。',
        },
      },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'lat',
              type: 'number',
              label: { en: 'Latitude', 'zh-TW': '緯度' },
              min: -90,
              max: 90,
              validate: coordinate('lat'),
            },
            {
              name: 'lng',
              type: 'number',
              label: { en: 'Longitude', 'zh-TW': '經度' },
              min: -180,
              max: 180,
              validate: coordinate('lng'),
            },
          ],
        },
        {
          name: 'geoPlace',
          type: 'text',
          label: { en: 'Place', 'zh-TW': '地點' },
          admin: {
            description: {
              en: 'The settlement the geocoder matched, e.g. Squamish.',
              'zh-TW': '地理編碼比對到的城鎮，例如 Squamish。',
            },
          },
        },
        {
          type: 'row',
          fields: [
            {
              name: 'geoSource',
              type: 'select',
              label: { en: 'Source', 'zh-TW': '來源' },
              options: [
                { label: { en: 'Edition location', 'zh-TW': '屆次地點' }, value: 'edition' },
                { label: { en: 'AI place name', 'zh-TW': 'AI 推測地名' }, value: 'ai' },
                { label: { en: 'Manual', 'zh-TW': '手動' }, value: 'manual' },
              ],
            },
            {
              name: 'geoStatus',
              type: 'select',
              label: { en: 'Status', 'zh-TW': '狀態' },
              options: [
                { label: { en: 'Placed', 'zh-TW': '已定位' }, value: 'ok' },
                { label: { en: 'No place name', 'zh-TW': '沒有地名' }, value: 'no-place' },
                { label: { en: 'Place not found', 'zh-TW': '查無此地' }, value: 'not-found' },
                { label: { en: 'Lookup failed', 'zh-TW': '查詢失敗' }, value: 'failed' },
              ],
              admin: {
                description: {
                  en: 'Filter the list on this to review what automation could not place.',
                  'zh-TW': '在列表用這個欄位篩選，檢視自動流程沒能定位的賽事。',
                },
              },
            },
          ],
        },
        {
          // `text` holding an ISO timestamp, NOT `type: 'date'`, and the reason
          // is a landmine: `20260829_041500_add_marathon_majors` reads this
          // collection with `payload.find` before the column exists on a fresh
          // database. Drizzle quotes column names with double quotes, and in
          // SQLite a double-quoted name that matches no column is silently a
          // string literal — so the missing column reads back as the text
          // "geocoded_at". A `text` field swallows that; a `date` field
          // runs `new Date("geocoded_at").toISOString()` and the whole
          // migration run dies with "Invalid time value" (found by `db:reset:local`).
          name: 'geocodedAt',
          type: 'text',
          label: { en: 'Looked up at', 'zh-TW': '查詢時間' },
          admin: {
            readOnly: true,
            description: {
              en: 'ISO timestamp of the last automatic lookup. Set by the system.',
              'zh-TW': '最近一次自動查詢的時間（ISO 格式），由系統寫入。',
            },
          },
        },
      ],
    },
  ],
}
