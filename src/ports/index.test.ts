import { describe, it, expect } from 'vitest'
import { fromISO, MINUTE_MS } from '@/domain/instant'
import { controllableClock, fixedClock, seededRng, sequentialIds } from './index'

const NOW = fromISO('2026-09-18T16:52:00Z')

describe('fixedClock()', () => {
  it('always returns the same instant', () => {
    const clock = fixedClock(NOW)
    expect(clock.now()).toBe(NOW)
    expect(clock.now()).toBe(NOW)
  })
})

describe('controllableClock()', () => {
  it('starts where it was told to', () => {
    expect(controllableClock(NOW).now()).toBe(NOW)
  })

  it('advances by a duration', () => {
    const clock = controllableClock(NOW)
    clock.advance(5 * MINUTE_MS)
    expect(clock.now()).toBe(NOW + 5 * MINUTE_MS)
    clock.advance(MINUTE_MS)
    expect(clock.now()).toBe(NOW + 6 * MINUTE_MS)
  })

  it('jumps to an absolute instant', () => {
    const clock = controllableClock(NOW)
    const later = fromISO('2026-09-19T08:00:00Z')
    clock.set(later)
    expect(clock.now()).toBe(later)
  })

  it('can be wound backwards, for replaying a scenario', () => {
    const clock = controllableClock(NOW)
    clock.advance(-MINUTE_MS)
    expect(clock.now()).toBe(NOW - MINUTE_MS)
  })
})

describe('sequentialIds()', () => {
  it('produces stable, zero-padded, prefixed ids', () => {
    const ids = sequentialIds()
    expect(ids.next('lead')).toBe('lead_0001')
    expect(ids.next('lead')).toBe('lead_0002')
    expect(ids.next('act')).toBe('act_0003')
  })

  it('defaults the prefix', () => {
    expect(sequentialIds().next()).toBe('id_0001')
  })

  it('starts from a given seed, so separate streams do not collide', () => {
    expect(sequentialIds(100).next('lead')).toBe('lead_0101')
  })

  it('gives identical sequences for identical seeds', () => {
    const a = sequentialIds(5)
    const b = sequentialIds(5)
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()])
  })

  it('pads past four digits without truncating', () => {
    const ids = sequentialIds(99_999)
    expect(ids.next('lead')).toBe('lead_100000')
  })
})

describe('seededRng()', () => {
  it('is deterministic for a given seed', () => {
    const a = seededRng(1234)
    const b = seededRng(1234)
    const drawA = Array.from({ length: 20 }, () => a.next())
    const drawB = Array.from({ length: 20 }, () => b.next())
    expect(drawA).toEqual(drawB)
  })

  it('produces different streams for different seeds', () => {
    const a = Array.from({ length: 10 }, seededRng(1).next)
    const b = Array.from({ length: 10 }, seededRng(2).next)
    expect(a).not.toEqual(b)
  })

  it('stays within [0, 1)', () => {
    const rng = seededRng(99)
    for (let i = 0; i < 2000; i += 1) {
      const value = rng.next()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('is reasonably uniform — every decile gets hit over 10k draws', () => {
    const rng = seededRng(7)
    const buckets = new Array<number>(10).fill(0)
    for (let i = 0; i < 10_000; i += 1) {
      const idx = Math.floor(rng.next() * 10)
      buckets[idx] = (buckets[idx] ?? 0) + 1
    }
    for (const count of buckets) {
      expect(count).toBeGreaterThan(700)
      expect(count).toBeLessThan(1300)
    }
  })

  it('handles a zero seed without collapsing', () => {
    const rng = seededRng(0)
    const draws = Array.from({ length: 5 }, () => rng.next())
    expect(new Set(draws).size).toBe(5)
  })
})
