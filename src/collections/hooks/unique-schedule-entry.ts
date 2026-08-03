import type { CollectionBeforeValidateHook, Where } from 'payload'
import { ValidationError } from 'payload'

/**
 * Reject a race edition that is already on the schedule.
 *
 * The natural key is (eventId or name, startDate): one race runs once on a
 * given day. It cannot be a database UNIQUE constraint because the first
 * component is whichever of two columns happens to be filled, so like
 * `uniqueRaceRecord` this hook is the only guard.
 *
 * Why it matters more here than for a member's own records: the schedule is
 * seeded by a script and edited by hand, and a duplicate does not just look
 * untidy — it renders the race twice in the list and twice in the calendar
 * cell, which reads as a data error to every visitor rather than to one
 * member.
 *
 * Unlike race records there is no owner to scope by: the schedule is
 * site-wide, so a clash is a clash regardless of who is writing.
 */
export const uniqueScheduleEntry: CollectionBeforeValidateHook = async ({
  data,
  originalDoc,
  req,
}) => {
  if (!data) return data

  const startDate = data.startDate
  if (!startDate) return data

  // Payload stores a date field as a full ISO string. Compare on the
  // calendar day so 2026-08-28T00:00:00.000Z and a hand-typed
  // 2026-08-28T12:00:00.000Z are recognised as the same edition — the field
  // uses a day-only picker, but the REST API accepts anything.
  const day = String(startDate).slice(0, 10)

  const identity: Where | null = data.eventId
    ? { eventId: { equals: data.eventId } }
    : data.name
      ? { name: { equals: data.name } }
      : null
  if (!identity) return data

  const existing = await req.payload.find({
    collection: 'race-schedule',
    where: {
      and: [
        identity,
        // A range rather than an equality: the stored value carries a time
        // component, so `equals` on a bare date would miss.
        { startDate: { greater_than_equal: `${day}T00:00:00.000Z` } },
        { startDate: { less_than_equal: `${day}T23:59:59.999Z` } },
      ],
    },
    limit: 1,
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
  })

  const clash = existing.docs[0]
  const currentId = (originalDoc as { id?: number } | undefined)?.id
  if (clash && clash.id !== currentId) {
    throw new ValidationError({
      errors: [{ path: 'startDate', message: '這場賽事在這一天已經排過了。' }],
      req,
    })
  }

  return data
}
