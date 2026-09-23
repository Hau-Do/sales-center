/**
 * Time, as branded epoch milliseconds.
 *
 * ISO strings are a tempting representation but they force a parse/format
 * round-trip into every comparison, and that round-trip is where timezone bugs
 * breed. An `Instant` is an absolute point on the timeline — unambiguous, cheap
 * to compare, cheap to subtract.
 *
 * Everything a salesperson *sees*, though, is London wall-clock time: the
 * showroom opens at 09:00 local, not at 09:00Z. So this module also owns the
 * conversion between the two, including the two days a year when the mapping is
 * not one-to-one.
 */

declare const instantBrand: unique symbol

export type Instant = number & { readonly [instantBrand]: true }

export const SECOND_MS = 1_000
export const MINUTE_MS = 60_000
export const HOUR_MS = 3_600_000
export const DAY_MS = 86_400_000

export const SHOWROOM_TIME_ZONE = 'Europe/London'

export function instant(ms: number): Instant {
  if (!Number.isFinite(ms)) {
    throw new RangeError(`Instant must be finite, received ${String(ms)}`)
  }
  if (!Number.isInteger(ms)) {
    throw new RangeError(`Instant must be whole milliseconds, received ${ms}`)
  }
  return ms as Instant
}

export function fromISO(iso: string): Instant {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) {
    throw new RangeError(`Unparseable ISO timestamp: ${iso}`)
  }
  return ms as Instant
}

export function toISO(i: Instant): string {
  return new Date(i).toISOString()
}

export function addMs(i: Instant, ms: number): Instant {
  return instant(i + ms)
}

export function addMinutes(i: Instant, minutes: number): Instant {
  return instant(i + minutes * MINUTE_MS)
}

export function addHours(i: Instant, hours: number): Instant {
  return instant(i + hours * HOUR_MS)
}

export function addDays(i: Instant, days: number): Instant {
  return instant(i + days * DAY_MS)
}

/** Whole minutes from `a` to `b`, truncated toward zero. */
export function diffMinutes(a: Instant, b: Instant): number {
  return Math.trunc((b - a) / MINUTE_MS)
}

export function diffMs(a: Instant, b: Instant): number {
  return b - a
}

export function compareInstants(a: Instant, b: Instant): number {
  return a - b
}

export function minInstant(a: Instant, b: Instant): Instant {
  return a <= b ? a : b
}

export function maxInstant(a: Instant, b: Instant): Instant {
  return a >= b ? a : b
}

export function isBefore(a: Instant, b: Instant): boolean {
  return a < b
}

export function isAfter(a: Instant, b: Instant): boolean {
  return a > b
}

// ---------------------------------------------------------------------------
// London wall-clock conversion
// ---------------------------------------------------------------------------

/** A London wall-clock reading. `month` is 1-12; `weekday` is 0=Sunday. */
export interface LocalParts {
  readonly year: number
  readonly month: number
  readonly day: number
  readonly hour: number
  readonly minute: number
  readonly second: number
  readonly weekday: number
}

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: SHOWROOM_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

/** Decompose an Instant into London wall-clock parts. */
export function toLocalParts(i: Instant): LocalParts {
  const parts = partsFormatter.formatToParts(new Date(i))
  const get = (type: string): number => {
    const found = parts.find((p) => p.type === type)
    /* v8 ignore next -- Intl always emits every requested field */
    if (!found) throw new Error(`Intl did not return a ${type} part`)
    return Number(found.value)
  }

  const year = get('year')
  const month = get('month')
  const day = get('day')

  // Day-of-week of the LONDON calendar date, not of the UTC date. Building a
  // UTC date from the local Y/M/D gives that directly.
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()

  return {
    year,
    month,
    day,
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
    weekday,
  }
}

/** Minutes that London is ahead of UTC at this instant (0 in GMT, 60 in BST). */
export function londonOffsetMinutes(i: Instant): number {
  const p = toLocalParts(i)
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  // Round to the minute: the underlying instant may carry milliseconds that the
  // formatter dropped, which would otherwise show up as a fractional offset.
  return Math.round((asIfUtc - Math.floor(i / 1000) * 1000) / MINUTE_MS)
}

export function isBritishSummerTime(i: Instant): boolean {
  return londonOffsetMinutes(i) !== 0
}

/**
 * The inverse: a London wall-clock reading back to an absolute Instant.
 *
 * This is the bounded inverse the whole SLA engine rests on. Two days a year it
 * is not a bijection:
 *
 *  - **Clocks go back** (e.g. 25 Oct 2026, 02:00 BST -> 01:00 GMT). 01:30 local
 *    happens twice. We return the FIRST occurrence — the BST one — which is the
 *    earlier instant. Documented as ASM-SLA-02, and asserted in the tests.
 *  - **Clocks go forward** (e.g. 29 Mar 2026, 01:00 GMT -> 02:00 BST). 01:30
 *    local never happens. We clamp forward to the first instant that does exist,
 *    so an opening time that falls in the gap still opens.
 *
 * Method: a DST transition shifts the offset by at most an hour, so sampling
 * the offset 24h either side of the target brackets any transition. Each
 * sampled offset yields a candidate; the candidates that round-trip are the
 * real answers, and taking the smallest picks the first occurrence.
 *
 * A two-pass Newton-style correction is NOT enough here — on a fall-back day
 * both passes converge on the post-transition offset and the earlier (BST)
 * candidate is never generated at all. Caught by a failing test; see
 * docs/ai-collaboration/corrections.md.
 */
export function fromLocalParts(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Instant {
  const target = Date.UTC(year, month - 1, day, hour, minute, second)

  const offsets = new Set([
    londonOffsetMinutes((target - DAY_MS) as Instant),
    londonOffsetMinutes(target as Instant),
    londonOffsetMinutes((target + DAY_MS) as Instant),
  ])

  const candidates = [...offsets]
    .map((off) => (target - off * MINUTE_MS) as Instant)
    .sort((a, b) => a - b)

  for (const candidate of candidates) {
    const back = toLocalParts(candidate)
    if (
      back.year === year &&
      back.month === month &&
      back.day === day &&
      back.hour === hour &&
      back.minute === minute
    ) {
      return candidate
    }
  }

  // Nothing round-trips: the wall time falls in a spring-forward gap. Clamp to
  // the latest candidate, which is the first instant past the gap.
  /* v8 ignore next -- candidates is never empty; the Set always yields >= 1 offset */
  return candidates[candidates.length - 1] ?? (target as Instant)
}

/** Midnight at the start of the London day containing `i`. */
export function startOfLocalDay(i: Instant): Instant {
  const p = toLocalParts(i)
  return fromLocalParts(p.year, p.month, p.day, 0, 0, 0)
}

/** The same London wall-clock time `days` later — DST-safe, unlike adding 24h. */
export function addLocalDays(i: Instant, days: number): Instant {
  const p = toLocalParts(i)
  return fromLocalParts(p.year, p.month, p.day + days, p.hour, p.minute, p.second)
}

/** `2026-09-18` for the London day containing `i`. Stable sort/group key. */
export function localDateKey(i: Instant): string {
  const p = toLocalParts(i)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

export function isSameLocalDay(a: Instant, b: Instant): boolean {
  return localDateKey(a) === localDateKey(b)
}

/** Minutes since local midnight. The unit business hours are expressed in. */
export function minutesSinceLocalMidnight(i: Instant): number {
  const p = toLocalParts(i)
  return p.hour * 60 + p.minute
}
