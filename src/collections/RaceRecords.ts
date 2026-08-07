import type { Access, CollectionConfig } from 'payload'

import { isAdminUser, isAuthenticated, isOwner } from '../access'
import { ownerField } from '../fields/owner'
import { EARLIEST_RACE_YEAR } from '../lib/races/catalogue'
import { setOwner } from './hooks/owner'
import { uniqueRaceRecord } from './hooks/unique-race-record'
import { validateRaceCatalogueRef } from './hooks/validate-race-catalogue-ref'
import { populateRaceRecordRefs } from './hooks/populate-race-record-refs'
import { revalidateRaceRecord } from './hooks/revalidate'

/**
 * A race a member has finished: which event, which distance, which year.
 *
 * The event catalogue is `race-events`/`race-categories` — rows a person
 * reviews and edits, not `src/lib/races/catalogue.ts`. This collection
 * stores only the member's own claims: `eventId` and `distanceId` are keys
 * into those collections, checked against them on every write by
 * `validateRaceCatalogueRef`, not free text.
 *
 * `edition`/`category` are the real foreign keys derived from those strings
 * — see `populateRaceRecordRefs` for why both forms exist side by side.
 */
export const RaceRecords: CollectionConfig = {
  slug: 'race-records',
  labels: {
    singular: { en: 'Race record', 'zh-TW': '比賽紀錄' },
    plural: { en: 'Race records', 'zh-TW': '比賽紀錄' },
  },
  admin: {
    useAsTitle: 'eventId',
    defaultColumns: ['eventId', 'distanceId', 'year', 'owner'],
    group: { en: 'Members', 'zh-TW': '會員' },
  },
  access: {
    /**
     * Plainly public — NOT `ownedOnlyPublicRead`.
     *
     * That helper returns `true` for anonymous but narrows to
     * `{ owner: user.id }` for anyone signed in. Applied here it would mean
     * a signed-in member sees only their own badges and every other
     * member's profile looks empty to them — visible to the public, hidden
     * from the community it is for. R-T8 exists because that exact bug is
     * easy to ship; B-T4 pins it for this collection.
     *
     * Nothing here is private: a badge's whole purpose is to be seen.
     */
    read: (() => true) as Access,
    create: isAuthenticated,
    update: isOwner,
    delete: isOwner,
    // Hidden from the member-facing admin panel: read is public, so without
    // this every member would find a collection listing everyone's records
    // next to their own content. `/members/races` is where they manage it.
    // (`admin` must return a plain boolean, unlike the query-returning
    // access rules above.)
    admin: ({ req }) => isAdminUser(req.user),
  },
  hooks: {
    // `validateRaceCatalogueRef` before `uniqueRaceRecord`: report "this
    // event/distance does not exist" before "you already logged it" — a
    // duplicate check on values that are not even real is the wrong
    // complaint first.
    beforeValidate: [validateRaceCatalogueRef, uniqueRaceRecord],
    beforeChange: [setOwner, populateRaceRecordRefs],
    afterChange: [revalidateRaceRecord.afterChange],
    afterDelete: [revalidateRaceRecord.afterDelete],
  },
  fields: [
    ownerField,
    {
      name: 'eventId',
      type: 'text',
      label: { en: 'Event', 'zh-TW': '賽事' },
      required: true,
      index: true,
      // Presence only — whether the id resolves to a real event is
      // `validateRaceCatalogueRef`'s job, in `hooks.beforeValidate` above,
      // because it needs a database query this field-level validator has no
      // reason to duplicate.
      validate: (value: unknown) => {
        if (typeof value !== 'string' || value === '') return 'Event is required.'
        return true
      },
    },
    {
      name: 'distanceId',
      type: 'text',
      label: { en: 'Distance', 'zh-TW': '距離' },
      required: true,
      validate: (value: unknown) => {
        if (typeof value !== 'string' || value === '') return 'Distance is required.'
        return true
      },
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
        // Next year is allowed: entries open well ahead, and members sign up
        // before they run.
        const latest = new Date().getUTCFullYear() + 1
        if (value < EARLIEST_RACE_YEAR || value > latest) {
          return `Year must be between ${EARLIEST_RACE_YEAR} and ${latest}.`
        }
        return true
      },
    },
    {
      name: 'edition',
      type: 'relationship',
      relationTo: 'race-editions',
      label: { en: 'Edition', 'zh-TW': '屆次' },
      index: true,
      // System-derived, not member-settable: `populateRaceRecordRefs`
      // (hooks.beforeChange) resolves this from eventId/year on every
      // write, find-or-creating the edition when this is the first record
      // to claim it. See that hook for why the strings above stay
      // authoritative and this is additive, not a replacement.
      admin: {
        readOnly: true,
        description: {
          en: 'Resolved automatically from Event + Year. May point at an edition created just for this record.',
          'zh-TW': '由賽事＋年份自動解析。可能指向一個因這筆紀錄才建立的屆次。',
        },
      },
    },
    {
      name: 'category',
      type: 'relationship',
      relationTo: 'race-categories',
      label: { en: 'Category', 'zh-TW': '分項' },
      index: true,
      // Same derivation as `edition`, from eventId/distanceId.
      admin: {
        readOnly: true,
        description: {
          en: 'Resolved automatically from Event + Distance.',
          'zh-TW': '由賽事＋距離自動解析。',
        },
      },
    },
  ],
}
