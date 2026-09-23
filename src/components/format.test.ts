import { describe, it, expect } from 'vitest'
import { addMinutes, fromISO } from '@/domain/instant'
import {
  formatDateTime,
  formatLongDate,
  formatMileage,
  formatTime,
  msUntilNextMinute,
  relativeTime,
} from './format'

const FRI = fromISO('2026-09-18T16:52:00Z') // Friday 18 Sep 2026, 17:52 BST

describe('formatDateTime()', () => {
  it('renders London wall-clock time with the weekday', () => {
    expect(formatDateTime(FRI)).toBe('Fri 18 Sep, 17:52')
  })

  it('uses the London day, not the UTC day', () => {
    // 23:30Z in July is 00:30 the next day in London.
    expect(formatDateTime(fromISO('2026-07-17T23:30:00Z'))).toBe('Sat 18 Jul, 00:30')
  })

  it('pads single-digit hours and minutes', () => {
    expect(formatDateTime(fromISO('2026-01-05T09:05:00Z'))).toBe('Mon 5 Jan, 09:05')
  })
})

describe('formatTime() and formatLongDate()', () => {
  it('renders a bare time', () => {
    expect(formatTime(FRI)).toBe('17:52')
  })

  it('renders a long date', () => {
    expect(formatLongDate(FRI)).toBe('Friday 18 September 2026')
  })
})

describe('relativeTime()', () => {
  it('says "just now" within the minute', () => {
    expect(relativeTime(FRI, FRI)).toBe('just now')
  })

  it('counts minutes', () => {
    expect(relativeTime(FRI, addMinutes(FRI, 4))).toBe('4 min ago')
    expect(relativeTime(FRI, addMinutes(FRI, 59))).toBe('59 min ago')
  })

  it('switches to hours past the hour', () => {
    expect(relativeTime(FRI, addMinutes(FRI, 60))).toBe('1 h ago')
    expect(relativeTime(FRI, addMinutes(FRI, 61 * 3))).toBe('3 h ago')
  })

  it('falls back to an absolute date once it is far enough away', () => {
    expect(relativeTime(FRI, addMinutes(FRI, 60 * 24))).toBe('Fri 18 Sep, 17:52')
  })

  it('handles a future instant', () => {
    expect(relativeTime(addMinutes(FRI, 30), FRI)).toBe('in 30 min')
    expect(relativeTime(addMinutes(FRI, 60 * 5), FRI)).toBe('in 5 h')
    expect(relativeTime(addMinutes(FRI, 60 * 24 * 3), FRI)).toBe('in 3 d')
  })
})

describe('formatMileage()', () => {
  it('groups thousands and names the unit', () => {
    expect(formatMileage(12480)).toBe('12,480 miles')
    expect(formatMileage(0)).toBe('0 miles')
  })
})

describe('msUntilNextMinute()', () => {
  it('counts down to the next whole minute', () => {
    expect(msUntilNextMinute(fromISO('2026-09-18T09:00:30Z'))).toBe(30_000)
  })
})
