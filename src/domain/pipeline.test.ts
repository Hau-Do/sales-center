import { describe, it, expect } from 'vitest'
import { type Instant, addLocalDays, fromISO } from './instant'
import { pence } from './money'
import {
  BACKWARD_LIMIT,
  GUARDED_STAGES,
  LICENCE_CHECK_VALID_DAYS,
  blockingGuard,
  canMoveStage,
  isTerminalStage,
  legalTargets,
  markLost,
  markWon,
  moveStage,
  reopenLead,
  stageIndex,
  stageLabel,
} from './pipeline'
import { PIPELINE_STAGES, type Lead, type PipelineStage } from './types'

const NOW = fromISO('2026-09-18T16:52:00Z')

/**
 * Overrides may set a property to an explicit `undefined` to mean "this lead
 * does NOT have one" — which `Partial<Lead>` forbids under
 * `exactOptionalPropertyTypes`. Undefined keys are stripped before the object
 * is returned, so the result still satisfies the strict Lead type.
 */
type LeadOverrides = { [K in keyof Lead]?: Lead[K] | undefined }

/** A lead that satisfies every guard, so the matrix below is purely structural. */
function makeLead(overrides: LeadOverrides = {}): Lead {
  const base: Lead = {
    id: 'lead_0001',
    reference: 'ENQ-0001',
    customer: {
      id: 'cust_0001',
      firstName: 'Priya',
      lastName: 'Raman',
      email: 'priya.raman@example.co.uk',
      mobile: '07700 900184',
      postcode: 'GU1 4AY',
    },
    source: 'website',
    enquiryType: 'used-vehicle',
    receivedAt: NOW,
    stage: 'new-enquiry',
    status: { kind: 'open' },
    siteId: 'site_guildford',
    consent: [],
    createdAt: NOW,
    updatedAt: NOW,
    licenceCheckedAt: addLocalDays(NOW, -30),
    depositTaken: pence(50000),
  }

  const merged: Record<string, unknown> = { ...base, ...overrides }
  for (const key of Object.keys(merged)) {
    if (merged[key] === undefined) delete merged[key]
  }
  return merged as unknown as Lead
}

describe('stage helpers', () => {
  it('indexes and labels every stage', () => {
    for (const stage of PIPELINE_STAGES) {
      expect(stageIndex(stage)).toBeGreaterThanOrEqual(0)
      expect(stageLabel(stage)).toBeTruthy()
    }
  })

  it('knows the terminal stage', () => {
    expect(isTerminalStage('handover')).toBe(true)
    expect(isTerminalStage('quoted')).toBe(false)
  })

  it('names the guarded stages', () => {
    expect([...GUARDED_STAGES].sort()).toEqual(['handover', 'order-placed', 'test-drive'])
  })

  it('places preparation between the order and the handover', () => {
    // A vehicle goes through pre-delivery inspection before the customer sees it.
    expect(stageIndex('preparation')).toBeGreaterThan(stageIndex('order-placed'))
    expect(stageIndex('preparation')).toBeLessThan(stageIndex('handover'))
  })
})

describe('the exhaustive transition table', () => {
  /*
   * Every ordered pair of stages, checked against the rule rather than against a
   * hand-copied matrix — a hand-copied matrix is just a second place to make the
   * same mistake.
   *
   * For a lead that satisfies every guard, a move is legal when it goes forward,
   * or exactly one stage back. The single exception is Handover, which cannot be
   * entered until the order is placed.
   */
  const PREPARATION = stageIndex('preparation')
  const HANDOVER = stageIndex('handover')

  const expectedAllowed = (from: number, to: number): boolean => {
    if (to === from) return false
    if (to < from - BACKWARD_LIMIT) return false
    if (to < from) return true
    return !(to === HANDOVER && from < PREPARATION)
  }

  it(`covers all ${PIPELINE_STAGES.length}x${PIPELINE_STAGES.length} pairs`, () => {
    const pairs: string[] = []
    for (const from of PIPELINE_STAGES) {
      for (const to of PIPELINE_STAGES) {
        const lead = makeLead({ stage: from })
        const actual = canMoveStage(lead, to, NOW).ok
        const expected = expectedAllowed(stageIndex(from), stageIndex(to))
        if (actual !== expected) pairs.push(`${from} -> ${to}: expected ${expected}, got ${actual}`)
      }
    }
    expect(pairs).toEqual([])
    expect(PIPELINE_STAGES.length * PIPELINE_STAGES.length).toBe(144)
  })

  it('legalTargets() never throws, for any stage and any status', () => {
    const statuses: Lead['status'][] = [
      { kind: 'open' },
      { kind: 'won', wonAt: NOW },
      { kind: 'lost', reason: 'price-too-high', lostAt: NOW },
    ]
    for (const stage of PIPELINE_STAGES) {
      for (const status of statuses) {
        expect(() => legalTargets(makeLead({ stage, status }), NOW)).not.toThrow()
      }
    }
  })

  it('legalTargets() agrees with canMoveStage() for every stage', () => {
    for (const from of PIPELINE_STAGES) {
      const lead = makeLead({ stage: from })
      const targets = legalTargets(lead, NOW)
      const expected = PIPELINE_STAGES.filter((to) => canMoveStage(lead, to, NOW).ok)
      expect(targets).toEqual(expected)
    }
  })

  it('offers no targets at all on a closed lead', () => {
    const lost = makeLead({ status: { kind: 'lost', reason: 'no-contact', lostAt: NOW } })
    expect(legalTargets(lost, NOW)).toEqual([])
  })
})

describe('structural refusals', () => {
  it('refuses a move to the stage the lead is already on', () => {
    const result = canMoveStage(makeLead({ stage: 'quoted' }), 'quoted', NOW)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('SAME_STAGE')
      expect(result.error.message).toMatch(/already at Quoted/)
    }
  })

  it('allows a single step back, to correct a mis-click', () => {
    expect(canMoveStage(makeLead({ stage: 'quoted' }), 'px-appraisal', NOW).ok).toBe(true)
  })

  it('refuses rewinding more than one stage, and names the intermediate stage', () => {
    const result = canMoveStage(makeLead({ stage: 'quoted' }), 'showroom-visit', NOW)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('BACKWARD_LIMIT_EXCEEDED')
      expect(result.error.remedy).toMatch(/PX appraisal/)
      expect(result.error.details).toMatchObject({ distance: 3 })
    }
  })

  it('reports a closed lead as closed rather than complaining about guards', () => {
    const lead = makeLead({
      stage: 'new-enquiry',
      status: { kind: 'lost', reason: 'no-contact', lostAt: NOW },
      licenceCheckedAt: undefined,
    })
    const result = canMoveStage(lead, 'test-drive', NOW)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('LEAD_CLOSED')
  })
})

describe('guards', () => {
  describe('licence check before a test drive', () => {
    it('blocks when no licence check has been logged, and offers the remedy', () => {
      const lead = makeLead({ stage: 'showroom-visit', licenceCheckedAt: undefined })
      const result = canMoveStage(lead, 'test-drive', NOW)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('LICENCE_CHECK_REQUIRED')
        expect(result.error.remedy).toBe('Log a licence check')
      }
    })

    it('allows a check from 364 days ago and blocks one from 400', () => {
      const fresh = makeLead({
        stage: 'showroom-visit',
        licenceCheckedAt: addLocalDays(NOW, -(LICENCE_CHECK_VALID_DAYS - 1)),
      })
      const stale = makeLead({
        stage: 'showroom-visit',
        licenceCheckedAt: addLocalDays(NOW, -400),
      })
      expect(canMoveStage(fresh, 'test-drive', NOW).ok).toBe(true)
      expect(canMoveStage(stale, 'test-drive', NOW).ok).toBe(false)
    })

    it('does not apply when moving BACKWARD into the test-drive stage', () => {
      const lead = makeLead({ stage: 'px-appraisal', licenceCheckedAt: undefined })
      expect(canMoveStage(lead, 'test-drive', NOW).ok).toBe(true)
    })

    it('blockingGuard() reports it pre-emptively for the UI', () => {
      const lead = makeLead({ stage: 'showroom-visit', licenceCheckedAt: undefined })
      expect(blockingGuard(lead, 'test-drive', NOW)?.code).toBe('LICENCE_CHECK_REQUIRED')
      expect(blockingGuard(makeLead(), 'test-drive', NOW)).toBeUndefined()
      expect(blockingGuard(makeLead(), 'contacted', NOW)).toBeUndefined()
    })
  })

  describe('deposit before an order', () => {
    it('blocks without a deposit', () => {
      const lead = makeLead({ stage: 'finance-proposal', depositTaken: undefined })
      const result = canMoveStage(lead, 'order-placed', NOW)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.code).toBe('DEPOSIT_REQUIRED')
    })

    it('blocks on a zero deposit, not just a missing one', () => {
      const lead = makeLead({ stage: 'finance-proposal', depositTaken: pence(0) })
      expect(canMoveStage(lead, 'order-placed', NOW).ok).toBe(false)
    })
  })

  describe('pre-delivery inspection before handover', () => {
    it('blocks a jump straight from quoted to handover', () => {
      const result = canMoveStage(makeLead({ stage: 'quoted' }), 'handover', NOW)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.code).toBe('PREPARATION_REQUIRED_BEFORE_HANDOVER')
    })

    it('still blocks it once the order is placed but the car is not prepared', () => {
      const result = canMoveStage(makeLead({ stage: 'order-placed' }), 'handover', NOW)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.remedy).toMatch(/Preparation/)
    })

    it('allows handover once the vehicle has been prepared', () => {
      expect(canMoveStage(makeLead({ stage: 'preparation' }), 'handover', NOW).ok).toBe(true)
    })
  })
})

describe('moveStage()', () => {
  it('returns an updated lead and stamps the change', () => {
    const later = fromISO('2026-09-18T17:30:00Z')
    const result = moveStage(makeLead(), 'contacted', later)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.stage).toBe('contacted')
      expect(result.value.lastStageChangeAt).toBe(later)
      expect(result.value.updatedAt).toBe(later)
    }
  })

  it('does not mutate the original lead', () => {
    const lead = makeLead()
    moveStage(lead, 'contacted', NOW)
    expect(lead.stage).toBe('new-enquiry')
  })

  it('propagates the refusal unchanged', () => {
    const result = moveStage(makeLead({ stage: 'quoted' }), 'quoted', NOW)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('SAME_STAGE')
  })
})

describe('closing and reopening', () => {
  it('marks a lead lost with its reason', () => {
    const result = markLost(makeLead(), 'px-offer-too-low', NOW, 'Wanted £1,200 more')
    expect(result.ok).toBe(true)
    if (result.ok && result.value.status.kind === 'lost') {
      expect(result.value.status.reason).toBe('px-offer-too-low')
      expect(result.value.status.note).toBe('Wanted £1,200 more')
      expect(result.value.status.lostAt).toBe(NOW)
    }
  })

  it('omits the note when none is given', () => {
    const result = markLost(makeLead(), 'no-contact', NOW)
    if (result.ok && result.value.status.kind === 'lost') {
      expect(result.value.status.note).toBeUndefined()
    }
  })

  it('refuses to close an already-closed lead', () => {
    const lost = makeLead({ status: { kind: 'lost', reason: 'no-contact', lostAt: NOW } })
    expect(markLost(lost, 'price-too-high', NOW).ok).toBe(false)
    expect(markWon(lost, NOW).ok).toBe(false)
  })

  it('only marks won from handover', () => {
    expect(markWon(makeLead({ stage: 'quoted' }), NOW).ok).toBe(false)
    const result = markWon(makeLead({ stage: 'handover' }), NOW)
    expect(result.ok).toBe(true)
    if (result.ok && result.value.status.kind === 'won') {
      expect(result.value.status.wonAt).toBe(NOW)
    }
  })

  it('reopens a closed lead and refuses to reopen an open one', () => {
    const lost = makeLead({ status: { kind: 'lost', reason: 'timing-deferred', lostAt: NOW } })
    const reopened = reopenLead(lost, NOW)
    expect(reopened.ok).toBe(true)
    if (reopened.ok) expect(reopened.value.status.kind).toBe('open')
    expect(reopenLead(makeLead(), NOW).ok).toBe(false)
  })

  it('a lost lead cannot be represented without a reason — the type forbids it', () => {
    // This is a compile-time guarantee; the runtime assertion below just proves
    // the shape we rely on is what the constructor actually produces.
    const result = markLost(makeLead(), 'finance-declined', NOW)
    if (result.ok) {
      const status = result.value.status
      expect(status.kind).toBe('lost')
      if (status.kind === 'lost') expect(status.reason).toBeTruthy()
    }
  })
})

describe('a full journey through the pipeline', () => {
  it('walks new-enquiry to handover one stage at a time', () => {
    let lead = makeLead()
    let clock: Instant = NOW
    for (const stage of PIPELINE_STAGES.slice(1) as PipelineStage[]) {
      clock = (clock + 60_000) as Instant
      const result = moveStage(lead, stage, clock)
      expect(result.ok, `failed moving to ${stage}`).toBe(true)
      if (result.ok) lead = result.value
    }
    expect(lead.stage).toBe('handover')
    const won = markWon(lead, clock)
    expect(won.ok).toBe(true)
  })
})
