/**
 * Ports — the only channels through which nondeterminism reaches the domain.
 *
 * `src/domain` is lint-enforced to contain no `Date.now()`, `new Date()` or
 * `Math.random()`. Anything that varies between two runs must arrive as an
 * argument, which is what makes the domain's tests reproducible and what lets
 * Cypress freeze the entire application's sense of time from a URL parameter.
 */

import type { Instant } from '@/domain/instant'

export interface Clock {
  now(): Instant
}

export interface IdGenerator {
  next(prefix?: string): string
}

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number
}

export interface Ports {
  readonly clock: Clock
  readonly ids: IdGenerator
  readonly rng: Rng
}

/** A clock pinned to one instant. The default for tests. */
export function fixedClock(at: Instant): Clock {
  return { now: () => at }
}

/**
 * A clock that can be advanced by hand.
 *
 * Used by Cypress (`cy.advanceClock`) so a spec can watch an SLA chip cross
 * from amber into breach without waiting in real time.
 */
export function controllableClock(start: Instant): Clock & {
  advance(ms: number): void
  set(at: Instant): void
} {
  let current = start
  return {
    now: () => current,
    advance(ms: number) {
      current = (current + ms) as Instant
    },
    set(at: Instant) {
      current = at
    },
  }
}

/**
 * Deterministic id generator: `lead_0001`, `lead_0002`, ...
 *
 * Correlation ids route through this too, so a request trace is stable across
 * runs and a Cypress assertion can name one.
 */
export function sequentialIds(seed = 0): IdGenerator {
  let n = seed
  return {
    next(prefix = 'id') {
      n += 1
      return `${prefix}_${String(n).padStart(4, '0')}`
    },
  }
}

/**
 * mulberry32 — a small, fast, fully deterministic PRNG.
 *
 * Seeded from the URL (`?__rngSeed=`) so the generated dataset is byte-identical
 * on every machine and in CI. A seeded generator is the only honest way to have
 * both "realistic volume" and "assertable fixtures".
 */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
  }
}
