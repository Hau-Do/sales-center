import { describe, it, expect } from 'vitest'
import {
  CUSTOMER_CONTACT_TYPES,
  compareActivities,
  countByType,
  detectAnomalies,
  firstCustomerContact,
  groupActivitiesByDay,
  isCustomerContact,
  isUnworked,
  lastActivity,
  sortActivities,
  sortActivitiesDescending,
} from './activities'
import { type Instant, fromISO } from './instant'
import type { Activity, ActivityType } from './types'

const T = (iso: string): Instant => fromISO(iso)

/**
 * `recordedAt` defaults to `occurredAt` rather than to a fixed instant —
 * otherwise overriding only `occurredAt` to a later time silently produces a
 * "recorded before it occurred" anomaly in every fixture.
 */
function activity(overrides: Partial<Activity> & { id: string }): Activity {
  const occurredAt = overrides.occurredAt ?? T('2026-09-18T09:00:00Z')
  return {
    leadId: 'lead_0001',
    type: 'note',
    author: 'exec_01',
    ...overrides,
    occurredAt,
    recordedAt: overrides.recordedAt ?? occurredAt,
  }
}

describe('isCustomerContact()', () => {
  it('counts calls, emails and appointments as reaching the customer', () => {
    for (const type of ['call-outbound', 'email-sent', 'sms-sent', 'test-drive-booked'] as const) {
      expect(isCustomerContact(activity({ id: 'a', type }))).toBe(true)
    }
  })

  it('does not count a private note or a stage change', () => {
    expect(isCustomerContact(activity({ id: 'a', type: 'note' }))).toBe(false)
    expect(isCustomerContact(activity({ id: 'a', type: 'stage-changed' }))).toBe(false)
    expect(isCustomerContact(activity({ id: 'a', type: 'licence-check' }))).toBe(false)
  })

  it('lets an explicit flag override the type default', () => {
    expect(isCustomerContact(activity({ id: 'a', type: 'note', isCustomerContact: true }))).toBe(
      true,
    )
    expect(
      isCustomerContact(activity({ id: 'a', type: 'call-outbound', isCustomerContact: false })),
    ).toBe(false)
  })

  it('exposes the contact set for the UI to reuse', () => {
    expect(CUSTOMER_CONTACT_TYPES.has('call-outbound')).toBe(true)
    expect(CUSTOMER_CONTACT_TYPES.has('note')).toBe(false)
  })
})

describe('ordering', () => {
  it('sorts by when it occurred, oldest first', () => {
    const list = [
      activity({ id: 'c', occurredAt: T('2026-09-18T12:00:00Z') }),
      activity({ id: 'a', occurredAt: T('2026-09-18T09:00:00Z') }),
      activity({ id: 'b', occurredAt: T('2026-09-18T10:30:00Z') }),
    ]
    expect(sortActivities(list).map((a) => a.id)).toEqual(['a', 'b', 'c'])
    expect(sortActivitiesDescending(list).map((a) => a.id)).toEqual(['c', 'b', 'a'])
  })

  it('falls back to recordedAt when two things occurred at the same moment', () => {
    const list = [
      activity({ id: 'later', recordedAt: T('2026-09-18T15:10:00Z') }),
      activity({ id: 'sooner', recordedAt: T('2026-09-18T09:05:00Z') }),
    ]
    expect(sortActivities(list).map((a) => a.id)).toEqual(['sooner', 'later'])
  })

  it('falls back to id so the order is TOTAL, not merely consistent', () => {
    const same = { occurredAt: T('2026-09-18T09:00:00Z'), recordedAt: T('2026-09-18T09:00:00Z') }
    const list = [activity({ id: 'b', ...same }), activity({ id: 'a', ...same })]
    expect(sortActivities(list).map((a) => a.id)).toEqual(['a', 'b'])
    // Re-sorting an already-sorted list must not move anything.
    expect(sortActivities(sortActivities(list)).map((a) => a.id)).toEqual(['a', 'b'])
  })

  it('does not mutate its input', () => {
    const list = [
      activity({ id: 'c', occurredAt: T('2026-09-18T12:00:00Z') }),
      activity({ id: 'a', occurredAt: T('2026-09-18T09:00:00Z') }),
    ]
    sortActivities(list)
    expect(list.map((a) => a.id)).toEqual(['c', 'a'])
  })

  it('compareActivities returns 0 for the same activity', () => {
    const a = activity({ id: 'a' })
    expect(compareActivities(a, a)).toBe(0)
  })
})

describe('detectAnomalies()', () => {
  it('finds nothing wrong with a clean chain', () => {
    const a = activity({ id: 'a1', occurredAt: T('2026-09-18T09:00:00Z') })
    const b = activity({
      id: 'a2',
      occurredAt: T('2026-09-18T10:00:00Z'),
      previousActivityId: 'a1',
    })
    expect(detectAnomalies([a, b])).toEqual([])
  })

  it('flags an activity that occurred before the one it follows', () => {
    const a = activity({ id: 'a1', occurredAt: T('2026-09-18T11:00:00Z') })
    const b = activity({
      id: 'a2',
      occurredAt: T('2026-09-18T09:00:00Z'),
      previousActivityId: 'a1',
    })
    const found = detectAnomalies([a, b])
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ kind: 'inverted-chain', activityId: 'a2' })
  })

  it('flags a link to an activity that is not on this lead', () => {
    const b = activity({ id: 'a2', previousActivityId: 'missing_999' })
    const found = detectAnomalies([b])
    expect(found[0]).toMatchObject({ kind: 'orphaned-chain', activityId: 'a2' })
    expect(found[0]?.message).toMatch(/missing_999/)
  })

  it('flags a self-referential link without also calling it orphaned', () => {
    const found = detectAnomalies([activity({ id: 'a1', previousActivityId: 'a1' })])
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ kind: 'self-referential-chain', activityId: 'a1' })
  })

  it('flags an activity recorded before it occurred', () => {
    const found = detectAnomalies([
      activity({
        id: 'a1',
        occurredAt: T('2026-09-18T12:00:00Z'),
        recordedAt: T('2026-09-18T09:00:00Z'),
      }),
    ])
    expect(found[0]).toMatchObject({ kind: 'recorded-before-occurred', activityId: 'a1' })
  })

  it('flags two activities claiming to follow the same one', () => {
    const a = activity({ id: 'a1', occurredAt: T('2026-09-18T09:00:00Z') })
    const b = activity({
      id: 'a2',
      occurredAt: T('2026-09-18T10:00:00Z'),
      previousActivityId: 'a1',
    })
    const c = activity({
      id: 'a3',
      occurredAt: T('2026-09-18T11:00:00Z'),
      previousActivityId: 'a1',
    })
    const found = detectAnomalies([a, b, c])
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ kind: 'duplicate-chain-target', activityId: 'a1' })
    expect(found[0]?.message).toMatch(/2 activities/)
  })

  it('is deterministic across repeated calls', () => {
    const list = [
      activity({ id: 'a1', occurredAt: T('2026-09-18T11:00:00Z') }),
      activity({ id: 'a2', occurredAt: T('2026-09-18T09:00:00Z'), previousActivityId: 'a1' }),
      activity({ id: 'a3', previousActivityId: 'gone' }),
    ]
    expect(detectAnomalies(list)).toEqual(detectAnomalies(list))
  })

  it('handles an empty list', () => {
    expect(detectAnomalies([])).toEqual([])
  })
})

describe('groupActivitiesByDay()', () => {
  it('groups by London calendar day, newest day first', () => {
    const groups = groupActivitiesByDay([
      activity({ id: 'a', occurredAt: T('2026-09-17T10:00:00Z') }),
      activity({ id: 'b', occurredAt: T('2026-09-18T10:00:00Z') }),
      activity({ id: 'c', occurredAt: T('2026-09-18T14:00:00Z') }),
    ])
    expect(groups.map((g) => g.dateKey)).toEqual(['2026-09-18', '2026-09-17'])
    expect(groups[0]?.activities.map((a) => a.id)).toEqual(['c', 'b'])
  })

  it('uses the London day, so a late-evening BST activity lands on the right date', () => {
    // 23:30Z on the 17th is 00:30 on the 18th in London.
    const groups = groupActivitiesByDay([
      activity({ id: 'a', occurredAt: T('2026-07-17T23:30:00Z') }),
    ])
    expect(groups[0]?.dateKey).toBe('2026-07-18')
  })

  it('handles an empty list', () => {
    expect(groupActivitiesByDay([])).toEqual([])
  })
})

describe('firstCustomerContact()', () => {
  const received = T('2026-09-18T09:00:00Z')

  it('finds the earliest activity that actually reached the customer', () => {
    const list = [
      activity({ id: 'note', type: 'note', occurredAt: T('2026-09-18T09:05:00Z') }),
      activity({ id: 'call', type: 'call-outbound', occurredAt: T('2026-09-18T09:20:00Z') }),
      activity({ id: 'email', type: 'email-sent', occurredAt: T('2026-09-18T09:40:00Z') }),
    ]
    expect(firstCustomerContact(list, received)?.id).toBe('call')
  })

  it('ignores contact back-dated before the enquiry landed', () => {
    const list = [
      activity({ id: 'earlier', type: 'call-outbound', occurredAt: T('2026-09-18T08:00:00Z') }),
      activity({ id: 'valid', type: 'call-outbound', occurredAt: T('2026-09-18T09:30:00Z') }),
    ]
    expect(firstCustomerContact(list, received)?.id).toBe('valid')
  })

  it('returns undefined when only internal notes exist', () => {
    const list = [activity({ id: 'n', type: 'note', occurredAt: T('2026-09-18T09:05:00Z') })]
    expect(firstCustomerContact(list, received)).toBeUndefined()
    expect(isUnworked(list, received)).toBe(true)
  })

  it('counts a lead with real contact as worked', () => {
    const list = [
      activity({ id: 'c', type: 'call-outbound', occurredAt: T('2026-09-18T09:10:00Z') }),
    ]
    expect(isUnworked(list, received)).toBe(false)
  })

  it('treats contact exactly at the received instant as valid', () => {
    const list = [activity({ id: 'c', type: 'call-outbound', occurredAt: received })]
    expect(firstCustomerContact(list, received)?.id).toBe('c')
  })
})

describe('lastActivity() and countByType()', () => {
  it('returns the most recent activity', () => {
    const list = [
      activity({ id: 'a', occurredAt: T('2026-09-18T09:00:00Z') }),
      activity({ id: 'b', occurredAt: T('2026-09-18T12:00:00Z') }),
    ]
    expect(lastActivity(list)?.id).toBe('b')
    expect(lastActivity([])).toBeUndefined()
  })

  it('counts activities by type', () => {
    const list = [
      activity({ id: 'a', type: 'call-outbound' }),
      activity({ id: 'b', type: 'call-outbound' }),
      activity({ id: 'c', type: 'email-sent' }),
    ]
    expect(countByType(list)).toEqual({ 'call-outbound': 2, 'email-sent': 1 })
    expect(countByType([])).toEqual({})
  })

  it('covers every declared activity type without throwing', () => {
    const types: ActivityType[] = [
      'showroom-appointment-booked',
      'test-drive-booked',
      'quotation-made',
      'handover-completed',
      'lost-sale',
      'note',
      'stage-changed',
    ]
    const list = types.map((type, i) => activity({ id: `a${i}`, type }))
    expect(Object.keys(countByType(list))).toHaveLength(types.length)
  })
})
