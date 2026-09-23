import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setupServer } from 'msw/node'
import { createStore } from '@/data/store'
import { memoryDb } from '@/data/db'
import { createHandlers } from './handlers'
import { api, ApiError } from '@/api/client'
import { resetCorrelationIds } from '@/observability/correlation'
import { fromISO } from '@/domain/instant'
import { DEMO_NOW } from './seed/generate'
import { allowConsoleError } from '@/test/setup'

/*
 * Integration tests for the mock API, driven through the REAL client.
 *
 * These go through fetch, the handlers and the store — the same path the
 * browser takes. That is the point: it proves the client's URL building, the
 * handlers' routing and the store's persistence agree with each other, which
 * unit tests of any one layer cannot.
 */
const store = createStore(memoryDb())
const server = setupServer(...createHandlers(store))

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())

beforeEach(() => {
  server.resetHandlers()
  resetCorrelationIds()
  store.reset({ scenario: 'default', now: DEMO_NOW })
})

const anchor = (reference: string) => {
  const lead = store.leads().find((l) => l.reference === reference)
  if (!lead) throw new Error(`no anchor lead ${reference}`)
  return lead
}

describe('GET /reference', () => {
  it('returns sites, executives and the frozen clock', async () => {
    const data = await api.reference()
    expect(data.sites.length).toBeGreaterThan(0)
    expect(data.executives.length).toBeGreaterThan(0)
    expect(data.meta.now).toBe(DEMO_NOW)
    expect(data.meta.scenario).toBe('default')
  })
})

describe('GET /leads', () => {
  it('returns the whole inbox', async () => {
    const { leads, total } = await api.listLeads()
    expect(leads.length).toBe(total)
    expect(total).toBeGreaterThan(100)
  })

  it('filters by status', async () => {
    const open = await api.listLeads({ status: 'open' })
    expect(open.leads.every((l) => l.status.kind === 'open')).toBe(true)
    expect(open.total).toBeLessThan((await api.listLeads()).total)
  })

  it('filters by site', async () => {
    const { leads } = await api.listLeads({ siteId: 'site_woking' })
    expect(leads.length).toBeGreaterThan(0)
    expect(leads.every((l) => l.siteId === 'site_woking')).toBe(true)
  })
})

describe('GET /leads/:id', () => {
  it('returns a lead with its activities', async () => {
    const target = anchor('ENQ-4106')
    const { lead, activities } = await api.getLead(target.id)
    expect(lead.id).toBe(target.id)
    expect(activities.length).toBeGreaterThan(0)
    expect(activities.every((a) => a.leadId === target.id)).toBe(true)
  })

  it('404s for an unknown lead, with a remedy the UI can render', async () => {
    // The client logs every failed response; this test is exercising that path.
    allowConsoleError()
    await expect(api.getLead('lead_nope')).rejects.toThrow(ApiError)
    await api.getLead('lead_nope').catch((error: unknown) => {
      expect(error).toBeInstanceOf(ApiError)
      if (error instanceof ApiError) {
        expect(error.status).toBe(404)
        expect(error.detail.code).toBe('NOT_FOUND')
        expect(error.detail.remedy).toBeTruthy()
      }
    })
  })
})

describe('POST /leads/:id/activities', () => {
  it('persists a logged activity and returns it', async () => {
    const target = anchor('ENQ-4101')
    const before = (await api.listActivities(target.id)).activities.length

    const { activity } = await api.logActivity(target.id, {
      type: 'call-outbound',
      note: 'Called the customer about the 320d.',
      outcome: 'connected',
    })

    expect(activity.type).toBe('call-outbound')
    expect(activity.note).toBe('Called the customer about the 320d.')
    expect(activity.leadId).toBe(target.id)

    const after = await api.listActivities(target.id)
    expect(after.activities.length).toBe(before + 1)
    expect(after.activities.some((a) => a.id === activity.id)).toBe(true)
  })

  it('chains the new activity onto the previous one', async () => {
    const target = anchor('ENQ-4104')
    const existing = (await api.listActivities(target.id)).activities
    const { activity } = await api.logActivity(target.id, {
      type: 'email-sent',
      note: 'Sent quote',
    })
    expect(activity.previousActivityId).toBe(existing[existing.length - 1]?.id)
  })

  it('stops the SLA clock the first time a real contact is logged', async () => {
    const target = anchor('ENQ-4101')
    expect(target.firstRespondedAt).toBeUndefined()

    const { lead } = await api.logActivity(target.id, { type: 'call-outbound', note: 'Called' })
    expect(lead.firstRespondedAt).toBeDefined()
    expect(lead.firstRespondedAt).toBe(DEMO_NOW)
  })

  it('does NOT stop the clock for an internal note', async () => {
    const target = anchor('ENQ-4102')
    const { lead } = await api.logActivity(target.id, { type: 'note', note: 'Internal reminder' })
    expect(lead.firstRespondedAt).toBeUndefined()
  })

  it('does not move an already-recorded first response', async () => {
    const target = anchor('ENQ-4104')
    const original = target.firstRespondedAt
    const { lead } = await api.logActivity(target.id, { type: 'call-outbound', note: 'Follow-up' })
    expect(lead.firstRespondedAt).toBe(original)
  })

  it('records a licence check onto the lead, unblocking the test-drive guard', async () => {
    const target = anchor('ENQ-4105')
    expect(target.licenceCheckedAt).toBeUndefined()
    const { lead } = await api.logActivity(target.id, { type: 'licence-check' })
    expect(lead.licenceCheckedAt).toBe(DEMO_NOW)
  })

  it('rejects an unknown activity type with 422 and a remedy', async () => {
    // The client logs every failed response; this test is exercising that path.
    allowConsoleError()
    const target = anchor('ENQ-4101')
    await api
      .logActivity(target.id, { type: 'teleportation' as never })
      .then(() => expect.unreachable('should have been rejected'))
      .catch((error: unknown) => {
        expect(error).toBeInstanceOf(ApiError)
        if (error instanceof ApiError) {
          expect(error.status).toBe(422)
          expect(error.detail.code).toBe('INVALID_ACTIVITY_TYPE')
        }
      })
  })
})

describe('PATCH /leads/:id/stage', () => {
  it('moves a lead forward', async () => {
    const target = anchor('ENQ-4101')
    const { lead } = await api.moveStage(target.id, 'contacted')
    expect(lead.stage).toBe('contacted')
    expect(lead.lastStageChangeAt).toBe(DEMO_NOW)
  })

  it('records a stage-changed activity on the timeline', async () => {
    const target = anchor('ENQ-4101')
    await api.moveStage(target.id, 'contacted')
    const { activities } = await api.listActivities(target.id)
    expect(activities.some((a) => a.type === 'stage-changed')).toBe(true)
  })

  it('timestamps the lead and timeline at the instant the action occurred', async () => {
    const target = anchor('ENQ-4101')
    const actionAt = fromISO('2026-09-19T10:42:00Z')

    const { lead } = await api.moveStage(target.id, 'contacted', actionAt)
    const { activities } = await api.listActivities(target.id)
    const stageChange = activities.find((activity) => activity.type === 'stage-changed')

    expect(lead.lastStageChangeAt).toBe(actionAt)
    expect(lead.updatedAt).toBe(actionAt)
    expect(stageChange?.occurredAt).toBe(actionAt)
    expect(stageChange?.recordedAt).toBe(actionAt)
  })

  it('enforces the SAME guard the UI enforces, returning the identical error shape', async () => {
    // The client logs every failed response; this test is exercising that path.
    allowConsoleError()
    // ENQ-4105 sits at showroom-visit with no licence check.
    const target = anchor('ENQ-4105')
    await api
      .moveStage(target.id, 'test-drive')
      .then(() => expect.unreachable('the licence guard should have blocked this'))
      .catch((error: unknown) => {
        expect(error).toBeInstanceOf(ApiError)
        if (error instanceof ApiError) {
          expect(error.status).toBe(422)
          expect(error.detail.code).toBe('LICENCE_CHECK_REQUIRED')
          // The exact string the UI renders and the unit test asserts.
          expect(error.detail.remedy).toBe('Log a licence check')
        }
      })
  })

  it('allows the move once the remedy has been carried out', async () => {
    const target = anchor('ENQ-4105')
    await api.logActivity(target.id, { type: 'licence-check' })
    const { lead } = await api.moveStage(target.id, 'test-drive')
    expect(lead.stage).toBe('test-drive')
  })

  it('refuses an unknown stage', async () => {
    // The client logs every failed response; this test is exercising that path.
    allowConsoleError()
    const target = anchor('ENQ-4101')
    await api
      .moveStage(target.id, 'sold-to-a-pirate' as never)
      .then(() => expect.unreachable('should have been rejected'))
      .catch((error: unknown) => {
        if (error instanceof ApiError) expect(error.detail.code).toBe('UNKNOWN_STAGE')
      })
  })
})

describe('POST /leads/:id/close', () => {
  it('refuses to close as lost without a reason', async () => {
    // The client logs every failed response; this test is exercising that path.
    allowConsoleError()
    const target = anchor('ENQ-4101')
    await api
      .closeLead(target.id, { outcome: 'lost' } as never)
      .then(() => expect.unreachable('a lost sale must carry a reason'))
      .catch((error: unknown) => {
        if (error instanceof ApiError) {
          expect(error.status).toBe(422)
          expect(error.detail.code).toBe('LOST_REASON_REQUIRED')
        }
      })
  })

  it('closes as lost with a reason, and logs it', async () => {
    const target = anchor('ENQ-4101')
    const { lead } = await api.closeLead(target.id, {
      outcome: 'lost',
      reason: 'px-offer-too-low',
      note: 'Wanted £1,200 more for the Astra.',
    })
    expect(lead.status.kind).toBe('lost')
    if (lead.status.kind === 'lost') expect(lead.status.reason).toBe('px-offer-too-low')

    const { activities } = await api.listActivities(target.id)
    expect(activities.some((a) => a.type === 'lost-sale')).toBe(true)
  })

  it('refuses to mark won before handover', async () => {
    // The client logs every failed response; this test is exercising that path.
    allowConsoleError()
    const target = anchor('ENQ-4101')
    await api
      .closeLead(target.id, { outcome: 'won' })
      .then(() => expect.unreachable('cannot win before handover'))
      .catch((error: unknown) => {
        if (error instanceof ApiError) expect(error.detail.code).toBe('HANDOVER_REQUIRED')
      })
  })

  it('reopens a closed lead', async () => {
    const target = anchor('ENQ-4101')
    await api.closeLead(target.id, { outcome: 'lost', reason: 'no-contact' })
    const { lead } = await api.reopenLead(target.id)
    expect(lead.status.kind).toBe('open')
  })
})

describe('persistence across requests', () => {
  it('a logged activity is still there on the next read', async () => {
    const target = anchor('ENQ-4103')
    await api.logActivity(target.id, { type: 'sms-sent', note: 'Texted the customer.' })
    const reread = await api.getLead(target.id)
    expect(reread.activities.some((a) => a.note === 'Texted the customer.')).toBe(true)
  })

  it('gives every new activity a fresh id that never collides with a seeded one', async () => {
    const target = anchor('ENQ-4101')
    const seededIds = new Set(store.activities().map((a) => a.id))
    const created = []
    for (let i = 0; i < 5; i += 1) {
      const { activity } = await api.logActivity(target.id, { type: 'note', note: `n${i}` })
      created.push(activity.id)
    }
    expect(new Set(created).size).toBe(5)
    for (const id of created) expect(seededIds.has(id)).toBe(false)
  })
})
