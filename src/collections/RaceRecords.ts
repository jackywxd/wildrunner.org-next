import type { Access, CollectionConfig } from 'payload'

import { isAdminUser, isAuthenticated, isOwner } from '../access'
import { ownerField } from '../fields/owner'
import { EARLIEST_RACE_YEAR, findRaceEvent } from '../lib/races/catalogue'
import { setOwner } from './hooks/owner'
import { uniqueRaceRecord } from './hooks/unique-race-record'
import { revalidateRaceRecord } from './hooks/revalidate'

/**
 * A race a member has finished: which event, which distance, which year.
 *
 * The event catalogue itself lives in code (src/lib/races/catalogue.ts), so
 * this collection stores only the member's own claims — `eventId` and
 * `distanceId` are keys into that catalogue, not free text.
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
    beforeValidate: [uniqueRaceRecord],
    beforeChange: [setOwner],
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
      validate: (value: unknown) => {
        if (typeof value !== 'string' || value === '') return 'Event is required.'
        // Rejected at write time so junk never enters. Records already
        // stored are never re-validated unless edited, which is what lets a
        // catalogue entry be renamed without invalidating history — the
        // badge falls back to a neutral placeholder for those (A-T4).
        if (!findRaceEvent(value)) return `Unknown race event: ${value}`
        return true
      },
    },
    {
      name: 'distanceId',
      type: 'text',
      label: { en: 'Distance', 'zh-TW': '距離' },
      required: true,
      validate: (value: unknown, { data }: { data?: Partial<{ eventId: string }> }) => {
        if (typeof value !== 'string' || value === '') return 'Distance is required.'

        const event = data?.eventId ? findRaceEvent(data.eventId) : undefined
        // Unknown event — `eventId`'s own validator is already reporting it,
        // and repeating the complaint on both fields helps nobody.
        if (!event) return true

        if (!event.distances.some((distance) => distance.id === value)) {
          return `${event.name} has no distance "${value}"`
        }
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
  ],
}
