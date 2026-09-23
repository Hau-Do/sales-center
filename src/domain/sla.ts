/**
 * Speed to lead.
 *
 * Keyloop's published research says 20–30% of enquiries are lost simply by
 * never being worked, and that a delay before the customer gets a response is
 * where the margin leaks. So the response clock is the spine of the inbox: it
 * decides ordering, colour and what the triage bar shouts about.
 *
 * Two decisions worth stating plainly, because both are assumptions:
 *
 *  - **ASM-SLA-01** Walk-ins are excluded from the SLA denominator. Somebody
 *    standing in the showroom has by definition already been met; counting them
 *    would inflate compliance and hide the enquiries that really are going cold.
 *  - The clock measures WORKING minutes, not wall-clock minutes. See
 *    `businessHours.ts` for why.
 */

import { type BusinessCalendar, addWorkingMinutes, workingMinutesBetween } from './businessHours'
import { type Instant, MINUTE_MS } from './instant'
import type { LeadSource } from './types'

export type SlaState = 'met' | 'on-track' | 'at-risk' | 'breached' | 'not-applicable'

export interface SlaPolicy {
  /** Response target in working minutes, by source. */
  readonly targetsBySource: Readonly<Record<LeadSource, number>>
  /** Below this share of the target remaining, a lead turns amber. */
  readonly atRiskThresholdPct: number
  /** Sources that carry no response target at all. */
  readonly excludedSources: readonly LeadSource[]
}

/**
 * Targets reflect how quickly each channel decays. A marketplace enquiry is
 * being sent to several dealers at once, so it gets the tightest clock; a
 * finance renewal is a scheduled conversation and gets a whole working day.
 *
 * `atRiskThresholdPct` is exported through the policy rather than inlined so
 * `scripts/mutation-sanity.mjs` can flip it and prove the suite notices.
 */
export const DEFAULT_SLA_POLICY: SlaPolicy = {
  targetsBySource: {
    marketplace: 15,
    'oem-portal': 20,
    website: 30,
    whatsapp: 30,
    telephone: 30,
    'service-referral': 60,
    'finance-renewal': 480,
    'walk-in': 0,
  },
  atRiskThresholdPct: 25,
  excludedSources: ['walk-in'],
}

export interface SlaInput {
  readonly source: LeadSource
  readonly receivedAt: Instant
  readonly firstRespondedAt?: Instant
}

export interface SlaStatus {
  readonly state: SlaState
  /** Target in working minutes. 0 when not applicable. */
  readonly targetMinutes: number
  /** Working minutes consumed so far (or up to the response). */
  readonly consumedMinutes: number
  /** Working minutes left. Negative once breached. */
  readonly remainingMinutes: number
  /** The instant the response is due. Absent when not applicable. */
  readonly dueAt?: Instant
  readonly respondedAt?: Instant
  /** True when this lead counts toward the compliance denominator. */
  readonly countsTowardCompliance: boolean
}

export function isSlaApplicable(source: LeadSource, policy: SlaPolicy): boolean {
  return !policy.excludedSources.includes(source) && (policy.targetsBySource[source] ?? 0) > 0
}

export function slaTargetFor(source: LeadSource, policy: SlaPolicy): number {
  return policy.targetsBySource[source] ?? 0
}

/**
 * Evaluate the response clock for one lead at a given moment.
 *
 * `now` is passed in rather than read from the ambient clock — that is what
 * makes this function testable and what lets Cypress freeze it.
 */
export function computeSla(
  input: SlaInput,
  policy: SlaPolicy,
  calendar: BusinessCalendar,
  now: Instant,
): SlaStatus {
  const target = slaTargetFor(input.source, policy)

  if (!isSlaApplicable(input.source, policy)) {
    return {
      state: 'not-applicable',
      targetMinutes: 0,
      consumedMinutes: 0,
      remainingMinutes: 0,
      countsTowardCompliance: false,
      ...(input.firstRespondedAt !== undefined ? { respondedAt: input.firstRespondedAt } : {}),
    }
  }

  const dueAt = addWorkingMinutes(calendar, input.receivedAt, target)

  // Already answered: the outcome is settled and no longer ticks.
  if (input.firstRespondedAt !== undefined) {
    const consumed = workingMinutesBetween(calendar, input.receivedAt, input.firstRespondedAt)
    return {
      state: consumed <= target ? 'met' : 'breached',
      targetMinutes: target,
      consumedMinutes: consumed,
      remainingMinutes: target - consumed,
      dueAt,
      respondedAt: input.firstRespondedAt,
      countsTowardCompliance: true,
    }
  }

  const consumed = workingMinutesBetween(calendar, input.receivedAt, now)
  const remaining = target - consumed

  let state: SlaState
  if (remaining < 0) {
    state = 'breached'
  } else if (remaining <= (target * policy.atRiskThresholdPct) / 100) {
    state = 'at-risk'
  } else {
    state = 'on-track'
  }

  return {
    state,
    targetMinutes: target,
    consumedMinutes: consumed,
    remainingMinutes: remaining,
    dueAt,
    countsTowardCompliance: true,
  }
}

/**
 * A countdown for the inbox chip: `02:13` with time left, `-00:47` once
 * breached. Monospaced and tabular in the UI so it does not jitter as it ticks.
 */
export function formatCountdown(remainingMinutes: number): string {
  const negative = remainingMinutes < 0
  const total = Math.abs(remainingMinutes)
  const hours = Math.floor(total / 60)
  const mins = total % 60
  const body = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
  return negative ? `-${body}` : body
}

/** Plain English, for the explanation card on the lead record. */
export function describeSla(status: SlaStatus): string {
  switch (status.state) {
    case 'not-applicable':
      return 'No response target — the customer was already in the showroom.'
    case 'met':
      return `Responded in ${status.consumedMinutes} working minutes, inside the ${status.targetMinutes}-minute target.`
    case 'breached':
      return status.respondedAt !== undefined
        ? `Responded in ${status.consumedMinutes} working minutes, past the ${status.targetMinutes}-minute target.`
        : `Overdue by ${Math.abs(status.remainingMinutes)} working minutes against a ${status.targetMinutes}-minute target.`
    case 'at-risk':
      return `${status.remainingMinutes} of ${status.targetMinutes} working minutes left — respond now.`
    case 'on-track':
      return `${status.remainingMinutes} of ${status.targetMinutes} working minutes left.`
  }
}

/** Sort key for "most urgent first": breached, then closest to breaching. */
export function slaUrgencyRank(status: SlaStatus): number {
  if (status.state === 'not-applicable') return Number.MAX_SAFE_INTEGER
  if (status.state === 'met') return Number.MAX_SAFE_INTEGER - 1
  return status.remainingMinutes
}

export interface SlaCompliance {
  readonly eligible: number
  readonly met: number
  readonly breached: number
  readonly pending: number
  /** Percentage met of those already settled, or null when nothing is eligible. */
  readonly compliancePct: number | null
  /** Median working minutes to first response, or null when none responded. */
  readonly medianResponseMinutes: number | null
  readonly p90ResponseMinutes: number | null
}

/**
 * Aggregate compliance across a set of leads.
 *
 * Returns `null` rather than 0 for an empty denominator — a dashboard tile
 * showing "0%" when there is simply nothing to measure is a lie, and the UI
 * renders an em dash instead.
 */
export function summariseSla(statuses: readonly SlaStatus[]): SlaCompliance {
  const eligible = statuses.filter((s) => s.countsTowardCompliance)
  const settled = eligible.filter((s) => s.respondedAt !== undefined)
  const met = settled.filter((s) => s.state === 'met').length
  const breachedSettled = settled.length - met
  const pendingBreached = eligible.filter(
    (s) => s.respondedAt === undefined && s.state === 'breached',
  ).length

  const responseTimes = settled.map((s) => s.consumedMinutes).sort((a, b) => a - b)

  return {
    eligible: eligible.length,
    met,
    breached: breachedSettled + pendingBreached,
    pending: eligible.length - settled.length,
    compliancePct: settled.length === 0 ? null : (met / settled.length) * 100,
    medianResponseMinutes: percentile(responseTimes, 50),
    p90ResponseMinutes: percentile(responseTimes, 90),
  }
}

/**
 * Linear-interpolated percentile over a pre-sorted array.
 *
 * The median of an even-length set is the mean of the two middle values, not
 * the lower one — an off-by-one that is easy to write and hard to notice.
 */
export function percentile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null
  const rank = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(rank)
  const hi = Math.ceil(rank)
  /* v8 ignore start -- lo and hi are in range by construction; the ?? only exists to satisfy noUncheckedIndexedAccess */
  const loVal = sorted[lo] ?? 0
  const hiVal = sorted[hi] ?? 0
  /* v8 ignore stop */
  return lo === hi ? loVal : loVal + (hiVal - loVal) * (rank - lo)
}

/** Milliseconds until the countdown's displayed minute changes. Drives the ticker. */
export function msUntilNextMinuteBoundary(now: Instant): number {
  return MINUTE_MS - (now % MINUTE_MS)
}
