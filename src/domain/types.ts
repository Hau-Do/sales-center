/**
 * The dealership domain vocabulary.
 *
 * Terminology follows UK automotive retail, and matches the shape of Keyloop's
 * own published Sales Lead and Sales Activities APIs: a lead carries contact
 * details, a vehicle of interest and a current vehicle (the part-exchange
 * candidate); an activity carries a type, a timestamp, notes and a link to the
 * previous activity, so activities form a chain.
 *
 * Enums are deliberately avoided — `erasableSyntaxOnly` bans them, and a const
 * object plus a derived union gives the same safety with no runtime cost and a
 * readable JSON representation in the seed files.
 */

import type { Instant } from './instant'
import type { Pence } from './money'

// ---------------------------------------------------------------- lead intake

export const LEAD_SOURCES = [
  'website',
  'oem-portal',
  'marketplace',
  'walk-in',
  'telephone',
  'finance-renewal',
  'whatsapp',
  'service-referral',
] as const
export type LeadSource = (typeof LEAD_SOURCES)[number]

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  website: 'Website enquiry',
  'oem-portal': 'OEM portal',
  marketplace: 'Marketplace',
  'walk-in': 'Showroom walk-in',
  telephone: 'Telephone',
  'finance-renewal': 'Finance renewal',
  whatsapp: 'WhatsApp',
  'service-referral': 'Service referral',
}

export const ENQUIRY_TYPES = [
  'new-vehicle',
  'used-vehicle',
  'finance-renewal',
  'part-exchange-only',
  'motability',
  'fleet',
] as const
export type EnquiryType = (typeof ENQUIRY_TYPES)[number]

export const ENQUIRY_TYPE_LABELS: Record<EnquiryType, string> = {
  'new-vehicle': 'New vehicle',
  'used-vehicle': 'Used vehicle',
  'finance-renewal': 'Finance renewal',
  'part-exchange-only': 'Part exchange only',
  motability: 'Motability',
  fleet: 'Fleet / business',
}

// -------------------------------------------------------------------- pipeline

/**
 * The road to a sale. Ordered — index is the forward direction, and the
 * transition rules in `pipeline.ts` read positions from this array.
 */
export const PIPELINE_STAGES = [
  'new-enquiry',
  'contacted',
  'qualified',
  'appointment-booked',
  'showroom-visit',
  'test-drive',
  'px-appraisal',
  'quoted',
  'finance-proposal',
  'order-placed',
  'preparation',
  'handover',
] as const
export type PipelineStage = (typeof PIPELINE_STAGES)[number]

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  'new-enquiry': 'New enquiry',
  contacted: 'Contacted',
  qualified: 'Qualified',
  'appointment-booked': 'Appointment booked',
  'showroom-visit': 'Showroom visit',
  'test-drive': 'Test drive',
  'px-appraisal': 'PX appraisal',
  quoted: 'Quoted',
  'finance-proposal': 'Finance proposal',
  'order-placed': 'Order placed',
  preparation: 'Preparation (PDI)',
  handover: 'Handover',
}

export const LOST_REASONS = [
  'vehicle-unavailable',
  'price-too-high',
  'px-offer-too-low',
  'finance-declined',
  'payment-too-high',
  'bought-elsewhere',
  'changed-mind',
  'timing-deferred',
  'no-contact',
  'duplicate-enquiry',
] as const
export type LostReason = (typeof LOST_REASONS)[number]

export const LOST_REASON_LABELS: Record<LostReason, string> = {
  'vehicle-unavailable': 'Vehicle not available / lead time',
  'price-too-high': 'Price too high',
  'px-offer-too-low': 'Part-exchange offer too low',
  'finance-declined': 'Finance declined',
  'payment-too-high': 'Monthly payment too high',
  'bought-elsewhere': 'Bought elsewhere',
  'changed-mind': 'Changed mind / no longer buying',
  'timing-deferred': 'Timing deferred',
  'no-contact': 'No contact from customer',
  'duplicate-enquiry': 'Duplicate enquiry',
}

/**
 * Lead status as a discriminated union, so a lost lead without a reason is
 * unrepresentable rather than merely rejected at runtime. The compiler enforces
 * what would otherwise be a guard clause everyone forgets.
 */
export type LeadStatus =
  | { readonly kind: 'open' }
  | { readonly kind: 'won'; readonly wonAt: Instant }
  | {
      readonly kind: 'lost'
      readonly reason: LostReason
      readonly lostAt: Instant
      readonly note?: string
    }

// -------------------------------------------------------------------- vehicles

export type FuelType = 'petrol' | 'diesel' | 'phev' | 'bev' | 'mhev'
export type Transmission = 'manual' | 'automatic'
export type StockType = 'new' | 'used' | 'nearly-new' | 'ex-demo' | 'pre-registered'

/** A vehicle of interest. `derivative` is the exact trim+engine variant. */
export interface Vehicle {
  readonly id: string
  readonly make: string
  readonly model: string
  readonly derivative: string
  readonly stockType: StockType
  readonly fuel: FuelType
  readonly transmission: Transmission
  readonly colour: string
  /** On The Road price: list plus VED, first registration fee, plates, delivery. */
  readonly otrPrice: Pence
  readonly stockNumber?: string
  readonly vin?: string
  readonly registration?: string
  readonly mileage?: number
  readonly firstRegistered?: Instant
  readonly co2?: number
}

/** The customer's current vehicle, offered in part exchange. */
export interface PartExchange {
  readonly registration: string
  readonly make: string
  readonly model: string
  readonly derivative: string
  readonly mileage: number
  readonly firstRegistered: Instant
  readonly motExpiry?: Instant
  readonly conditionGrade: 1 | 2 | 3 | 4 | 5
  readonly serviceHistory: 'full-dealer' | 'full' | 'partial' | 'none'
  /** Outstanding finance to clear before the vehicle can be taken. */
  readonly settlementFigure?: Pence
  readonly settlementExpiry?: Instant
  readonly damageNotes?: string
  /** Trade valuation from the guide, before any over-allowance. */
  readonly tradeValuation?: Pence
  /** What the dealer actually offers the customer. */
  readonly allowance?: Pence
}

// ------------------------------------------------------------------- consent

export const CONSENT_CHANNELS = ['email', 'sms', 'phone', 'post', 'whatsapp'] as const
export type ConsentChannel = (typeof CONSENT_CHANNELS)[number]

export interface MarketingConsent {
  readonly channel: ConsentChannel
  readonly granted: boolean
  readonly capturedAt: Instant
  readonly lawfulBasis: 'consent' | 'legitimate-interest'
}

// ------------------------------------------------------------------ activities

/**
 * Activity types. The first five mirror Keyloop's own Sales Activities API
 * examples; the rest are the everyday showroom actions a sales executive logs.
 */
export const ACTIVITY_TYPES = [
  'showroom-appointment-booked',
  'test-drive-booked',
  'quotation-made',
  'handover-completed',
  'lost-sale',
  'call-outbound',
  'call-inbound',
  'email-sent',
  'sms-sent',
  'whatsapp-sent',
  'showroom-visit',
  'test-drive-completed',
  'px-appraisal-completed',
  'finance-proposal-submitted',
  'finance-decision-received',
  'deposit-taken',
  'pdi-completed',
  'licence-check',
  'note',
  'follow-up-scheduled',
  'stage-changed',
] as const
export type ActivityType = (typeof ACTIVITY_TYPES)[number]

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  'showroom-appointment-booked': 'Showroom appointment booked',
  'test-drive-booked': 'Test drive booked',
  'quotation-made': 'Quotation made',
  'handover-completed': 'Vehicle handover completed',
  'lost-sale': 'Lost sale',
  'call-outbound': 'Outbound call',
  'call-inbound': 'Inbound call',
  'email-sent': 'Email sent',
  'sms-sent': 'SMS sent',
  'whatsapp-sent': 'WhatsApp message',
  'showroom-visit': 'Showroom visit',
  'test-drive-completed': 'Test drive completed',
  'px-appraisal-completed': 'Part-exchange appraisal completed',
  'finance-proposal-submitted': 'Finance proposal submitted',
  'finance-decision-received': 'Finance decision received',
  'deposit-taken': 'Deposit taken',
  'pdi-completed': 'Pre-delivery inspection completed',
  'licence-check': 'Driving licence checked',
  note: 'Note',
  'follow-up-scheduled': 'Follow-up scheduled',
  'stage-changed': 'Stage changed',
}

export type ActivityOutcome =
  | 'connected'
  | 'no-answer'
  | 'voicemail'
  | 'attended'
  | 'no-show'
  | 'accepted'
  | 'declined'
  | 'referred'

/**
 * A logged activity.
 *
 * `previousActivityId` chains activities in the order they were recorded, which
 * is how Keyloop's own API models them. The timeline uses it to detect
 * out-of-order timestamps rather than silently re-sorting them.
 */
export interface Activity {
  readonly id: string
  readonly leadId: string
  readonly type: ActivityType
  readonly occurredAt: Instant
  readonly recordedAt: Instant
  readonly author: string
  readonly note?: string
  readonly outcome?: ActivityOutcome
  readonly previousActivityId?: string
  /** True when this activity counts as a genuine response to the enquiry. */
  readonly isCustomerContact?: boolean
  readonly campaignRef?: string
}

// ------------------------------------------------------------------------ lead

export interface Customer {
  readonly id: string
  readonly title?: string
  readonly firstName: string
  readonly lastName: string
  readonly email: string
  readonly mobile: string
  readonly postcode: string
  readonly addressLine?: string
}

export interface Lead {
  readonly id: string
  readonly reference: string
  readonly customer: Customer
  readonly source: LeadSource
  readonly enquiryType: EnquiryType
  readonly receivedAt: Instant
  /** When a sales executive first genuinely responded. Drives SLA outcome. */
  readonly firstRespondedAt?: Instant
  readonly stage: PipelineStage
  readonly status: LeadStatus
  readonly assignedTo?: string
  readonly siteId: string
  readonly vehicleOfInterest?: Vehicle
  readonly partExchange?: PartExchange
  readonly budgetMonthly?: Pence
  readonly financePreference?: 'pcp' | 'hp' | 'cash' | 'undecided'
  readonly timescale?: 'immediate' | 'within-month' | 'within-quarter' | 'exploring'
  readonly consent: readonly MarketingConsent[]
  readonly notes?: string
  readonly campaignRef?: string
  readonly createdAt: Instant
  readonly updatedAt: Instant
  /** Set when the licence was checked — a guard condition for test drives. */
  readonly licenceCheckedAt?: Instant
  readonly depositTaken?: Pence
  readonly lastStageChangeAt?: Instant
}

export interface SalesExecutive {
  readonly id: string
  readonly name: string
  readonly siteId: string
  readonly role: 'sales-executive' | 'sales-manager'
}

export interface Site {
  readonly id: string
  readonly name: string
  readonly brand: string
}

// ----------------------------------------------------------------- predicates

export function isOpenLead(lead: Lead): boolean {
  return lead.status.kind === 'open'
}

export function isLostLead(lead: Lead): boolean {
  return lead.status.kind === 'lost'
}

export function isWonLead(lead: Lead): boolean {
  return lead.status.kind === 'won'
}

export function customerFullName(c: Customer): string {
  return [c.title, c.firstName, c.lastName].filter(Boolean).join(' ')
}

export function vehicleDescription(v: Vehicle): string {
  return `${v.make} ${v.model} ${v.derivative}`
}
