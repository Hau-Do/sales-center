/**
 * The seeded dataset.
 *
 * Two kinds of data, deliberately mixed:
 *
 *  - **Anchor leads** carry absolute, hand-chosen timestamps (ASM-DATA-03). The E2E specs and
 *    the demo narrative assert on these by reference, so they must not move.
 *    Relative offsets were avoided on purpose: a business-hours SLA clock
 *    compresses "45 minutes ago" to zero whenever the showroom was shut, so
 *    offset-seeded fixtures silently stop demonstrating what they claim to.
 *  - **Filler leads** are generated from a seeded PRNG, giving realistic volume
 *    and credible KPI denominators without 600 hand-written records that nobody
 *    can maintain.
 *
 * Everything is a pure function of (scenario, rngSeed, now). No ambient clock,
 * no ambient randomness — run it twice, get identical bytes.
 */

import { firstCustomerContact } from '@/domain/activities'
import { type Instant, addLocalDays, addMinutes, fromISO, startOfLocalDay } from '@/domain/instant'
import { pence } from '@/domain/money'
import {
  PIPELINE_STAGES,
  type Activity,
  type ActivityType,
  type Lead,
  type LeadSource,
  type LostReason,
  type PartExchange,
  type PipelineStage,
  type SalesExecutive,
  type Site,
  type Vehicle,
} from '@/domain/types'
import { type Rng, seededRng } from '@/ports'
import {
  CAMPAIGN_REFS,
  COLOURS,
  EXECUTIVES,
  FIRST_NAMES,
  LAST_NAMES,
  POSTCODES,
  PX_VEHICLES,
  REG_AREA_CODES,
  REG_SUFFIXES,
  SITES,
  TRADE_NOTES,
  VEHICLES,
} from './catalogue'
import { ageIdentifierFor, formatRegistration } from './registration'

/**
 * The frozen demo clock: Saturday 19 September 2026, 09:15 BST (ASM-DATA-02).
 *
 * Saturday is the busiest day on a UK sales floor, the showroom is open
 * (09:00-17:00), and it sits fifteen minutes after opening — which is what
 * makes the Friday-17:52 enquiry visibly resume its clock this morning instead
 * of having silently breached overnight.
 */
export const DEMO_NOW: Instant = fromISO('2026-09-19T08:15:00Z')

export const SCENARIOS = [
  'default',
  'empty',
  'sla-breach',
  'negative-equity',
  'analytics-rich',
] as const
export type ScenarioName = (typeof SCENARIOS)[number]

export function isScenarioName(value: string): value is ScenarioName {
  return (SCENARIOS as readonly string[]).includes(value)
}

export interface Dataset {
  readonly leads: Lead[]
  readonly activities: Activity[]
  readonly sites: Site[]
  readonly executives: SalesExecutive[]
}

// --------------------------------------------------------------- rng helpers

function pick<T>(rng: Rng, items: readonly T[]): T {
  const item = items[Math.floor(rng.next() * items.length)]
  if (item === undefined) throw new Error('pick() called with an empty list')
  return item
}

function randInt(rng: Rng, lo: number, hi: number): number {
  return lo + Math.floor(rng.next() * (hi - lo + 1))
}

function chance(rng: Rng, probability: number): boolean {
  return rng.next() < probability
}

// ------------------------------------------------------------ record builders

function makeCustomer(rng: Rng, index: number) {
  const firstName = pick(rng, FIRST_NAMES)
  const lastName = pick(rng, LAST_NAMES)
  return {
    id: `cust_${String(index).padStart(4, '0')}`,
    firstName,
    lastName,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/[^a-z]/g, '')}@example.co.uk`,
    // Ofcom's reserved drama range — cannot dial a real person.
    // Ofcom reserves 07700 900000-900999 for drama. Nothing here can dial out.
    mobile: `07700 900${String(randInt(rng, 0, 999)).padStart(3, '0')}`,
    postcode: pick(rng, POSTCODES),
  }
}

function makeVehicle(rng: Rng, index: number, registeredAt?: Instant): Vehicle {
  const spec = pick(rng, VEHICLES)
  const isNew = chance(rng, 0.45)
  const base: Vehicle = {
    id: `veh_${String(index).padStart(4, '0')}`,
    make: spec.make,
    model: spec.model,
    derivative: spec.derivative,
    stockType: isNew ? 'new' : pick(rng, ['used', 'nearly-new', 'ex-demo'] as const),
    fuel: spec.fuel,
    transmission: spec.transmission,
    colour: pick(rng, COLOURS),
    otrPrice: pence(spec.otrPence),
    stockNumber: `STK${String(randInt(rng, 10000, 99999))}`,
    co2: spec.co2,
  }
  if (isNew || registeredAt === undefined) return base
  return {
    ...base,
    registration: formatRegistration(
      pick(rng, REG_AREA_CODES),
      ageIdentifierFor(registeredAt),
      pick(rng, REG_SUFFIXES),
    ),
    mileage: randInt(rng, 4_000, 38_000),
    firstRegistered: registeredAt,
  }
}

function makePartExchange(rng: Rng, now: Instant, forceNegativeEquity = false): PartExchange {
  const spec = pick(rng, PX_VEHICLES)
  const ageYears = randInt(rng, 3, 8)
  const registeredAt = addLocalDays(now, -ageYears * 365 - randInt(rng, 0, 200))
  const mileage = ageYears * randInt(rng, 7_000, 13_000)
  const tradeValuation = pence(randInt(rng, 320_000, 1_150_000))
  const allowance = pence(tradeValuation + randInt(rng, 0, 60_000))

  // Negative equity is the interesting case: the customer still owes more than
  // the car is worth, so the shortfall rolls into the new agreement.
  const hasFinance = forceNegativeEquity || chance(rng, 0.45)
  const settlementFigure = hasFinance
    ? pence(
        forceNegativeEquity
          ? allowance + randInt(rng, 40_000, 140_000)
          : randInt(rng, 200_000, 1_400_000),
      )
    : undefined

  return {
    registration: formatRegistration(
      pick(rng, REG_AREA_CODES),
      ageIdentifierFor(registeredAt),
      pick(rng, REG_SUFFIXES),
    ),
    make: spec.make,
    model: spec.model,
    derivative: spec.derivative,
    mileage,
    firstRegistered: registeredAt,
    motExpiry: addLocalDays(now, randInt(rng, -40, 300)),
    conditionGrade: pick(rng, [1, 2, 2, 3, 3, 4] as const),
    serviceHistory: pick(rng, ['full-dealer', 'full', 'partial', 'none'] as const),
    ...(settlementFigure !== undefined ? { settlementFigure } : {}),
    ...(settlementFigure !== undefined
      ? { settlementExpiry: addLocalDays(now, randInt(rng, 5, 28)) }
      : {}),
    tradeValuation,
    allowance,
  }
}

interface LeadDraft {
  readonly key: string
  readonly source: LeadSource
  readonly receivedAt: Instant
  readonly stage: PipelineStage
  readonly respondedAfterMinutes?: number
  readonly forceNegativeEquity?: boolean
  readonly withoutLicenceCheck?: boolean
  readonly withPartExchange?: boolean
  readonly unworked?: boolean
  readonly note?: string
}

/**
 * The anchor set: fixed timestamps, referenced by the E2E specs and by the
 * "Show me" deep links. Each one exists to make a specific claim checkable.
 */
function anchorDrafts(): LeadDraft[] {
  return [
    {
      // The flagship: arrived 8 minutes before Friday close, clock resumed at
      // 09:00 Saturday. Amber at the demo clock, NOT breached.
      key: 'friday-1752',
      source: 'website',
      receivedAt: fromISO('2026-09-18T16:52:00Z'),
      stage: 'new-enquiry',
      unworked: true,
      note: 'Enquired about the 320d after seeing it on the website on Friday evening.',
    },
    {
      // Deeply breached: a marketplace lead is going to several dealers at once.
      key: 'marketplace-breach',
      source: 'marketplace',
      receivedAt: fromISO('2026-09-18T15:00:00Z'),
      stage: 'new-enquiry',
      unworked: true,
      note: 'Marketplace enquiry — customer is comparing three dealers.',
    },
    {
      key: 'oem-breach',
      source: 'oem-portal',
      receivedAt: fromISO('2026-09-18T16:30:00Z'),
      stage: 'new-enquiry',
      unworked: true,
      note: 'Manufacturer portal lead, configured an iX1 online.',
    },
    {
      // Part exchange in negative equity — the Deal Builder demo.
      key: 'negative-equity',
      source: 'finance-renewal',
      receivedAt: fromISO('2026-09-17T09:30:00Z'),
      stage: 'px-appraisal',
      respondedAfterMinutes: 22,
      forceNegativeEquity: true,
      withPartExchange: true,
      note: 'Coming to the end of a PCP, wants to know where they stand.',
    },
    {
      // Sits at showroom-visit with no licence check, so Test drive is blocked
      // and the guard's remedy is demonstrable.
      key: 'licence-guard',
      source: 'telephone',
      receivedAt: fromISO('2026-09-18T10:05:00Z'),
      stage: 'showroom-visit',
      respondedAfterMinutes: 6,
      withoutLicenceCheck: true,
      note: 'Popped in Friday morning, keen to drive the Tiguan.',
    },
    {
      // Carries the deliberately broken activity chain.
      key: 'chain-anomaly',
      source: 'website',
      receivedAt: fromISO('2026-09-16T11:20:00Z'),
      stage: 'quoted',
      respondedAfterMinutes: 14,
      withPartExchange: true,
      note: 'Imported from the old showroom system — timeline needs checking.',
    },
    {
      key: 'walk-in',
      source: 'walk-in',
      receivedAt: fromISO('2026-09-19T08:05:00Z'),
      stage: 'qualified',
      respondedAfterMinutes: 0,
      note: 'Walked in first thing Saturday, browsing the used forecourt.',
    },
    {
      key: 'near-order',
      source: 'website',
      receivedAt: fromISO('2026-09-12T13:40:00Z'),
      stage: 'finance-proposal',
      respondedAfterMinutes: 11,
      withPartExchange: true,
      note: 'Finance proposal submitted, waiting on the lender.',
    },
  ]
}

const STAGE_ACTIVITY: Partial<Record<PipelineStage, ActivityType>> = {
  contacted: 'call-outbound',
  qualified: 'call-outbound',
  'appointment-booked': 'showroom-appointment-booked',
  'showroom-visit': 'showroom-visit',
  'test-drive': 'test-drive-completed',
  'px-appraisal': 'px-appraisal-completed',
  quoted: 'quotation-made',
  'finance-proposal': 'finance-proposal-submitted',
  'order-placed': 'deposit-taken',
  preparation: 'pdi-completed',
  handover: 'handover-completed',
}

const LOST_REASON_POOL: readonly LostReason[] = [
  'price-too-high',
  'vehicle-unavailable',
  'px-offer-too-low',
  'bought-elsewhere',
  'finance-declined',
  'no-contact',
  'payment-too-high',
  'changed-mind',
  'timing-deferred',
]

interface BuildContext {
  readonly rng: Rng
  readonly now: Instant
  leadSeq: number
  activitySeq: number
  readonly leads: Lead[]
  readonly activities: Activity[]
}

function pushActivity(
  ctx: BuildContext,
  leadId: string,
  type: ActivityType,
  occurredAt: Instant,
  author: string,
  extras: Partial<Activity> = {},
): Activity {
  ctx.activitySeq += 1
  const activity: Activity = {
    id: `act_${String(ctx.activitySeq).padStart(4, '0')}`,
    leadId,
    type,
    occurredAt,
    recordedAt: occurredAt,
    author,
    ...extras,
  }
  ctx.activities.push(activity)
  return activity
}

/** Build one lead plus the activity trail implied by the stage it reached. */
function buildLead(ctx: BuildContext, draft: LeadDraft): Lead {
  const { rng, now } = ctx
  ctx.leadSeq += 1
  const index = ctx.leadSeq
  const id = `lead_${String(index).padStart(4, '0')}`
  const executive = pick(
    rng,
    EXECUTIVES.filter((e) => e.role === 'sales-executive'),
  )

  const wantsPx = draft.withPartExchange ?? chance(rng, 0.55)
  const partExchange = wantsPx
    ? makePartExchange(rng, now, draft.forceNegativeEquity ?? false)
    : undefined

  const vehicle = makeVehicle(rng, index, addLocalDays(now, -randInt(rng, 200, 1800)))

  // Derived from PIPELINE_STAGES, never a second copy of the order — a
  // duplicated stage list is a second place for the pipeline to be wrong.
  const stageIdx = PIPELINE_STAGES.indexOf(draft.stage)

  const respondedAt =
    draft.unworked === true || draft.respondedAfterMinutes === undefined
      ? undefined
      : addMinutes(draft.receivedAt, draft.respondedAfterMinutes)

  const needsLicence =
    stageIdx >= PIPELINE_STAGES.indexOf('test-drive') && draft.withoutLicenceCheck !== true
  const licenceCheckedAt = needsLicence ? addMinutes(draft.receivedAt, 90) : undefined
  const depositTaken =
    stageIdx >= PIPELINE_STAGES.indexOf('order-placed')
      ? pence(randInt(rng, 25_000, 150_000))
      : undefined

  const activityStart = ctx.activities.length

  const lead: Lead = {
    id,
    reference: `ENQ-${String(4100 + index)}`,
    customer: makeCustomer(rng, index),
    source: draft.source,
    enquiryType:
      draft.source === 'finance-renewal'
        ? 'finance-renewal'
        : vehicle.stockType === 'new'
          ? 'new-vehicle'
          : 'used-vehicle',
    receivedAt: draft.receivedAt,
    stage: draft.stage,
    status: { kind: 'open' },
    assignedTo: executive.id,
    siteId: executive.siteId,
    vehicleOfInterest: vehicle,
    ...(partExchange !== undefined ? { partExchange } : {}),
    budgetMonthly: pence(randInt(rng, 25_000, 65_000)),
    financePreference: pick(rng, ['pcp', 'pcp', 'hp', 'cash', 'undecided'] as const),
    timescale: pick(rng, ['immediate', 'within-month', 'within-quarter', 'exploring'] as const),
    consent: [
      { channel: 'email', granted: true, capturedAt: draft.receivedAt, lawfulBasis: 'consent' },
      {
        channel: 'sms',
        granted: chance(rng, 0.7),
        capturedAt: draft.receivedAt,
        lawfulBasis: 'consent',
      },
      {
        channel: 'phone',
        granted: true,
        capturedAt: draft.receivedAt,
        lawfulBasis: 'legitimate-interest',
      },
      {
        channel: 'whatsapp',
        granted: chance(rng, 0.4),
        capturedAt: draft.receivedAt,
        lawfulBasis: 'consent',
      },
      { channel: 'post', granted: false, capturedAt: draft.receivedAt, lawfulBasis: 'consent' },
    ],
    ...(draft.note !== undefined ? { notes: draft.note } : {}),
    ...(chance(rng, 0.4) ? { campaignRef: pick(rng, CAMPAIGN_REFS) } : {}),
    createdAt: draft.receivedAt,
    updatedAt: respondedAt ?? draft.receivedAt,
    ...(licenceCheckedAt !== undefined ? { licenceCheckedAt } : {}),
    ...(depositTaken !== undefined ? { depositTaken } : {}),
    ...(stageIdx > 0 ? { lastStageChangeAt: addMinutes(draft.receivedAt, 60 * stageIdx) } : {}),
  }

  // The activity trail. Each stage the lead passed through leaves a trace.
  let previous: Activity | undefined
  if (respondedAt !== undefined) {
    previous = pushActivity(ctx, id, 'call-outbound', respondedAt, executive.id, {
      note: 'Called the customer to introduce myself and confirm the enquiry.',
      outcome: 'connected',
      isCustomerContact: true,
    })
  }

  const stages: readonly PipelineStage[] = PIPELINE_STAGES.slice(1)
  for (let i = 0; i < stages.length; i += 1) {
    const stage = stages[i]
    if (stage === undefined || i + 1 > stageIdx) break
    const type = STAGE_ACTIVITY[stage]
    if (type === undefined) continue
    const occurredAt = addMinutes(draft.receivedAt, 75 * (i + 1) + randInt(rng, 0, 40))
    previous = pushActivity(ctx, id, type, occurredAt, executive.id, {
      note: pick(rng, TRADE_NOTES),
      ...(previous !== undefined ? { previousActivityId: previous.id } : {}),
    })
  }

  if (licenceCheckedAt !== undefined) {
    pushActivity(ctx, id, 'licence-check', licenceCheckedAt, executive.id, {
      note: 'Driving licence checked and recorded ahead of the demo drive.',
    })
  }

  /*
   * Derive `firstRespondedAt` from the activity log rather than from the draft.
   *
   * A lead that reached, say, "Appointment booked" carries a
   * showroom-appointment-booked activity, and that IS contact with the customer
   * — so it cannot also be "never worked". Setting the field from the draft
   * flag alone let the two disagree, and the inbox and the dashboard then
   * reported different never-worked counts from the same data. The log is the
   * record of truth; the field is its denormalisation, exactly as the mock API
   * maintains it at runtime.
   */
  const logged = ctx.activities.slice(activityStart)
  const firstContact = firstCustomerContact(logged, draft.receivedAt)

  return firstContact === undefined ? lead : { ...lead, firstRespondedAt: firstContact.occurredAt }
}

/**
 * Inject the two deliberate chain anomalies (ASM-DATA-04), so the
 * timeline's anomaly badge is demonstrable in the running app rather than only
 * in a unit test.
 */
function injectAnomalies(ctx: BuildContext, leadId: string, author: string, base: Instant): void {
  const first = pushActivity(ctx, leadId, 'email-sent', addMinutes(base, 200), author, {
    note: 'Emailed the quote across for review.',
  })
  // Occurs BEFORE the activity it claims to follow.
  pushActivity(ctx, leadId, 'call-outbound', addMinutes(base, 140), author, {
    note: 'Imported from the legacy system with an out-of-order timestamp.',
    previousActivityId: first.id,
    outcome: 'voicemail',
  })
  // Points at an activity that does not exist on this lead.
  pushActivity(ctx, leadId, 'note', addMinutes(base, 260), author, {
    note: 'Migrated note — its parent activity was never imported.',
    previousActivityId: 'act_legacy_0000',
  })
}

/** Kept on zero units on purpose, so the league table's zero row is demonstrable. */
const ZERO_UNIT_EXECUTIVE = 'exec_jonah'

/** Closed leads across the preceding weeks, so KPI denominators are credible. */
function buildHistory(ctx: BuildContext, count: number): void {
  const { rng, now } = ctx
  for (let i = 0; i < count; i += 1) {
    const daysAgo = randInt(rng, 3, 90)
    const receivedAt = addMinutes(
      startOfLocalDay(addLocalDays(now, -daysAgo)),
      randInt(rng, 9 * 60, 17 * 60),
    )
    const won = chance(rng, 0.27)
    const stage: PipelineStage = won
      ? 'handover'
      : pick(rng, ['quoted', 'test-drive', 'finance-proposal', 'contacted'] as const)

    const lead = buildLead(ctx, {
      key: `history-${i}`,
      source: pick(rng, [
        'website',
        'marketplace',
        'oem-portal',
        'telephone',
        'walk-in',
        'finance-renewal',
      ] as const),
      receivedAt,
      stage,
      respondedAfterMinutes: randInt(rng, 2, 55),
      withPartExchange: chance(rng, 0.6),
    })

    const closedAt = addLocalDays(receivedAt, randInt(rng, 1, 14))

    /*
     * One executive is deliberately kept on zero units (see EXECUTIVES in
     * catalogue.ts), so the manager dashboard's league table has a zero row to
     * render — the edge case a ratio with an empty denominator lives in. Any
     * won deal that lands on them is reassigned.
     */
    const assignedTo =
      won && lead.assignedTo === ZERO_UNIT_EXECUTIVE
        ? pick(
            rng,
            EXECUTIVES.filter((e) => e.role === 'sales-executive' && e.id !== ZERO_UNIT_EXECUTIVE),
          ).id
        : lead.assignedTo

    ctx.leads.push({
      ...lead,
      ...(assignedTo !== undefined ? { assignedTo } : {}),
      status: won
        ? { kind: 'won', wonAt: closedAt }
        : { kind: 'lost', reason: pick(rng, LOST_REASON_POOL), lostAt: closedAt },
      updatedAt: closedAt,
    })
  }
}

export interface BuildOptions {
  readonly now?: Instant
  readonly rngSeed?: number
}

export function buildScenario(scenario: ScenarioName, options: BuildOptions = {}): Dataset {
  const now = options.now ?? DEMO_NOW
  const rng = seededRng(options.rngSeed ?? 20260919)

  const sites: Site[] = SITES.map((s) => ({ ...s }))
  const executives: SalesExecutive[] = EXECUTIVES.map((e) => ({ ...e }))

  if (scenario === 'empty') {
    return { leads: [], activities: [], sites, executives }
  }

  const ctx: BuildContext = {
    rng,
    now,
    leadSeq: 0,
    activitySeq: 0,
    leads: [],
    activities: [],
  }

  // Anchors first, so their ids are stable regardless of filler volume.
  for (const draft of anchorDrafts()) {
    const lead = buildLead(ctx, draft)
    ctx.leads.push(lead)
    if (draft.key === 'chain-anomaly') {
      injectAnomalies(ctx, lead.id, lead.assignedTo ?? 'exec_amara', draft.receivedAt)
    }
  }

  // Live filler, spread across the week and the pipeline.
  const fillerCount = scenario === 'sla-breach' ? 22 : scenario === 'negative-equity' ? 18 : 34
  for (let i = 0; i < fillerCount; i += 1) {
    const breachHeavy = scenario === 'sla-breach'
    const hoursAgo = breachHeavy ? randInt(rng, 6, 40) : randInt(rng, 1, 30)
    const receivedAt = addMinutes(now, -hoursAgo * 60 - randInt(rng, 0, 59))
    const worked = breachHeavy ? chance(rng, 0.25) : chance(rng, 0.72)

    ctx.leads.push(
      buildLead(ctx, {
        key: `filler-${i}`,
        source: pick(rng, [
          'website',
          'website',
          'marketplace',
          'oem-portal',
          'telephone',
          'whatsapp',
          'walk-in',
          'service-referral',
          'finance-renewal',
        ] as const),
        receivedAt,
        stage: pick(rng, [
          'new-enquiry',
          'new-enquiry',
          'contacted',
          'qualified',
          'appointment-booked',
          'showroom-visit',
          'test-drive',
          'px-appraisal',
          'quoted',
        ] as const),
        ...(worked ? { respondedAfterMinutes: randInt(rng, 2, 70) } : { unworked: true }),
        ...(scenario === 'negative-equity'
          ? { withPartExchange: true, forceNegativeEquity: chance(rng, 0.5) }
          : {}),
      }),
    )
  }

  buildHistory(ctx, scenario === 'analytics-rich' ? 160 : 96)

  return { leads: ctx.leads, activities: ctx.activities, sites, executives }
}
