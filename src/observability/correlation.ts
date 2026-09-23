/**
 * Correlation ids.
 *
 * Deliberately NOT `crypto.randomUUID()`: a seeded, sequential id keeps a
 * Cypress run reproducible and lets a spec assert on a specific trace. The
 * format stays obviously-an-id so it reads well in the debug panel.
 */

let counter = 0

export function nextCorrelationId(): string {
  counter += 1
  return `req-${String(counter).padStart(5, '0')}`
}

/** Reset between tests, so ids are stable per spec. */
export function resetCorrelationIds(): void {
  counter = 0
}

export const CORRELATION_HEADER = 'x-correlation-id'
