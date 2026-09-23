import { describe, it, expect } from 'vitest'
import {
  DAY_MS,
  HOUR_MS,
  MINUTE_MS,
  addDays,
  addHours,
  addLocalDays,
  addMinutes,
  addMs,
  compareInstants,
  diffMinutes,
  diffMs,
  fromISO,
  fromLocalParts,
  instant,
  isAfter,
  isBefore,
  isBritishSummerTime,
  isSameLocalDay,
  localDateKey,
  londonOffsetMinutes,
  maxInstant,
  minInstant,
  minutesSinceLocalMidnight,
  startOfLocalDay,
  toISO,
  toLocalParts,
} from './instant'

/*
 * UK DST in 2026, verified against the IANA database via Intl before these
 * expectations were written — never hand-computed:
 *   spring forward  2026-03-29  01:00 GMT -> 02:00 BST  (01:00-01:59 local does not exist)
 *   fall back       2026-10-25  02:00 BST -> 01:00 GMT  (01:00-01:59 local happens twice)
 */
const FRI_1752_BST = fromISO('2026-09-18T16:52:00Z') // Friday 18 Sep 2026, 17:52 London
const MIDWINTER = fromISO('2026-01-15T12:00:00Z') // GMT, offset 0
const MIDSUMMER = fromISO('2026-07-15T12:00:00Z') // BST, offset +60

describe('instant()', () => {
  it('accepts whole milliseconds', () => {
    expect(instant(0)).toBe(0)
    expect(instant(1_758_214_320_000)).toBe(1_758_214_320_000)
  })

  it('rejects fractional milliseconds and non-finite values', () => {
    expect(() => instant(1.5)).toThrow(/whole milliseconds/)
    expect(() => instant(Number.NaN)).toThrow(/finite/)
    expect(() => instant(Number.POSITIVE_INFINITY)).toThrow(/finite/)
  })
})

describe('ISO conversion', () => {
  it('round-trips', () => {
    expect(toISO(fromISO('2026-09-18T16:52:00.000Z'))).toBe('2026-09-18T16:52:00.000Z')
  })

  it('rejects an unparseable string rather than producing NaN', () => {
    expect(() => fromISO('not a date')).toThrow(/Unparseable/)
  })
})

describe('arithmetic and comparison', () => {
  it('adds absolute durations', () => {
    expect(addMs(instant(0), 5)).toBe(5)
    expect(addMinutes(instant(0), 3)).toBe(3 * MINUTE_MS)
    expect(addHours(instant(0), 2)).toBe(2 * HOUR_MS)
    expect(addDays(instant(0), 1)).toBe(DAY_MS)
  })

  it('diffMinutes truncates toward zero', () => {
    const base = instant(0)
    expect(diffMinutes(base, addMs(base, 119_000))).toBe(1)
    expect(diffMinutes(base, addMs(base, -119_000))).toBe(-1)
    expect(diffMs(base, addMs(base, 250))).toBe(250)
  })

  it('compares and orders', () => {
    const a = instant(1000)
    const b = instant(2000)
    expect(compareInstants(a, b)).toBeLessThan(0)
    expect(compareInstants(b, a)).toBeGreaterThan(0)
    expect(compareInstants(a, a)).toBe(0)
    expect(minInstant(a, b)).toBe(a)
    expect(maxInstant(a, b)).toBe(b)
    expect(isBefore(a, b)).toBe(true)
    expect(isAfter(a, b)).toBe(false)
  })
})

describe('London wall-clock decomposition', () => {
  it('reads the reference Friday correctly', () => {
    const p = toLocalParts(FRI_1752_BST)
    expect(p).toMatchObject({ year: 2026, month: 9, day: 18, hour: 17, minute: 52, weekday: 5 })
  })

  it('uses the London calendar date for the weekday, not the UTC one', () => {
    // 23:30Z on a Friday is already Saturday 00:30 in London (BST).
    const p = toLocalParts(fromISO('2026-07-17T23:30:00Z'))
    expect(p).toMatchObject({ year: 2026, month: 7, day: 18, hour: 0, minute: 30, weekday: 6 })
  })

  it('reports the UTC offset', () => {
    expect(londonOffsetMinutes(MIDWINTER)).toBe(0)
    expect(londonOffsetMinutes(MIDSUMMER)).toBe(60)
    expect(isBritishSummerTime(MIDWINTER)).toBe(false)
    expect(isBritishSummerTime(MIDSUMMER)).toBe(true)
  })

  it('reports minutes since local midnight', () => {
    expect(minutesSinceLocalMidnight(FRI_1752_BST)).toBe(17 * 60 + 52)
    expect(minutesSinceLocalMidnight(MIDWINTER)).toBe(12 * 60)
  })

  it('produces a stable local date key and same-day test', () => {
    expect(localDateKey(FRI_1752_BST)).toBe('2026-09-18')
    // 23:30Z Friday is Saturday in London — so NOT the same local day.
    expect(isSameLocalDay(fromISO('2026-07-17T23:30:00Z'), fromISO('2026-07-17T12:00:00Z'))).toBe(
      false,
    )
    expect(isSameLocalDay(FRI_1752_BST, fromISO('2026-09-18T08:00:00Z'))).toBe(true)
  })
})

describe('fromLocalParts() — the bounded inverse', () => {
  it('inverts an unambiguous BST wall time', () => {
    expect(fromLocalParts(2026, 9, 18, 17, 52)).toBe(FRI_1752_BST)
  })

  it('inverts an unambiguous GMT wall time', () => {
    expect(fromLocalParts(2026, 1, 15, 12, 0)).toBe(MIDWINTER)
  })

  it('round-trips for a spread of instants across the year', () => {
    const samples = [
      '2026-01-01T00:00:00Z',
      '2026-02-14T09:15:00Z',
      '2026-03-28T23:59:00Z',
      '2026-04-01T06:30:00Z',
      '2026-06-21T12:00:00Z',
      '2026-09-18T16:52:00Z',
      '2026-10-24T22:10:00Z',
      '2026-11-05T17:45:00Z',
      '2026-12-25T10:00:00Z',
    ].map(fromISO)

    for (const i of samples) {
      const p = toLocalParts(i)
      expect(fromLocalParts(p.year, p.month, p.day, p.hour, p.minute, p.second)).toBe(i)
    }
  })

  describe('clocks go back — 25 Oct 2026, 01:00-01:59 happens twice', () => {
    it('returns the FIRST occurrence (BST), per ASM-SLA-02', () => {
      // 00:30Z is 01:30 BST; 01:30Z is also 01:30, but GMT.
      const first = fromISO('2026-10-25T00:30:00Z')
      const second = fromISO('2026-10-25T01:30:00Z')
      expect(toLocalParts(first).hour).toBe(1)
      expect(toLocalParts(second).hour).toBe(1)

      expect(fromLocalParts(2026, 10, 25, 1, 30)).toBe(first)
      expect(fromLocalParts(2026, 10, 25, 1, 30)).toBeLessThan(second)
    })

    it('is deterministic across repeated calls', () => {
      expect(fromLocalParts(2026, 10, 25, 1, 30)).toBe(fromLocalParts(2026, 10, 25, 1, 30))
    })
  })

  describe('clocks go forward — 29 Mar 2026, 01:00-01:59 never happens', () => {
    it('clamps forward to the first instant past the gap', () => {
      const result = fromLocalParts(2026, 3, 29, 1, 30)
      // The requested wall time does not exist, so it cannot round-trip.
      expect(toLocalParts(result).hour).not.toBe(1)
      // It lands just past the gap rather than before it.
      expect(result).toBeGreaterThanOrEqual(fromISO('2026-03-29T01:00:00Z'))
      expect(toLocalParts(result)).toMatchObject({ year: 2026, month: 3, day: 29, hour: 2 })
    })

    it('still handles the boundary times either side of the gap exactly', () => {
      expect(fromLocalParts(2026, 3, 29, 0, 59)).toBe(fromISO('2026-03-29T00:59:00Z'))
      expect(fromLocalParts(2026, 3, 29, 2, 0)).toBe(fromISO('2026-03-29T01:00:00Z'))
    })
  })

  it('normalises an overflowing day, so day+1 past month end works', () => {
    expect(fromLocalParts(2026, 9, 31, 12, 0)).toBe(fromLocalParts(2026, 10, 1, 12, 0))
  })
})

describe('startOfLocalDay() and addLocalDays()', () => {
  it('finds London midnight, not UTC midnight', () => {
    // 17:52 BST on the 18th -> midnight London on the 18th is 23:00Z on the 17th.
    expect(startOfLocalDay(FRI_1752_BST)).toBe(fromISO('2026-09-17T23:00:00Z'))
  })

  it('adds calendar days, keeping the wall-clock time across a DST change', () => {
    // 28 Mar 12:00 GMT + 1 local day = 29 Mar 12:00 BST, which is only 23h later.
    const before = fromISO('2026-03-28T12:00:00Z')
    const after = addLocalDays(before, 1)
    expect(toLocalParts(after)).toMatchObject({ month: 3, day: 29, hour: 12, minute: 0 })
    expect(after - before).toBe(23 * HOUR_MS)
    // Naive +24h would land on the wrong wall-clock hour — that is the bug this avoids.
    expect(toLocalParts(addDays(before, 1)).hour).toBe(13)
  })

  it('round-trips a whole week of local-day additions', () => {
    let cursor = startOfLocalDay(fromISO('2026-10-21T12:00:00Z'))
    for (let n = 0; n < 7; n += 1) {
      expect(minutesSinceLocalMidnight(cursor)).toBe(0)
      cursor = addLocalDays(cursor, 1)
    }
    // Crossed the 25 Oct fall-back, so 7 local days is 7*24h + 1h.
    expect(cursor - startOfLocalDay(fromISO('2026-10-21T12:00:00Z'))).toBe(7 * DAY_MS + HOUR_MS)
  })
})
