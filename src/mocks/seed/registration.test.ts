import { describe, it, expect } from 'vitest'
import { fromISO } from '@/domain/instant'
import { ageIdentifierFor, formatRegistration, isValidRegistration } from './registration'

describe('ageIdentifierFor()', () => {
  it('uses the year digits for a March-to-August registration', () => {
    expect(ageIdentifierFor(fromISO('2019-03-01T12:00:00Z'))).toBe('19')
    expect(ageIdentifierFor(fromISO('2019-08-31T12:00:00Z'))).toBe('19')
    expect(ageIdentifierFor(fromISO('2024-06-15T12:00:00Z'))).toBe('24')
  })

  it('adds 50 for a September-to-December registration', () => {
    expect(ageIdentifierFor(fromISO('2019-09-01T12:00:00Z'))).toBe('69')
    expect(ageIdentifierFor(fromISO('2019-12-31T12:00:00Z'))).toBe('69')
    expect(ageIdentifierFor(fromISO('2026-09-20T12:00:00Z'))).toBe('76')
  })

  it('carries the previous September identifier into January and February', () => {
    // A car registered in January 2020 is still on a 69 plate.
    expect(ageIdentifierFor(fromISO('2020-01-15T12:00:00Z'))).toBe('69')
    expect(ageIdentifierFor(fromISO('2020-02-28T12:00:00Z'))).toBe('69')
  })

  it('pads a single-digit year', () => {
    expect(ageIdentifierFor(fromISO('2005-04-01T12:00:00Z'))).toBe('05')
  })
})

describe('formatRegistration()', () => {
  it('formats with the conventional space', () => {
    expect(formatRegistration('LV', '19', 'XKD')).toBe('LV19 XKD')
  })

  it('produces marks that validate', () => {
    expect(isValidRegistration(formatRegistration('GU', '76', 'NRT'))).toBe(true)
  })

  it('rejects malformed marks', () => {
    expect(isValidRegistration('LV19XKD')).toBe(false)
    expect(isValidRegistration('L19 XKD')).toBe(false)
    expect(isValidRegistration('lv19 xkd')).toBe(false)
    expect(isValidRegistration('LV1 XKD')).toBe(false)
  })
})
