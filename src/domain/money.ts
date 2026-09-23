/**
 * Money, as integer pence.
 *
 * No float ever holds a monetary amount in this layer. A PCP quote chains a
 * dozen operations — discount, contributions, part-exchange equity, an
 * amortisation schedule over 48 periods — and binary floating point drifts a
 * penny somewhere in the middle of that chain every single time. The finance
 * engine asserts penny-exact invariants (the schedule's closing balance must
 * equal the GMFV exactly), and those invariants are only meaningful over
 * integers.
 *
 * `Pence` is branded so a raw number cannot be passed where an amount is
 * expected. The brand is erased at runtime; it costs nothing.
 */

declare const penceBrand: unique symbol

export type Pence = number & { readonly [penceBrand]: true }

/**
 * Rounding convention for money.
 *
 * UK consumer-credit documentation rounds half away from zero, not to even.
 * Named and exported rather than inlined so `scripts/mutation-sanity.mjs` can
 * flip it and prove the finance suite actually notices.
 */
export const MONEY_ROUNDING: 'half-up' | 'half-even' = 'half-up'

/** Round half away from zero: 0.5 -> 1, -0.5 -> -1. */
export function roundHalfUp(x: number): number {
  return x < 0 ? -Math.round(-x) : Math.round(x)
}

/** Round half to even ("banker's rounding"): 0.5 -> 0, 1.5 -> 2, -0.5 -> -0. */
export function roundHalfEven(x: number): number {
  const floor = Math.floor(x)
  const diff = x - floor
  if (diff > 0.5) return floor + 1
  if (diff < 0.5) return floor
  return floor % 2 === 0 ? floor : floor + 1
}

function applyRounding(x: number): number {
  /* v8 ignore next -- MONEY_ROUNDING is a compile-time constant, so only the
     configured branch is reachable. scripts/mutation-sanity.mjs flips it and
     asserts the finance suite goes red, which is what proves this line matters. */
  return MONEY_ROUNDING === 'half-up' ? roundHalfUp(x) : roundHalfEven(x)
}

export const ZERO = 0 as Pence

/** Construct from an integer number of pence. Throws on a non-integer. */
export function pence(n: number): Pence {
  if (!Number.isFinite(n)) {
    throw new RangeError(`Pence must be finite, received ${String(n)}`)
  }
  if (!Number.isInteger(n)) {
    throw new RangeError(`Pence must be a whole number, received ${n}. Round before constructing.`)
  }
  if (!Number.isSafeInteger(n)) {
    throw new RangeError(`Pence ${n} exceeds the safe integer range`)
  }
  return n as Pence
}

/**
 * Shift a number by `places` decimal digits without going through a binary
 * multiply.
 *
 * `1.005 * 100` is `100.49999999999999`, so rounding it gives 100 — a penny
 * lost on an amount a human typed as £1.005. Shifting the *decimal string*
 * representation instead keeps the value the user actually wrote, because
 * `Number('1.005e+2')` parses the decimal literal directly.
 *
 * Found by a failing test case, not by inspection; see docs/ai-collaboration/corrections.md.
 */
function shiftTwoDecimalPlaces(x: number): number {
  const s = x.toString()
  const e = s.search(/[eE]/)
  if (e === -1) return Number(`${s}e+2`)
  // Already in exponential form (|x| >= 1e21, or very small) — fold the shift
  // into the existing exponent rather than concatenating two of them, which
  // would produce "1e-7e+2" and parse as NaN.
  const mantissa = s.slice(0, e)
  const exponent = Number(s.slice(e + 1)) + 2
  return Number(`${mantissa}e${exponent}`)
}

/** Construct from pounds. `poundsToPence(249.99) === 24999`. */
export function poundsToPence(pounds: number): Pence {
  if (!Number.isFinite(pounds)) {
    throw new RangeError(`Pounds must be finite, received ${String(pounds)}`)
  }
  return pence(applyRounding(shiftTwoDecimalPlaces(pounds)))
}

export function penceToPounds(p: Pence): number {
  return p / 100
}

export function isPence(n: unknown): n is Pence {
  return typeof n === 'number' && Number.isSafeInteger(n)
}

export function addPence(...amounts: readonly Pence[]): Pence {
  return pence(amounts.reduce<number>((total, a) => total + a, 0))
}

export function subPence(a: Pence, b: Pence): Pence {
  return pence(a - b)
}

export function negatePence(a: Pence): Pence {
  return pence(-a)
}

export function absPence(a: Pence): Pence {
  return pence(Math.abs(a))
}

/** Multiply by a rate (a proportion, an interest factor) and round to the penny. */
export function scalePence(a: Pence, factor: number): Pence {
  if (!Number.isFinite(factor)) {
    throw new RangeError(`Scale factor must be finite, received ${String(factor)}`)
  }
  return pence(applyRounding(a * factor))
}

export function maxPence(a: Pence, b: Pence): Pence {
  return a >= b ? a : b
}

export function minPence(a: Pence, b: Pence): Pence {
  return a <= b ? a : b
}

export function clampPence(value: Pence, lo: Pence, hi: Pence): Pence {
  if (lo > hi) throw new RangeError(`clampPence called with lo (${lo}) above hi (${hi})`)
  return minPence(maxPence(value, lo), hi)
}

/** Positive part. Used wherever only money the customer actually pays counts. */
export function positivePart(a: Pence): Pence {
  return maxPence(a, ZERO)
}

/**
 * Split an amount across weights so the parts sum to EXACTLY the total.
 *
 * Largest-remainder: floor every share, then hand the leftover pennies to the
 * largest fractional remainders. Naive rounding of each share independently
 * loses or invents pennies, which is how a total ends up a penny off its own
 * breakdown on screen.
 *
 * Ties break toward the earlier index, so the result is deterministic.
 */
export function allocatePence(total: Pence, weights: readonly number[]): Pence[] {
  if (weights.length === 0) return []
  if (weights.some((w) => !Number.isFinite(w) || w < 0)) {
    throw new RangeError('allocatePence weights must all be finite and non-negative')
  }

  const weightSum = weights.reduce((s, w) => s + w, 0)
  if (weightSum === 0) {
    // Nothing to weight by — put it all on the first share so the sum still holds.
    return weights.map((_, i) => (i === 0 ? total : ZERO))
  }

  const exact = weights.map((w) => (total * w) / weightSum)
  const floors = exact.map((x) => Math.floor(x))
  const distributed = floors.reduce((s, f) => s + f, 0)
  let remaining = total - distributed

  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => (b.frac === a.frac ? a.i - b.i : b.frac - a.frac))

  const shares = [...floors]
  let k = 0
  /* v8 ignore start -- `order` is non-empty inside the loop and every index it
     carries came from `exact`, so both fallbacks exist only to satisfy
     noUncheckedIndexedAccess and cannot be taken at runtime. */
  while (remaining > 0 && order.length > 0) {
    const entry = order[k % order.length]
    if (entry === undefined) break
    shares[entry.i] = (shares[entry.i] ?? 0) + 1
    remaining -= 1
    k += 1
  }
  /* v8 ignore stop */

  return shares.map((s) => pence(s))
}

const GBP = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const GBP_WHOLE = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

/** `formatGBP(pence(249999))` -> `"£2,499.99"`. */
export function formatGBP(p: Pence, opts?: { readonly whole?: boolean }): string {
  return opts?.whole === true
    ? GBP_WHOLE.format(Math.round(penceToPounds(p)))
    : GBP.format(penceToPounds(p))
}

/** Always carries an explicit sign. Used for part-exchange equity. */
export function formatGBPSigned(p: Pence): string {
  return p > 0 ? `+${formatGBP(p)}` : formatGBP(p)
}
