import type { CollectionBeforeValidateHook, CollectionConfig } from 'payload'
import { APIError } from 'payload'

import { isAdminFieldLevel, isAdminUser, isAuthenticated, isOwner } from '../access'
import { ownerField } from '../fields/owner'
import { setOwner } from './hooks/owner'

/**
 * A member asking for a race to be added to the catalogue.
 *
 * Filed from the UltraSignup import, on a row whose race (or distance) the
 * catalogue does not have. It is a request and nothing more: approving one
 * does not write the catalogue. An admin reads the UltraSignup title, finds
 * the race's real page, adds the event and its categories the way every
 * other catalogue row is added — with a source and a verified date, see
 * docs/race-data-sources.md — and only then marks this approved and links
 * the event. Catalogue text taken straight from a results title is how
 * "Ultra Trail Du Mont Blanc by UTMB" would become a second UTMB.
 *
 * The member sees the status on the row they filed it from. After approval
 * they read their results again and the row matches like any other; nothing
 * here imports on their behalf.
 *
 * NOT PUBLIC. Read is the owner or an admin (`isOwner` returns false for an
 * anonymous request): the title and date say which race a named member ran.
 * Members create; only admins change status, link the event or write the
 * note — field access strips those from a member's create, so a request
 * cannot arrive already approved.
 */

/**
 * One open request per member per UltraSignup row. A refused one does not
 * count: the member may ask again once whatever the note said is fixed.
 */
const oneOpenRequestPerRow: CollectionBeforeValidateHook = async ({ data, operation, req }) => {
  if (operation !== 'create' || !req.user || !data) return data
  const title = typeof data.ultrasignupTitle === 'string' ? data.ultrasignupTitle : ''
  const raceDate = typeof data.raceDate === 'string' ? data.raceDate : ''
  const existing = await req.payload.find({
    collection: 'race-catalogue-requests',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    req,
    where: {
      and: [
        { owner: { equals: req.user.id } },
        { ultrasignupTitle: { equals: title } },
        { raceDate: { equals: raceDate } },
        { status: { not_equals: 'rejected' } },
      ],
    },
  })
  if (existing.docs.length > 0) throw new APIError('這場已經申請過了。', 409)
  return data
}

export const RaceCatalogueRequests: CollectionConfig = {
  slug: 'race-catalogue-requests',
  labels: {
    singular: { en: 'Catalogue request', 'zh-TW': '目錄申請' },
    plural: { en: 'Catalogue requests', 'zh-TW': '目錄申請' },
  },
  admin: {
    useAsTitle: 'ultrasignupTitle',
    defaultColumns: ['ultrasignupTitle', 'raceDate', 'reason', 'status', 'owner'],
    group: { en: 'Races', 'zh-TW': '賽事' },
    description: {
      en: 'Races members asked to have added, from their UltraSignup results. Add the event and categories from the race\'s own page first, then approve here and link the event.',
      'zh-TW': '會員從 UltraSignup 成績申請加入目錄的賽事。先依賽事官網新增賽事和分項，再回來批准並連結賽事。',
    },
  },
  access: {
    read: isOwner,
    create: isAuthenticated,
    update: ({ req }) => isAdminUser(req.user),
    delete: ({ req }) => isAdminUser(req.user),
    admin: ({ req }) => isAdminUser(req.user),
  },
  hooks: {
    beforeValidate: [oneOpenRequestPerRow],
    beforeChange: [setOwner],
  },
  fields: [
    ownerField,
    {
      name: 'ultrasignupTitle',
      type: 'text',
      label: { en: 'UltraSignup title', 'zh-TW': 'UltraSignup 標題' },
      required: true,
      maxLength: 200,
      admin: { readOnly: true },
    },
    {
      name: 'eventName',
      type: 'text',
      label: { en: 'Event (as UltraSignup names it)', 'zh-TW': '賽事（UltraSignup 寫法）' },
      required: true,
      maxLength: 200,
      admin: { readOnly: true },
    },
    {
      name: 'distanceText',
      type: 'text',
      label: { en: 'Distance (as UltraSignup names it)', 'zh-TW': '距離（UltraSignup 寫法）' },
      maxLength: 100,
      admin: { readOnly: true },
    },
    {
      name: 'raceDate',
      type: 'text',
      label: { en: 'Race date', 'zh-TW': '比賽日期' },
      required: true,
      admin: { readOnly: true },
      validate: (value: unknown) =>
        typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
          ? true
          : 'Date must be YYYY-MM-DD.',
    },
    {
      // What the catalogue lacked: the whole race, or only this distance of
      // a race it has.
      name: 'reason',
      type: 'select',
      label: { en: 'Missing', 'zh-TW': '缺少' },
      required: true,
      options: [
        { label: { en: 'The race', 'zh-TW': '賽事' }, value: 'event' },
        { label: { en: 'This distance', 'zh-TW': '分項' }, value: 'distance' },
      ],
      admin: { readOnly: true },
    },
    {
      name: 'status',
      type: 'select',
      label: { en: 'Status', 'zh-TW': '狀態' },
      required: true,
      defaultValue: 'pending',
      index: true,
      access: { create: isAdminFieldLevel, update: isAdminFieldLevel },
      options: [
        { label: { en: 'Pending', 'zh-TW': '待審核' }, value: 'pending' },
        { label: { en: 'Approved', 'zh-TW': '已批准' }, value: 'approved' },
        { label: { en: 'Rejected', 'zh-TW': '已拒絕' }, value: 'rejected' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'event',
      type: 'relationship',
      relationTo: 'race-events',
      label: { en: 'Catalogue event', 'zh-TW': '目錄賽事' },
      access: { create: isAdminFieldLevel, update: isAdminFieldLevel },
      admin: {
        position: 'sidebar',
        description: {
          en: 'The event this request became. If UltraSignup\'s title differs from the event name, add it to the event\'s UltraSignup aliases too, or the member\'s row still will not match.',
          'zh-TW': '這筆申請最後對應的賽事。UltraSignup 標題和賽事名稱不同時，也要加進該賽事的 UltraSignup 別名，否則會員那一行仍然對不上。',
        },
      },
    },
    {
      // Shown to the member on a rejected row, so it is written for them.
      name: 'adminNote',
      type: 'textarea',
      label: { en: 'Note to the member', 'zh-TW': '給會員的說明' },
      access: { create: isAdminFieldLevel, update: isAdminFieldLevel },
    },
  ],
}
