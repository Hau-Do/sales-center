import { describe, it, expect } from 'vitest'
import {
  type BusinessCalendar,
  DEFAULT_CALENDAR,
  MAX_DAY_ITERATIONS,
  addWorkingMinutes,
  hm,
  isOpen,
  nextOpening,
  periodsForDay,
  validateCalendar,
  workingMinutesBetween,
  workingMinutesInDay,
} from './businessHours'
import { fromISO, toISO } from './instant'

/*
 * The anchor case for the whole SLA story, verified against Intl:
 *   Friday 18 Sep 2026, 17:52 BST  ==  2026-09-18T16:52:00Z
 *   Friday hours 08:30-18:00  -> 8 working minutes remain that day
 *   Saturday hours 09:00-17:00 -> a 30-minute target resumes Saturday 09:00
 *                                 and is due at 09:22 BST == 08:22Z
 */
const FRI_1752 = fromISO('2026-09-18T16:52:00Z')
const SAT_0900 = fromISO('2026-09-19T08:00:00Z')
const MON_1000 = fromISO('2026-09-21T09:00:00Z') // Monday 21 Sep, 10:00 BST

describe('DEFAULT_CALENDAR', () => {
  it('is internally valid', () => {
    expect(() => validateCalendar(DEFAULT_CALENDAR)).not.toThrow()
  })

  it('trades on Sunday, because UK franchised showrooms do (ASM-SLA-02)', () => {
    const sunday = fromISO('2026-09-20T12:00:00Z')
    expect(periodsForDay(DEFAULT_CALENDAR, sunday)).toEqual([
      { openMinute: hm(10), closeMinute: hm(16) },
    ])
    expect(workingMinutesInDay(DEFAULT_CALENDAR, sunday)).toBe(360)
  })

  it('opens 08:30-18:00 on a weekday, 09:00-17:00 on Saturday', () => {
    expect(workingMinutesInDay(DEFAULT_CALENDAR, MON_1000)).toBe(570)
    expect(workingMinutesInDay(DEFAULT_CALENDAR, SAT_0900)).toBe(480)
  })

  it('closes on bank holidays', () => {
    // Summer bank holiday, Monday 31 August 2026.
    const bankHoliday = fromISO('2026-08-31T11:00:00Z')
    expect(periodsForDay(DEFAULT_CALENDAR, bankHoliday)).toEqual([])
    expect(workingMinutesInDay(DEFAULT_CALENDAR, bankHoliday)).toBe(0)
    expect(isOpen(DEFAULT_CALENDAR, bankHoliday)).toBe(false)
  })

  it('applies bespoke hours on Christmas Eve', () => {
    const christmasEve = fromISO('2026-12-24T10:00:00Z')
    expect(workingMinutesInDay(DEFAULT_CALENDAR, christmasEve)).toBe(240)
  })
})

describe('isOpen()', () => {
  it('is open during hours and closed outside them', () => {
    expect(isOpen(DEFAULT_CALENDAR, FRI_1752)).toBe(true)
    expect(isOpen(DEFAULT_CALENDAR, fromISO('2026-09-18T20:00:00Z'))).toBe(false) // 21:00 BST
    expect(isOpen(DEFAULT_CALENDAR, fromISO('2026-09-18T05:00:00Z'))).toBe(false) // 06:00 BST
  })

  it('treats opening as inclusive and closing as exclusive', () => {
    // Saturday 09:00 BST exactly = open; 17:00 BST exactly = closed.
    expect(isOpen(DEFAULT_CALENDAR, SAT_0900)).toBe(true)
    expect(isOpen(DEFAULT_CALENDAR, fromISO('2026-09-19T16:00:00Z'))).toBe(false)
    expect(isOpen(DEFAULT_CALENDAR, fromISO('2026-09-19T15:59:00Z'))).toBe(true)
  })
})

describe('workingMinutesBetween()', () => {
  it('counts only the minutes the showroom was open — the Friday 17:52 case', () => {
    expect(workingMinutesBetween(DEFAULT_CALENDAR, FRI_1752, SAT_0900)).toBe(8)
  })

  it('does not count the overnight close', () => {
    // Friday 17:52 -> Saturday 09:30 BST: 8 on Friday + 30 on Saturday.
    const satMorning = fromISO('2026-09-19T08:30:00Z')
    expect(workingMinutesBetween(DEFAULT_CALENDAR, FRI_1752, satMorning)).toBe(38)
  })

  it('accumulates across a full weekend into Monday', () => {
    // 8 (Fri) + 480 (Sat) + 360 (Sun) + 90 (Mon 08:30-10:00) = 938
    expect(workingMinutesBetween(DEFAULT_CALENDAR, FRI_1752, MON_1000)).toBe(938)
  })

  it('returns 0 when the range is empty or inverted', () => {
    expect(workingMinutesBetween(DEFAULT_CALENDAR, FRI_1752, FRI_1752)).toBe(0)
    expect(workingMinutesBetween(DEFAULT_CALENDAR, SAT_0900, FRI_1752)).toBe(0)
  })

  it('counts a whole open day exactly', () => {
    const monOpen = fromISO('2026-09-21T07:30:00Z') // 08:30 BST
    const monClose = fromISO('2026-09-21T17:00:00Z') // 18:00 BST
    expect(workingMinutesBetween(DEFAULT_CALENDAR, monOpen, monClose)).toBe(570)
  })

  it('skips a bank holiday entirely', () => {
    // Fri 28 Aug 17:00 BST -> Tue 1 Sep 09:00 BST. Sat 480 + Sun 360, Mon 31st closed,
    // plus 60 on Friday (17:00-18:00) and 30 on Tuesday (08:30-09:00).
    const friEvening = fromISO('2026-08-28T16:00:00Z')
    const tueMorning = fromISO('2026-09-01T08:00:00Z')
    expect(workingMinutesBetween(DEFAULT_CALENDAR, friEvening, tueMorning)).toBe(
      60 + 480 + 360 + 0 + 30,
    )
  })

  it('stays correct across the October DST change', () => {
    // Sat 24 Oct 16:00 BST -> Sun 25 Oct 16:00 GMT. Saturday closes at 17:00,
    // so 60 minutes on Saturday plus the whole Sunday 10:00-16:00 = 360.
    const before = fromISO('2026-10-24T15:00:00Z')
    const after = fromISO('2026-10-25T16:00:00Z')
    expect(workingMinutesBetween(DEFAULT_CALENDAR, before, after)).toBe(420)
  })

  it('throws rather than looping forever on a calendar that never opens', () => {
    const shut: BusinessCalendar = { weekly: {}, closures: [] }
    expect(() => workingMinutesBetween(shut, FRI_1752, fromISO('2030-01-01T00:00:00Z'))).toThrow(
      new RegExp(String(MAX_DAY_ITERATIONS)),
    )
  })
})

describe('addWorkingMinutes()', () => {
  it('spans the overnight close — the flagship SLA case', () => {
    // 30-minute target from Friday 17:52: 8 minutes before close, 22 left,
    // resuming Saturday 09:00 -> due 09:22 BST.
    const due = addWorkingMinutes(DEFAULT_CALENDAR, FRI_1752, 30)
    expect(toISO(due)).toBe('2026-09-19T08:22:00.000Z')
  })

  it('stays within the same day when there is room', () => {
    const due = addWorkingMinutes(DEFAULT_CALENDAR, fromISO('2026-09-18T09:00:00Z'), 45)
    expect(toISO(due)).toBe('2026-09-18T09:45:00.000Z')
  })

  it('starts the clock at opening when the enquiry lands out of hours', () => {
    // 22:00 BST Friday -> clock starts Saturday 09:00, 15 minutes -> 09:15 BST.
    const lateFriday = fromISO('2026-09-18T21:00:00Z')
    expect(toISO(addWorkingMinutes(DEFAULT_CALENDAR, lateFriday, 15))).toBe(
      '2026-09-19T08:15:00.000Z',
    )
  })

  it('skips a bank holiday', () => {
    // Sunday 30 Aug 15:30 BST, 60 minutes. Sunday closes 16:00 -> 30 minutes used.
    // Monday 31st is the bank holiday, so the rest resumes Tuesday 08:30 + 30 = 09:00.
    const sunday = fromISO('2026-08-30T14:30:00Z')
    expect(toISO(addWorkingMinutes(DEFAULT_CALENDAR, sunday, 60))).toBe('2026-09-01T08:00:00.000Z')
  })

  it('returns the opening instant for a zero-minute target out of hours', () => {
    const lateFriday = fromISO('2026-09-18T21:00:00Z')
    expect(toISO(addWorkingMinutes(DEFAULT_CALENDAR, lateFriday, 0))).toBe(
      '2026-09-19T08:00:00.000Z',
    )
  })

  it('is the inverse of workingMinutesBetween for a spread of targets', () => {
    for (const minutes of [0, 1, 8, 30, 90, 480, 900, 1500]) {
      const due = addWorkingMinutes(DEFAULT_CALENDAR, FRI_1752, minutes)
      expect(workingMinutesBetween(DEFAULT_CALENDAR, FRI_1752, due)).toBe(minutes)
    }
  })

  it('rejects a negative duration', () => {
    expect(() => addWorkingMinutes(DEFAULT_CALENDAR, FRI_1752, -1)).toThrow(/negative/)
  })

  it('throws rather than looping forever on a calendar that never opens', () => {
    const shut: BusinessCalendar = { weekly: {}, closures: [] }
    expect(() => addWorkingMinutes(shut, FRI_1752, 30)).toThrow(
      new RegExp(String(MAX_DAY_ITERATIONS)),
    )
  })
})

describe('nextOpening()', () => {
  it('returns the instant itself when already open', () => {
    expect(nextOpening(DEFAULT_CALENDAR, FRI_1752)).toBe(FRI_1752)
  })

  it('returns the next opening when closed', () => {
    const lateFriday = fromISO('2026-09-18T21:00:00Z')
    expect(toISO(nextOpening(DEFAULT_CALENDAR, lateFriday) ?? FRI_1752)).toBe(
      '2026-09-19T08:00:00.000Z',
    )
  })

  it('jumps over a bank holiday', () => {
    const bankHolidayMorning = fromISO('2026-08-31T06:00:00Z')
    expect(toISO(nextOpening(DEFAULT_CALENDAR, bankHolidayMorning) ?? FRI_1752)).toBe(
      '2026-09-01T07:30:00.000Z',
    )
  })
})

describe('validateCalendar()', () => {
  it('rejects a period that closes before it opens', () => {
    expect(() =>
      validateCalendar({
        weekly: { 1: [{ openMinute: hm(18), closeMinute: hm(9) }] },
        closures: [],
      }),
    ).toThrow(/closes before it opens/)
  })

  it('rejects overlapping or out-of-order periods', () => {
    expect(() =>
      validateCalendar({
        weekly: {
          1: [
            { openMinute: hm(12), closeMinute: hm(18) },
            { openMinute: hm(9), closeMinute: hm(11) },
          ],
        },
        closures: [],
      }),
    ).toThrow(/overlap or are out of order/)
  })

  it('rejects a period outside the day', () => {
    expect(() =>
      validateCalendar({ weekly: { 1: [{ openMinute: hm(9), closeMinute: 1500 }] }, closures: [] }),
    ).toThrow(/outside the day/)
  })

  it('accepts a split shift', () => {
    expect(() =>
      validateCalendar({
        weekly: {
          1: [
            { openMinute: hm(9), closeMinute: hm(13) },
            { openMinute: hm(14), closeMinute: hm(18) },
          ],
        },
        closures: [],
      }),
    ).not.toThrow()
  })
})
