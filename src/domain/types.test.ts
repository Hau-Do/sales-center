import { describe, it, expect } from 'vitest'
import { fromISO } from './instant'
import { pence } from './money'
import {
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABELS,
  ENQUIRY_TYPES,
  ENQUIRY_TYPE_LABELS,
  LEAD_SOURCES,
  LEAD_SOURCE_LABELS,
  LOST_REASONS,
  LOST_REASON_LABELS,
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  type Customer,
  type Lead,
  type Vehicle,
  customerFullName,
  isLostLead,
  isOpenLead,
  isWonLead,
  vehicleDescription,
} from './types'

const NOW = fromISO('2026-09-18T16:52:00Z')

const customer: Customer = {
  id: 'cust_0001',
  firstName: 'Priya',
  lastName: 'Raman',
  email: 'priya.raman@example.co.uk',
  mobile: '07700 900184',
  postcode: 'GU1 4AY',
}

function makeLead(status: Lead['status']): Lead {
  return {
    id: 'lead_0001',
    reference: 'ENQ-0001',
    customer,
    source: 'website',
    enquiryType: 'used-vehicle',
    receivedAt: NOW,
    stage: 'new-enquiry',
    status,
    siteId: 'site_guildford',
    consent: [],
    createdAt: NOW,
    updatedAt: NOW,
  }
}

describe('label maps are exhaustive', () => {
  it('labels every lead source', () => {
    for (const s of LEAD_SOURCES) expect(LEAD_SOURCE_LABELS[s]).toBeTruthy()
    expect(Object.keys(LEAD_SOURCE_LABELS)).toHaveLength(LEAD_SOURCES.length)
  })

  it('labels every enquiry type', () => {
    for (const t of ENQUIRY_TYPES) expect(ENQUIRY_TYPE_LABELS[t]).toBeTruthy()
    expect(Object.keys(ENQUIRY_TYPE_LABELS)).toHaveLength(ENQUIRY_TYPES.length)
  })

  it('labels every pipeline stage', () => {
    for (const s of PIPELINE_STAGES) expect(PIPELINE_STAGE_LABELS[s]).toBeTruthy()
    expect(Object.keys(PIPELINE_STAGE_LABELS)).toHaveLength(PIPELINE_STAGES.length)
  })

  it('labels every lost reason', () => {
    for (const r of LOST_REASONS) expect(LOST_REASON_LABELS[r]).toBeTruthy()
    expect(Object.keys(LOST_REASON_LABELS)).toHaveLength(LOST_REASONS.length)
  })

  it('labels every activity type', () => {
    for (const t of ACTIVITY_TYPES) expect(ACTIVITY_TYPE_LABELS[t]).toBeTruthy()
    expect(Object.keys(ACTIVITY_TYPE_LABELS)).toHaveLength(ACTIVITY_TYPES.length)
  })

  it('uses UK trade vocabulary in the labels', () => {
    expect(LOST_REASON_LABELS['px-offer-too-low']).toMatch(/Part-exchange/)
    expect(LEAD_SOURCE_LABELS['walk-in']).toMatch(/Showroom/)
    expect(ACTIVITY_TYPE_LABELS['handover-completed']).toMatch(/handover/i)
  })
})

describe('status predicates', () => {
  it('identifies an open lead', () => {
    const lead = makeLead({ kind: 'open' })
    expect(isOpenLead(lead)).toBe(true)
    expect(isWonLead(lead)).toBe(false)
    expect(isLostLead(lead)).toBe(false)
  })

  it('identifies a won lead', () => {
    const lead = makeLead({ kind: 'won', wonAt: NOW })
    expect(isWonLead(lead)).toBe(true)
    expect(isOpenLead(lead)).toBe(false)
    expect(isLostLead(lead)).toBe(false)
  })

  it('identifies a lost lead', () => {
    const lead = makeLead({ kind: 'lost', reason: 'price-too-high', lostAt: NOW })
    expect(isLostLead(lead)).toBe(true)
    expect(isOpenLead(lead)).toBe(false)
    expect(isWonLead(lead)).toBe(false)
  })
})

describe('display helpers', () => {
  it('builds a full name, including the title when present', () => {
    expect(customerFullName(customer)).toBe('Priya Raman')
    expect(customerFullName({ ...customer, title: 'Dr' })).toBe('Dr Priya Raman')
  })

  it('describes a vehicle in trade form: make, model, derivative', () => {
    const vehicle: Vehicle = {
      id: 'veh_0001',
      make: 'BMW',
      model: '3 Series',
      derivative: '320d M Sport Saloon',
      stockType: 'used',
      fuel: 'diesel',
      transmission: 'automatic',
      colour: 'Mineral Grey',
      otrPrice: pence(2499500),
    }
    expect(vehicleDescription(vehicle)).toBe('BMW 3 Series 320d M Sport Saloon')
  })
})
