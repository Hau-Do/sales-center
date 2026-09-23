import { describe, it, expect, beforeEach } from 'vitest'
import { createStore } from '@/data/store'
import { memoryDb } from '@/data/db'
import { fromISO, toISO } from '@/domain/instant'
import { DEMO_NOW } from '@/mocks/seed/generate'
import { applyBootstrap, parseBootstrapParams } from './bootstrap'

/*
 * The scenario contract.
 *
 * This is the mechanism that replaces the usual "reset the mock over HTTP"
 * approach, which cannot work: cy.request() is issued from Cypress's Node
 * process and never reaches the page's service worker. Driving reset from the
 * URL instead is race-free and makes every scenario a shareable link — so it
 * is worth testing carefully.
 */

describe('parseBootstrapParams()', () => {
  it('reports no explicit params for a bare URL', () => {
    const params = parseBootstrapParams('')
    expect(params.explicit).toBe(false)
    expect(params.seed).toBeUndefined()
  })

  it('reads a scenario name', () => {
    const params = parseBootstrapParams('?__seed=sla-breach')
    expect(params.seed).toBe('sla-breach')
    expect(params.explicit).toBe(true)
  })

  it('ignores an unknown scenario name but still counts as explicit', () => {
    const params = parseBootstrapParams('?__seed=not-a-scenario')
    expect(params.seed).toBeUndefined()
    expect(params.explicit).toBe(true)
  })

  it('reads an ISO clock', () => {
    const params = parseBootstrapParams('?__now=2026-09-19T08:15:00Z')
    expect(params.now).toBe(fromISO('2026-09-19T08:15:00Z'))
  })

  it('reads an epoch-millisecond clock', () => {
    const params = parseBootstrapParams(`?__now=${DEMO_NOW}`)
    expect(params.now).toBe(DEMO_NOW)
  })

  it('falls back rather than crashing on an unparseable clock', () => {
    const params = parseBootstrapParams('?__now=yesterday-ish')
    expect(params.now).toBeUndefined()
    expect(params.explicit).toBe(true)
  })

  it('reads latency, error rate and rng seed', () => {
    const params = parseBootstrapParams('?__latency=400&__errorRate=0.5&__rngSeed=7')
    expect(params.latencyMs).toBe(400)
    expect(params.errorRate).toBe(0.5)
    expect(params.rngSeed).toBe(7)
  })

  it('rejects negative and non-numeric tuning values', () => {
    const params = parseBootstrapParams('?__latency=-5&__errorRate=lots&__rngSeed=abc')
    expect(params.latencyMs).toBeUndefined()
    expect(params.errorRate).toBeUndefined()
    expect(params.rngSeed).toBeUndefined()
  })

  it('ignores ordinary application query parameters', () => {
    const params = parseBootstrapParams('?view=unworked&lead=lead_0001')
    expect(params.explicit).toBe(false)
  })

  it('accepts a full deep link', () => {
    const params = parseBootstrapParams(
      '?__seed=negative-equity&__now=2026-09-19T08:15:00Z&__latency=250&view=unworked',
    )
    expect(params).toMatchObject({
      seed: 'negative-equity',
      now: DEMO_NOW,
      latencyMs: 250,
      explicit: true,
    })
  })
})

describe('applyBootstrap()', () => {
  let store: ReturnType<typeof createStore>

  beforeEach(() => {
    store = createStore(memoryDb())
  })

  it('seeds a fresh store even with no parameters', () => {
    expect(store.isSeeded()).toBe(false)
    const meta = applyBootstrap(store, parseBootstrapParams(''))
    expect(store.isSeeded()).toBe(true)
    expect(meta.scenario).toBe('default')
    expect(store.leads().length).toBeGreaterThan(0)
  })

  it('does NOT reseed an already-seeded store — this is what makes a reload persist', () => {
    applyBootstrap(store, parseBootstrapParams(''))
    const lead = store.leads()[0]!
    store.addActivity({
      id: 'act_manual',
      leadId: lead.id,
      type: 'note',
      occurredAt: DEMO_NOW,
      recordedAt: DEMO_NOW,
      author: 'exec_amara',
      note: 'Survives a reload.',
    })

    applyBootstrap(store, parseBootstrapParams(''))
    expect(store.activities().some((a) => a.id === 'act_manual')).toBe(true)
  })

  it('DOES reseed when the URL asks explicitly, discarding manual edits', () => {
    applyBootstrap(store, parseBootstrapParams(''))
    store.addActivity({
      id: 'act_manual',
      leadId: store.leads()[0]!.id,
      type: 'note',
      occurredAt: DEMO_NOW,
      recordedAt: DEMO_NOW,
      author: 'exec_amara',
    })

    applyBootstrap(store, parseBootstrapParams('?__seed=default'))
    expect(store.activities().some((a) => a.id === 'act_manual')).toBe(false)
  })

  it('switches scenario on request', () => {
    applyBootstrap(store, parseBootstrapParams('?__seed=empty'))
    expect(store.leads()).toEqual([])
    expect(store.meta().scenario).toBe('empty')

    applyBootstrap(store, parseBootstrapParams('?__seed=default'))
    expect(store.leads().length).toBeGreaterThan(0)
  })

  it('pins the clock from the URL', () => {
    const meta = applyBootstrap(store, parseBootstrapParams('?__now=2026-09-19T08:15:00Z'))
    expect(toISO(meta.now)).toBe('2026-09-19T08:15:00.000Z')
  })

  it('carries latency and error rate into the store meta', () => {
    const meta = applyBootstrap(store, parseBootstrapParams('?__latency=300&__errorRate=0.25'))
    expect(meta.latencyMs).toBe(300)
    expect(meta.errorRate).toBe(0.25)
  })

  it('is idempotent for the same deep link', () => {
    const a = applyBootstrap(store, parseBootstrapParams('?__seed=default&__rngSeed=9'))
    const leadsA = JSON.stringify(store.leads())
    const b = applyBootstrap(store, parseBootstrapParams('?__seed=default&__rngSeed=9'))
    expect(b).toEqual(a)
    expect(JSON.stringify(store.leads())).toBe(leadsA)
  })
})
