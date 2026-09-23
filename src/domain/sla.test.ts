import { describe, it, expect } from 'vitest'
import { DEFAULT_CALENDAR } from './businessHours'
import { addMinutes, fromISO, toISO } from './instant'
import {
  DEFAULT_SLA_POLICY,
  type SlaStatus,
  computeSla,
  describeSla,
  formatCountdown,
  isSlaApplicable,
  msUntilNextMinuteBoundary,
  percentile,
  slaTargetFor,
  slaUrgencyRank,
  summariseSla,
} from './sla'

const FRI_1752 = fromISO('2026-09-18T16:52:00Z') // Friday 17:52 BST, 8 min before close
const FRI_1000 = fromISO('2026-09-18T09:00:00Z') // Friday 10:00 BST, mid-morning
const FRI_1011 = fromISO('2026-09-18T09:11:00Z') // Friday 10:11 BST

const sla = (input: Parameters<typeof computeSla>[0], now: Parameters<typeof computeSla>[3]) =>
  computeSla(input, DEFAULT_SLA_POLICY, DEFAULT_CALENDAR, now)

describe('policy lookup', () => {
  it('reads the target for each source', () => {
    expect(slaTargetFor('marketplace', DEFAULT_SLA_POLICY)).toBe(15)
    expect(slaTargetFor('website', DEFAULT_SLA_POLICY)).toBe(30)
    expect(slaTargetFor('finance-renewal', DEFAULT_SLA_POLICY)).toBe(480)
  })

  it('excludes walk-ins — they were already served in person (ASM-SLA-01)', () => {
    expect(isSlaApplicable('walk-in', DEFAULT_SLA_POLICY)).toBe(false)
    expect(isSlaApplicable('website', DEFAULT_SLA_POLICY)).toBe(true)
  })
})

describe('computeSla() — pending leads', () => {
  it('is on track immediately after the enquiry lands', () => {
    const s = sla({ source: 'website', receivedAt: FRI_1000 }, FRI_1000)
    expect(s.state).toBe('on-track')
    expect(s.consumedMinutes).toBe(0)
    expect(s.remainingMinutes).toBe(30)
    expect(s.countsTowardCompliance).toBe(true)
  })

  it('turns amber only once remaining drops to the threshold, not before', () => {
    // 30-minute target, 25% threshold -> amber at 7.5 minutes remaining or less.
    const at22 = sla({ source: 'website', receivedAt: FRI_1000 }, addMinutes(FRI_1000, 22))
    expect(at22.remainingMinutes).toBe(8)
    expect(at22.state).toBe('on-track')

    const at23 = sla({ source: 'website', receivedAt: FRI_1000 }, addMinutes(FRI_1000, 23))
    expect(at23.remainingMinutes).toBe(7)
    expect(at23.state).toBe('at-risk')
  })

  it('breaches once remaining goes negative', () => {
    const s = sla({ source: 'website', receivedAt: FRI_1000 }, addMinutes(FRI_1000, 31))
    expect(s.state).toBe('breached')
    expect(s.remainingMinutes).toBe(-1)
  })

  it('is exactly on the line at zero remaining, not yet breached', () => {
    const s = sla({ source: 'website', receivedAt: FRI_1000 }, addMinutes(FRI_1000, 30))
    expect(s.remainingMinutes).toBe(0)
    expect(s.state).toBe('at-risk')
  })

  describe('a marketplace lead on a 15-minute clock', () => {
    it('received 10:11, evaluated 10:30, is BREACHED by four minutes', () => {
      // Due at 10:26. This is the case where "amber, 4 minutes left" is wrong:
      // at 10:30 the target has already passed.
      const s = sla(
        { source: 'marketplace', receivedAt: FRI_1011 },
        fromISO('2026-09-18T09:30:00Z'),
      )
      expect(s.consumedMinutes).toBe(19)
      expect(s.remainingMinutes).toBe(-4)
      expect(s.state).toBe('breached')
      expect(toISO(s.dueAt!)).toBe('2026-09-18T09:26:00.000Z')
    })

    it('four minutes REMAINING on a 15-minute target is still green, not amber', () => {
      // 4 > 15 * 0.25 = 3.75, so this lead has not reached the amber threshold.
      const s = sla({ source: 'marketplace', receivedAt: FRI_1011 }, addMinutes(FRI_1011, 11))
      expect(s.remainingMinutes).toBe(4)
      expect(s.state).toBe('on-track')
    })

    it('three minutes remaining is amber', () => {
      const s = sla({ source: 'marketplace', receivedAt: FRI_1011 }, addMinutes(FRI_1011, 12))
      expect(s.remainingMinutes).toBe(3)
      expect(s.state).toBe('at-risk')
    })
  })

  describe('the Friday 17:52 enquiry', () => {
    it('consumes only the 8 working minutes before close', () => {
      const s = sla({ source: 'website', receivedAt: FRI_1752 }, fromISO('2026-09-19T08:00:00Z'))
      expect(s.consumedMinutes).toBe(8)
      expect(s.remainingMinutes).toBe(22)
      expect(s.state).toBe('on-track')
    })

    it('is due at 09:22 on Saturday, not overnight', () => {
      const s = sla({ source: 'website', receivedAt: FRI_1752 }, FRI_1752)
      expect(toISO(s.dueAt!)).toBe('2026-09-19T08:22:00.000Z')
    })

    it('is NOT breached at 09:00 on Saturday morning', () => {
      const s = sla({ source: 'website', receivedAt: FRI_1752 }, fromISO('2026-09-19T08:00:00Z'))
      expect(s.state).not.toBe('breached')
    })

    it('IS breached by 09:30 on Saturday — 8 minutes on Friday plus 30 more', () => {
      // 08:30Z is 09:30 BST, i.e. 30 minutes after Saturday's 09:00 opening.
      const s = sla({ source: 'website', receivedAt: FRI_1752 }, fromISO('2026-09-19T08:30:00Z'))
      expect(s.consumedMinutes).toBe(38)
      expect(s.state).toBe('breached')
      expect(s.remainingMinutes).toBe(-8)
    })

    it('keeps accumulating through Saturday trading', () => {
      // 09:00Z is 10:00 BST: 8 on Friday + 60 on Saturday.
      const s = sla({ source: 'website', receivedAt: FRI_1752 }, fromISO('2026-09-19T09:00:00Z'))
      expect(s.consumedMinutes).toBe(68)
      expect(s.remainingMinutes).toBe(-38)
    })
  })
})

describe('computeSla() — settled leads', () => {
  it('records a response inside the target as met', () => {
    const s = sla(
      { source: 'website', receivedAt: FRI_1000, firstRespondedAt: addMinutes(FRI_1000, 20) },
      addMinutes(FRI_1000, 600),
    )
    expect(s.state).toBe('met')
    expect(s.consumedMinutes).toBe(20)
  })

  it('records a response past the target as breached, and it stays settled', () => {
    const s = sla(
      { source: 'website', receivedAt: FRI_1000, firstRespondedAt: addMinutes(FRI_1000, 45) },
      addMinutes(FRI_1000, 6000),
    )
    expect(s.state).toBe('breached')
    expect(s.consumedMinutes).toBe(45)
  })

  it('treats a response exactly on the target as met', () => {
    const s = sla(
      { source: 'website', receivedAt: FRI_1000, firstRespondedAt: addMinutes(FRI_1000, 30) },
      addMinutes(FRI_1000, 600),
    )
    expect(s.state).toBe('met')
  })
})

describe('computeSla() — walk-ins', () => {
  it('carries no target and no compliance weight', () => {
    const s = sla({ source: 'walk-in', receivedAt: FRI_1000 }, addMinutes(FRI_1000, 5000))
    expect(s.state).toBe('not-applicable')
    expect(s.countsTowardCompliance).toBe(false)
    expect(s.dueAt).toBeUndefined()
  })
})

describe('formatCountdown()', () => {
  it.each([
    [0, '00:00'],
    [8, '00:08'],
    [133, '02:13'],
    [-47, '-00:47'],
    [-1, '-00:01'],
    [600, '10:00'],
  ])('formats %i minutes as %s', (minutes, expected) => {
    expect(formatCountdown(minutes)).toBe(expected)
  })
})

describe('describeSla()', () => {
  it('explains each state in plain English', () => {
    const onTrack = sla({ source: 'website', receivedAt: FRI_1752 }, FRI_1752)
    expect(describeSla(onTrack)).toMatch(/30 of 30 working minutes left/)

    const breached = sla({ source: 'website', receivedAt: FRI_1000 }, addMinutes(FRI_1000, 40))
    expect(describeSla(breached)).toMatch(/Overdue by 10 working minutes/)

    const walkIn = sla({ source: 'walk-in', receivedAt: FRI_1000 }, FRI_1000)
    expect(describeSla(walkIn)).toMatch(/already in the showroom/)

    const met = sla(
      { source: 'website', receivedAt: FRI_1000, firstRespondedAt: addMinutes(FRI_1000, 12) },
      addMinutes(FRI_1000, 600),
    )
    expect(describeSla(met)).toMatch(/Responded in 12 working minutes, inside/)

    const lateResponse = sla(
      { source: 'website', receivedAt: FRI_1000, firstRespondedAt: addMinutes(FRI_1000, 90) },
      addMinutes(FRI_1000, 600),
    )
    expect(describeSla(lateResponse)).toMatch(/Responded in 90 working minutes, past/)

    const atRisk = sla({ source: 'website', receivedAt: FRI_1000 }, addMinutes(FRI_1000, 25))
    expect(describeSla(atRisk)).toMatch(/respond now/)
  })
})

describe('slaUrgencyRank()', () => {
  it('puts the most overdue first and the settled last', () => {
    const breached = sla({ source: 'website', receivedAt: FRI_1000 }, addMinutes(FRI_1000, 50))
    const amber = sla({ source: 'website', receivedAt: FRI_1000 }, addMinutes(FRI_1000, 25))
    const green = sla({ source: 'website', receivedAt: FRI_1000 }, addMinutes(FRI_1000, 2))
    const walkIn = sla({ source: 'walk-in', receivedAt: FRI_1000 }, FRI_1000)

    const ordered = [green, walkIn, breached, amber].sort(
      (a, b) => slaUrgencyRank(a) - slaUrgencyRank(b),
    )
    expect(ordered.map((s) => s.state)).toEqual([
      'breached',
      'at-risk',
      'on-track',
      'not-applicable',
    ])
  })
})

describe('percentile()', () => {
  it('returns null for an empty set rather than 0', () => {
    expect(percentile([], 50)).toBeNull()
  })

  it('returns the only value for a single-element set', () => {
    expect(percentile([7], 50)).toBe(7)
    expect(percentile([7], 90)).toBe(7)
  })

  it('takes the MEAN of the two middle values for an even-length set', () => {
    // The off-by-one here — returning the lower middle value — is a classic.
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5)
  })

  it('takes the middle value for an odd-length set', () => {
    expect(percentile([1, 2, 3], 50)).toBe(2)
  })

  it('interpolates for p90', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBeCloseTo(9.1, 10)
  })

  it('returns the extremes at p0 and p100', () => {
    expect(percentile([3, 5, 9], 0)).toBe(3)
    expect(percentile([3, 5, 9], 100)).toBe(9)
  })
})

describe('summariseSla()', () => {
  const settledMet = (consumed: number): SlaStatus => ({
    state: 'met',
    targetMinutes: 30,
    consumedMinutes: consumed,
    remainingMinutes: 30 - consumed,
    respondedAt: FRI_1000,
    countsTowardCompliance: true,
  })
  const settledBreached = (consumed: number): SlaStatus => ({
    state: 'breached',
    targetMinutes: 30,
    consumedMinutes: consumed,
    remainingMinutes: 30 - consumed,
    respondedAt: FRI_1000,
    countsTowardCompliance: true,
  })
  const pendingBreached: SlaStatus = {
    state: 'breached',
    targetMinutes: 30,
    consumedMinutes: 44,
    remainingMinutes: -14,
    countsTowardCompliance: true,
  }
  const notApplicable: SlaStatus = {
    state: 'not-applicable',
    targetMinutes: 0,
    consumedMinutes: 0,
    remainingMinutes: 0,
    countsTowardCompliance: false,
  }

  it('excludes non-applicable leads from the denominator', () => {
    const s = summariseSla([settledMet(10), settledMet(20), notApplicable])
    expect(s.eligible).toBe(2)
    expect(s.compliancePct).toBe(100)
  })

  it('counts both settled and still-pending breaches', () => {
    const s = summariseSla([settledMet(10), settledBreached(40), pendingBreached])
    expect(s.breached).toBe(2)
    expect(s.pending).toBe(1)
    expect(s.compliancePct).toBe(50) // of the two SETTLED, one met
  })

  it('returns null compliance rather than 0% when nothing has settled', () => {
    const s = summariseSla([pendingBreached, notApplicable])
    expect(s.compliancePct).toBeNull()
    expect(s.medianResponseMinutes).toBeNull()
    expect(s.p90ResponseMinutes).toBeNull()
  })

  it('reports median and p90 response times', () => {
    const s = summariseSla([settledMet(5), settledMet(10), settledMet(15), settledMet(20)])
    expect(s.medianResponseMinutes).toBe(12.5)
    expect(s.p90ResponseMinutes).toBeCloseTo(18.5, 10)
  })

  it('handles an entirely empty set', () => {
    const s = summariseSla([])
    expect(s).toMatchObject({ eligible: 0, met: 0, breached: 0, pending: 0, compliancePct: null })
  })
})

describe('msUntilNextMinuteBoundary()', () => {
  it('counts down to the next whole minute', () => {
    expect(msUntilNextMinuteBoundary(fromISO('2026-09-18T09:00:30Z'))).toBe(30_000)
    expect(msUntilNextMinuteBoundary(fromISO('2026-09-18T09:00:59Z'))).toBe(1_000)
  })

  it('returns a full minute when exactly on a boundary', () => {
    expect(msUntilNextMinuteBoundary(fromISO('2026-09-18T09:00:00Z'))).toBe(60_000)
  })
})

describe('defensive handling of an incomplete policy', () => {
  // The policy arrives as JSON in the seed files, so a source with no configured
  // target must degrade to "no SLA" rather than to NaN.
  const partial = {
    targetsBySource: { website: 30 },
    atRiskThresholdPct: 25,
    excludedSources: [],
  } as unknown as typeof DEFAULT_SLA_POLICY

  it('treats an unconfigured source as having no target', () => {
    expect(slaTargetFor('marketplace', partial)).toBe(0)
    expect(isSlaApplicable('marketplace', partial)).toBe(false)
  })

  it('still honours a source that IS configured', () => {
    expect(slaTargetFor('website', partial)).toBe(30)
    expect(isSlaApplicable('website', partial)).toBe(true)
  })

  it('computeSla returns not-applicable for the unconfigured source', () => {
    const s = computeSla(
      { source: 'marketplace', receivedAt: FRI_1000 },
      partial,
      DEFAULT_CALENDAR,
      addMinutes(FRI_1000, 500),
    )
    expect(s.state).toBe('not-applicable')
  })
})

describe('a walk-in that was nevertheless responded to', () => {
  it('carries the response timestamp through, while staying out of the denominator', () => {
    const respondedAt = addMinutes(FRI_1000, 5)
    const s = sla(
      { source: 'walk-in', receivedAt: FRI_1000, firstRespondedAt: respondedAt },
      FRI_1000,
    )
    expect(s.state).toBe('not-applicable')
    expect(s.respondedAt).toBe(respondedAt)
    expect(s.countsTowardCompliance).toBe(false)
  })
})

describe('slaUrgencyRank() for settled leads', () => {
  it('ranks a met lead behind every live one but ahead of a walk-in', () => {
    const met = sla(
      { source: 'website', receivedAt: FRI_1000, firstRespondedAt: addMinutes(FRI_1000, 5) },
      addMinutes(FRI_1000, 600),
    )
    const walkIn = sla({ source: 'walk-in', receivedAt: FRI_1000 }, FRI_1000)
    const live = sla({ source: 'website', receivedAt: FRI_1000 }, addMinutes(FRI_1000, 2))

    expect(met.state).toBe('met')
    expect(slaUrgencyRank(live)).toBeLessThan(slaUrgencyRank(met))
    expect(slaUrgencyRank(met)).toBeLessThan(slaUrgencyRank(walkIn))
  })
})
