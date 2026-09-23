/**
 * Showroom opening hours, and elapsed time measured in working minutes.
 *
 * This is the module the SLA story rests on. An enquiry that lands at 17:52 on
 * a Friday, eight minutes before the showroom closes, has NOT breached a
 * 30-minute response target by Saturday morning — it has consumed eight working
 * minutes and has twenty-two left when the doors reopen. Measuring against the
 * wall clock instead would mark half the overnight pipeline as breached and the
 * team would learn to ignore the alert.
 *
 * All times are London wall-clock, expressed as minutes since local midnight,
 * so a period survives BST transitions unchanged: "opens at 09:00" means 09:00
 * local in both GMT and BST.
 */

import {
  type Instant,
  MINUTE_MS,
  addLocalDays,
  fromLocalParts,
  localDateKey,
  maxInstant,
  minInstant,
  startOfLocalDay,
  toLocalParts,
} from './instant'

/** An opening period within one day, in minutes since local midnight. */
export interface OpeningPeriod {
  readonly openMinute: number
  readonly closeMinute: number
}

export interface BusinessCalendar {
  /** Indexed by weekday, 0 = Sunday. An empty array means closed all day. */
  readonly weekly: Readonly<Record<number, readonly OpeningPeriod[]>>
  /** `YYYY-MM-DD` local date keys on which the site is closed regardless. */
  readonly closures: readonly string[]
  /** `YYYY-MM-DD` local date keys with bespoke hours (Christmas Eve, etc.). */
  readonly overrides?: Readonly<Record<string, readonly OpeningPeriod[]>>
}

/**
 * Guard against a malformed calendar sending the day-walk unbounded. 400 days
 * comfortably exceeds any real SLA target while still terminating.
 */
export const MAX_DAY_ITERATIONS = 400

export function hm(hour: number, minute = 0): number {
  return hour * 60 + minute
}

/**
 * A realistic UK franchised dealership week.
 *
 * Sunday trading is included deliberately: most UK franchised showrooms open on
 * Sundays, and modelling Sunday as closed makes every Friday-evening enquiry
 * look artificially healthy. See ASM-SLA-02.
 */
export const DEFAULT_CALENDAR: BusinessCalendar = {
  weekly: {
    0: [{ openMinute: hm(10), closeMinute: hm(16) }], // Sunday
    1: [{ openMinute: hm(8, 30), closeMinute: hm(18) }],
    2: [{ openMinute: hm(8, 30), closeMinute: hm(18) }],
    3: [{ openMinute: hm(8, 30), closeMinute: hm(18) }],
    4: [{ openMinute: hm(8, 30), closeMinute: hm(18) }],
    5: [{ openMinute: hm(8, 30), closeMinute: hm(18) }],
    6: [{ openMinute: hm(9), closeMinute: hm(17) }], // Saturday
  },
  // England & Wales bank holidays, 2026.
  closures: [
    '2026-01-01', // New Year's Day
    '2026-04-03', // Good Friday
    '2026-04-06', // Easter Monday
    '2026-05-04', // Early May
    '2026-05-25', // Spring
    '2026-08-31', // Summer
    '2026-12-25', // Christmas Day
    '2026-12-28', // Boxing Day (substitute)
  ],
  overrides: {
    '2026-12-24': [{ openMinute: hm(9), closeMinute: hm(13) }], // Christmas Eve
    '2026-12-31': [{ openMinute: hm(9), closeMinute: hm(15) }], // New Year's Eve
  },
}

export function validateCalendar(cal: BusinessCalendar): void {
  for (const [day, periods] of Object.entries(cal.weekly)) {
    let previousClose = -1
    for (const p of periods) {
      if (p.openMinute < 0 || p.closeMinute > 24 * 60) {
        throw new RangeError(`Opening period on weekday ${day} falls outside the day`)
      }
      if (p.closeMinute <= p.openMinute) {
        throw new RangeError(`Opening period on weekday ${day} closes before it opens`)
      }
      if (p.openMinute < previousClose) {
        throw new RangeError(`Opening periods on weekday ${day} overlap or are out of order`)
      }
      previousClose = p.closeMinute
    }
  }
}

/** The opening periods that apply to the London day containing `at`. */
export function periodsForDay(cal: BusinessCalendar, at: Instant): readonly OpeningPeriod[] {
  const key = localDateKey(at)
  if (cal.closures.includes(key)) return []
  const override = cal.overrides?.[key]
  if (override) return override
  return cal.weekly[toLocalParts(at).weekday] ?? []
}

/** Turn "minutes since local midnight on this day" into an absolute Instant. */
function atLocalMinute(dayStart: Instant, minuteOfDay: number): Instant {
  const p = toLocalParts(dayStart)
  return fromLocalParts(p.year, p.month, p.day, Math.floor(minuteOfDay / 60), minuteOfDay % 60, 0)
}

export function isOpen(cal: BusinessCalendar, at: Instant): boolean {
  const dayStart = startOfLocalDay(at)
  return periodsForDay(cal, at).some((p) => {
    const open = atLocalMinute(dayStart, p.openMinute)
    const close = atLocalMinute(dayStart, p.closeMinute)
    return at >= open && at < close
  })
}

/**
 * Working minutes elapsed between two instants.
 *
 * Returns 0 when `to` is at or before `from` — an SLA clock never runs
 * backwards, even if a seeded activity carries an out-of-order timestamp.
 */
export function workingMinutesBetween(cal: BusinessCalendar, from: Instant, to: Instant): number {
  if (to <= from) return 0

  let total = 0
  let dayStart = startOfLocalDay(from)
  let iterations = 0

  while (dayStart < to) {
    if (++iterations > MAX_DAY_ITERATIONS) {
      throw new RangeError(
        `workingMinutesBetween exceeded ${MAX_DAY_ITERATIONS} days — check the calendar for a day with no opening hours`,
      )
    }

    for (const p of periodsForDay(cal, dayStart)) {
      const lo = maxInstant(atLocalMinute(dayStart, p.openMinute), from)
      const hi = minInstant(atLocalMinute(dayStart, p.closeMinute), to)
      if (hi > lo) total += Math.round((hi - lo) / MINUTE_MS)
    }

    dayStart = addLocalDays(dayStart, 1)
  }

  return total
}

/**
 * The instant at which `minutes` of working time will have elapsed from `from`.
 *
 * If `from` falls outside opening hours the clock starts when the showroom next
 * opens, so a 22-minute remainder on a Friday night is due at 09:22 on
 * Saturday, not at 00:22.
 */
export function addWorkingMinutes(cal: BusinessCalendar, from: Instant, minutes: number): Instant {
  if (minutes < 0) throw new RangeError('addWorkingMinutes does not accept a negative duration')

  let remaining = minutes
  let dayStart = startOfLocalDay(from)
  let iterations = 0

  while (iterations <= MAX_DAY_ITERATIONS) {
    iterations += 1

    for (const p of periodsForDay(cal, dayStart)) {
      const open = atLocalMinute(dayStart, p.openMinute)
      const close = atLocalMinute(dayStart, p.closeMinute)
      const start = maxInstant(open, from)
      if (close <= start) continue

      const available = Math.round((close - start) / MINUTE_MS)
      if (remaining === 0) return start
      if (remaining <= available) {
        return (start + remaining * MINUTE_MS) as Instant
      }
      remaining -= available
    }

    dayStart = addLocalDays(dayStart, 1)
  }

  throw new RangeError(
    `addWorkingMinutes exceeded ${MAX_DAY_ITERATIONS} days — check the calendar for a week with no opening hours`,
  )
}

/** The next instant the showroom is open at or after `at`, or null within the cap. */
export function nextOpening(cal: BusinessCalendar, at: Instant): Instant | null {
  let dayStart = startOfLocalDay(at)
  for (let i = 0; i <= MAX_DAY_ITERATIONS; i += 1) {
    for (const p of periodsForDay(cal, dayStart)) {
      const open = atLocalMinute(dayStart, p.openMinute)
      const close = atLocalMinute(dayStart, p.closeMinute)
      if (at < open) return open
      if (at >= open && at < close) return at
    }
    dayStart = addLocalDays(dayStart, 1)
  }
  /* v8 ignore next -- only reachable with a calendar that never opens */
  return null
}

/** Total working minutes available on the London day containing `at`. */
export function workingMinutesInDay(cal: BusinessCalendar, at: Instant): number {
  return periodsForDay(cal, at).reduce((sum, p) => sum + (p.closeMinute - p.openMinute), 0)
}
