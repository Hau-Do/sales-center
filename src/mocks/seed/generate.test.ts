import { describe, it, expect } from 'vitest'
import { DEFAULT_CALENDAR } from '@/domain/businessHours'
import { detectAnomalies } from '@/domain/activities'
import { toLocalParts } from '@/domain/instant'
import { DEFAULT_SLA_POLICY, computeSla } from '@/domain/sla'
import { isValidRegistration } from './registration'
import { DEMO_NOW, SCENARIOS, buildScenario, isScenarioName } from './generate'

describe('the demo clock', () => {
  it('is a Saturday morning while the showroom is open', () => {
    const parts = toLocalParts(DEMO_NOW)
    // Saturday 19 September 2026, 09:15 BST. Saturday trades 09:00-17:00, so
    // the clock sits 15 minutes after opening — which is what makes the Friday
    // 17:52 enquiry visibly resume rather than having silently breached.
    expect(parts).toMatchObject({ year: 2026, month: 9, day: 19, hour: 9, minute: 15, weekday: 6 })
  })
})

describe('determinism', () => {
  it('produces byte-identical output for the same seed', () => {
    const a = buildScenario('default', { rngSeed: 42 })
    const b = buildScenario('default', { rngSeed: 42 })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('produces different output for a different seed', () => {
    const a = buildScenario('default', { rngSeed: 1 })
    const b = buildScenario('default', { rngSeed: 2 })
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b))
  })

  it('recognises its scenario names', () => {
    for (const name of SCENARIOS) expect(isScenarioName(name)).toBe(true)
    expect(isScenarioName('nonsense')).toBe(false)
  })
})

describe('the default scenario', () => {
  const data = buildScenario('default')

  it('has enough live leads to fill an inbox and enough history for KPIs', () => {
    const open = data.leads.filter((l) => l.status.kind === 'open')
    const closed = data.leads.filter((l) => l.status.kind !== 'open')
    expect(open.length).toBeGreaterThanOrEqual(40)
    expect(closed.length).toBeGreaterThanOrEqual(90)
    expect(data.activities.length).toBeGreaterThanOrEqual(150)
  })

  it('gives every lead a unique id and reference', () => {
    expect(new Set(data.leads.map((l) => l.id)).size).toBe(data.leads.length)
    expect(new Set(data.leads.map((l) => l.reference)).size).toBe(data.leads.length)
  })

  it('gives every activity a unique id that points at a real lead', () => {
    const leadIds = new Set(data.leads.map((l) => l.id))
    expect(new Set(data.activities.map((a) => a.id)).size).toBe(data.activities.length)
    for (const activity of data.activities) {
      expect(leadIds.has(activity.leadId)).toBe(true)
    }
  })

  it('formats every registration mark correctly', () => {
    for (const lead of data.leads) {
      const reg = lead.vehicleOfInterest?.registration
      if (reg !== undefined) expect(isValidRegistration(reg)).toBe(true)
      const px = lead.partExchange?.registration
      if (px !== undefined) expect(isValidRegistration(px)).toBe(true)
    }
  })

  it('uses only Ofcom-reserved phone numbers, so nothing can dial a real person', () => {
    for (const lead of data.leads) {
      // Ofcom's reserved drama range is 07700 900000-900999.
      expect(lead.customer.mobile).toMatch(/^07700 900\d{3}$/)
    }
  })

  it('assigns every lead to a real executive at a real site', () => {
    const execIds = new Set(data.executives.map((e) => e.id))
    const siteIds = new Set(data.sites.map((s) => s.id))
    for (const lead of data.leads) {
      if (lead.assignedTo !== undefined) expect(execIds.has(lead.assignedTo)).toBe(true)
      expect(siteIds.has(lead.siteId)).toBe(true)
    }
  })

  it('never records a response before the enquiry arrived', () => {
    for (const lead of data.leads) {
      if (lead.firstRespondedAt !== undefined) {
        expect(lead.firstRespondedAt).toBeGreaterThanOrEqual(lead.receivedAt)
      }
    }
  })
})

describe('the anchor leads', () => {
  const data = buildScenario('default')
  const sla = (leadRef: string) => {
    const lead = data.leads.find((l) => l.reference === leadRef)
    if (!lead) throw new Error(`no lead ${leadRef}`)
    return {
      lead,
      status: computeSla(
        {
          source: lead.source,
          receivedAt: lead.receivedAt,
          ...(lead.firstRespondedAt !== undefined
            ? { firstRespondedAt: lead.firstRespondedAt }
            : {}),
        },
        DEFAULT_SLA_POLICY,
        DEFAULT_CALENDAR,
        DEMO_NOW,
      ),
    }
  }

  it('the Friday 17:52 enquiry is AMBER, not breached — 8 minutes Friday plus 15 Saturday', () => {
    const { status } = sla('ENQ-4101')
    expect(status.consumedMinutes).toBe(23)
    expect(status.remainingMinutes).toBe(7)
    expect(status.state).toBe('at-risk')
  })

  it('the marketplace lead is deeply breached, giving the triage bar something to shout about', () => {
    const { status } = sla('ENQ-4102')
    expect(status.state).toBe('breached')
    expect(status.remainingMinutes).toBeLessThan(-60)
  })

  it('the OEM portal lead is breached too', () => {
    expect(sla('ENQ-4103').status.state).toBe('breached')
  })

  it('the negative-equity lead really is in negative equity', () => {
    const { lead } = sla('ENQ-4104')
    const px = lead.partExchange
    expect(px).toBeDefined()
    expect(px?.settlementFigure).toBeDefined()
    expect(px!.settlementFigure!).toBeGreaterThan(px!.allowance!)
  })

  it('the licence-guard lead sits at showroom-visit with no licence check', () => {
    const { lead } = sla('ENQ-4105')
    expect(lead.stage).toBe('showroom-visit')
    expect(lead.licenceCheckedAt).toBeUndefined()
  })

  it('the walk-in carries no response target', () => {
    expect(sla('ENQ-4107').status.state).toBe('not-applicable')
  })
})

describe('deliberate data anomalies', () => {
  const data = buildScenario('default')

  it('seeds exactly one lead with a broken activity chain, so the badge is demonstrable', () => {
    const anomalyLead = data.leads.find((l) => l.reference === 'ENQ-4106')
    expect(anomalyLead).toBeDefined()
    const activities = data.activities.filter((a) => a.leadId === anomalyLead!.id)
    const found = detectAnomalies(activities)
    const kinds = found.map((f) => f.kind)
    expect(kinds).toContain('inverted-chain')
    expect(kinds).toContain('orphaned-chain')
  })

  it('leaves every other lead’s timeline clean', () => {
    const anomalyLead = data.leads.find((l) => l.reference === 'ENQ-4106')
    for (const lead of data.leads) {
      if (lead.id === anomalyLead?.id) continue
      const activities = data.activities.filter((a) => a.leadId === lead.id)
      expect(detectAnomalies(activities), `lead ${lead.reference}`).toEqual([])
    }
  })
})

describe('the other scenarios', () => {
  it('empty really is empty', () => {
    const data = buildScenario('empty')
    expect(data.leads).toEqual([])
    expect(data.activities).toEqual([])
    // Reference data still loads, so the UI renders its chrome rather than crashing.
    expect(data.sites.length).toBeGreaterThan(0)
    expect(data.executives.length).toBeGreaterThan(0)
  })

  it('sla-breach is materially more breached than the default', () => {
    const breachRate = (scenario: 'default' | 'sla-breach') => {
      const data = buildScenario(scenario)
      const open = data.leads.filter((l) => l.status.kind === 'open')
      const breached = open.filter(
        (l) =>
          computeSla(
            {
              source: l.source,
              receivedAt: l.receivedAt,
              ...(l.firstRespondedAt !== undefined ? { firstRespondedAt: l.firstRespondedAt } : {}),
            },
            DEFAULT_SLA_POLICY,
            DEFAULT_CALENDAR,
            DEMO_NOW,
          ).state === 'breached',
      )
      return breached.length / open.length
    }
    expect(breachRate('sla-breach')).toBeGreaterThan(breachRate('default'))
  })

  it('analytics-rich carries a deeper history for credible denominators', () => {
    const rich = buildScenario('analytics-rich').leads.filter((l) => l.status.kind !== 'open')
    const normal = buildScenario('default').leads.filter((l) => l.status.kind !== 'open')
    expect(rich.length).toBeGreaterThan(normal.length)
  })
})

describe('the deliberately zero-unit executive', () => {
  const data = buildScenario('default')

  it('never wins a deal, so the league table has a zero row to render', () => {
    // The edge case a ratio with an empty denominator lives in — see
    // EXECUTIVES in catalogue.ts.
    const won = data.leads.filter((l) => l.status.kind === 'won' && l.assignedTo === 'exec_jonah')
    expect(won).toHaveLength(0)
  })

  it('still carries open and lost work, so the row is not empty', () => {
    const theirs = data.leads.filter((l) => l.assignedTo === 'exec_jonah')
    expect(theirs.length).toBeGreaterThan(0)
  })
})
