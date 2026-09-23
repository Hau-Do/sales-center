import { describe, it, expect } from 'vitest'
import {
  ZERO,
  absPence,
  addPence,
  allocatePence,
  clampPence,
  formatGBP,
  formatGBPSigned,
  isPence,
  maxPence,
  minPence,
  negatePence,
  pence,
  penceToPounds,
  positivePart,
  poundsToPence,
  roundHalfEven,
  roundHalfUp,
  scalePence,
  subPence,
} from './money'

describe('pence()', () => {
  it('accepts a whole number of pence', () => {
    expect(pence(2499500)).toBe(2499500)
  })

  it('accepts zero and negative amounts, because part-exchange equity can be negative', () => {
    expect(pence(0)).toBe(0)
    expect(pence(-85000)).toBe(-85000)
  })

  it('rejects a fractional penny rather than silently rounding it', () => {
    expect(() => pence(1234.5)).toThrow(/whole number/)
  })

  it('rejects NaN and Infinity', () => {
    expect(() => pence(Number.NaN)).toThrow(/finite/)
    expect(() => pence(Number.POSITIVE_INFINITY)).toThrow(/finite/)
  })

  it('rejects amounts beyond the safe integer range', () => {
    expect(() => pence(Number.MAX_SAFE_INTEGER + 2)).toThrow(/safe integer|whole number/)
  })
})

describe('poundsToPence()', () => {
  it('converts a clean amount', () => {
    expect(poundsToPence(24995)).toBe(2499500)
  })

  it('survives binary floating point: 19.99 * 100 is 1998.9999999999998', () => {
    expect(19.99 * 100).not.toBe(1999)
    expect(poundsToPence(19.99)).toBe(1999)
  })

  it.each([
    [0.1, 10],
    [0.29, 29],
    [1.005, 101],
    [429.73, 42973],
    [9248.15, 924815],
    [-850, -85000],
  ])('converts £%s to %ip', (pounds, expected) => {
    expect(poundsToPence(pounds)).toBe(expected)
  })

  it('round-trips through penceToPounds', () => {
    for (const p of [0, 1, 99, 100, 42973, 2499500, -85000]) {
      expect(poundsToPence(penceToPounds(pence(p)))).toBe(p)
    }
  })

  it('rejects a non-finite input', () => {
    expect(() => poundsToPence(Number.NaN)).toThrow(/finite/)
  })
})

describe('rounding modes', () => {
  it('roundHalfUp rounds halves away from zero', () => {
    expect(roundHalfUp(0.5)).toBe(1)
    expect(roundHalfUp(1.5)).toBe(2)
    expect(roundHalfUp(2.5)).toBe(3)
    expect(roundHalfUp(-0.5)).toBe(-1)
    expect(roundHalfUp(-2.5)).toBe(-3)
  })

  it('roundHalfUp leaves non-halves alone', () => {
    expect(roundHalfUp(0.49)).toBe(0)
    expect(roundHalfUp(0.51)).toBe(1)
    expect(roundHalfUp(-0.51)).toBe(-1)
  })

  it('roundHalfEven rounds non-halves to the nearest integer, like any rounding', () => {
    expect(roundHalfEven(2.7)).toBe(3)
    expect(roundHalfEven(2.2)).toBe(2)
    expect(roundHalfEven(-2.7)).toBe(-3)
    expect(roundHalfEven(-2.2)).toBe(-2)
  })

  it('roundHalfEven rounds halves to the nearest even integer', () => {
    expect(roundHalfEven(0.5)).toBe(0)
    expect(roundHalfEven(1.5)).toBe(2)
    expect(roundHalfEven(2.5)).toBe(2)
    expect(roundHalfEven(3.5)).toBe(4)
    expect(roundHalfEven(-1.5)).toBe(-2)
  })

  it('the two modes genuinely differ, so flipping the constant is observable', () => {
    expect(roundHalfUp(2.5)).not.toBe(roundHalfEven(2.5))
  })
})

describe('arithmetic', () => {
  it('adds a list of amounts', () => {
    expect(addPence(pence(100), pence(250), pence(7))).toBe(357)
  })

  it('adds an empty list to zero', () => {
    expect(addPence()).toBe(0)
  })

  it('subtracts, including into negative territory', () => {
    expect(subPence(pence(1000), pence(2500))).toBe(-1500)
  })

  it('negates and takes absolute value', () => {
    expect(negatePence(pence(-85000))).toBe(85000)
    expect(absPence(pence(-85000))).toBe(85000)
    expect(absPence(pence(85000))).toBe(85000)
  })

  it('scales by a rate and rounds to the penny', () => {
    // 0.37 residual on a £24,995 OTR price
    expect(scalePence(pence(2499500), 0.37)).toBe(924815)
  })

  it('scaling rounds rather than truncating', () => {
    expect(scalePence(pence(100), 0.005)).toBe(1)
    expect(scalePence(pence(100), 0.004)).toBe(0)
  })

  it('rejects a non-finite scale factor', () => {
    expect(() => scalePence(pence(100), Number.NaN)).toThrow(/finite/)
  })

  it('min, max and positivePart', () => {
    expect(maxPence(pence(10), pence(20))).toBe(20)
    expect(minPence(pence(10), pence(20))).toBe(10)
    expect(positivePart(pence(-850))).toBe(0)
    expect(positivePart(pence(850))).toBe(850)
  })

  it('clamps within bounds', () => {
    expect(clampPence(pence(50), pence(0), pence(100))).toBe(50)
    expect(clampPence(pence(-10), pence(0), pence(100))).toBe(0)
    expect(clampPence(pence(500), pence(0), pence(100))).toBe(100)
  })

  it('rejects an inverted clamp range rather than returning nonsense', () => {
    expect(() => clampPence(pence(50), pence(100), pence(0))).toThrow(/above hi/)
  })

  it('isPence discriminates', () => {
    expect(isPence(100)).toBe(true)
    expect(isPence(1.5)).toBe(false)
    expect(isPence('100')).toBe(false)
    expect(isPence(null)).toBe(false)
  })
})

describe('allocatePence()', () => {
  it('splits evenly when it divides cleanly', () => {
    expect(allocatePence(pence(900), [1, 1, 1])).toEqual([300, 300, 300])
  })

  it('gives leftover pennies to the largest remainders, never losing one', () => {
    expect(allocatePence(pence(100), [1, 1, 1])).toEqual([34, 33, 33])
  })

  it('weights proportionally', () => {
    expect(allocatePence(pence(1000), [3, 1])).toEqual([750, 250])
  })

  it.each([
    [pence(100), [1, 1, 1]],
    [pence(1), [1, 1, 1, 1, 1]],
    [pence(42973), [7, 11, 3]],
    [pence(999999), [1, 2, 3, 4, 5, 6, 7]],
    [pence(0), [5, 5]],
    [pence(7), [1]],
  ])('always sums back to exactly the total (%i)', (total, weights) => {
    const shares = allocatePence(total, weights)
    expect(shares.reduce((s, x) => s + x, 0)).toBe(total)
    expect(shares).toHaveLength(weights.length)
  })

  it('breaks remainder ties toward the earlier index, so it is deterministic', () => {
    expect(allocatePence(pence(100), [1, 1, 1])).toEqual(allocatePence(pence(100), [1, 1, 1]))
    expect(allocatePence(pence(10), [1, 1, 1, 1])).toEqual([3, 3, 2, 2])
  })

  it('returns an empty allocation for no weights', () => {
    expect(allocatePence(pence(100), [])).toEqual([])
  })

  it('puts everything on the first share when all weights are zero', () => {
    expect(allocatePence(pence(100), [0, 0, 0])).toEqual([100, 0, 0])
  })

  it('rejects negative or non-finite weights', () => {
    expect(() => allocatePence(pence(100), [1, -1])).toThrow(/non-negative/)
    expect(() => allocatePence(pence(100), [1, Number.NaN])).toThrow(/finite/)
  })
})

describe('formatting', () => {
  it('formats to two decimal places with a thousands separator', () => {
    expect(formatGBP(pence(2499500))).toBe('£24,995.00')
    expect(formatGBP(pence(42973))).toBe('£429.73')
    expect(formatGBP(ZERO)).toBe('£0.00')
  })

  it('formats whole pounds when asked', () => {
    expect(formatGBP(pence(2499500), { whole: true })).toBe('£24,995')
  })

  it('formats a negative amount', () => {
    expect(formatGBP(pence(-85000))).toBe('-£850.00')
  })

  it('formatGBPSigned always carries an explicit sign, for equity', () => {
    expect(formatGBPSigned(pence(85000))).toBe('+£850.00')
    expect(formatGBPSigned(pence(-85000))).toBe('-£850.00')
    expect(formatGBPSigned(ZERO)).toBe('£0.00')
  })
})

describe('poundsToPence() with exponential-form inputs', () => {
  // A number whose toString() is already exponential must fold the shift into
  // the existing exponent rather than concatenating a second one, which would
  // produce "1e-7e+2" and parse as NaN.
  it('handles a very small amount without producing NaN', () => {
    expect(poundsToPence(1e-7)).toBe(0)
    expect(poundsToPence(1e-4)).toBe(0)
    expect(poundsToPence(1e-2)).toBe(1)
  })

  it('treats a merely large number normally — toString only goes exponential at 1e21', () => {
    expect((1.5e3).toString()).toBe('1500')
    expect(poundsToPence(1.5e3)).toBe(150000)
  })

  it('rejects a large exponential amount, since any such value overflows pence', () => {
    // toString() is exponential from 1e21 up, and 1e21 * 100 is far beyond
    // MAX_SAFE_INTEGER — so the large branch can only ever refuse.
    expect((1e21).toString()).toBe('1e+21')
    expect(() => poundsToPence(1e21)).toThrow(/safe integer/)
    expect(() => poundsToPence(1e300)).toThrow(/safe integer/)
  })
})
