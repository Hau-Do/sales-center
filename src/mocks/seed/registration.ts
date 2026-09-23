/**
 * UK registration marks, in the current (2001-) format: two area letters, a
 * two-digit age identifier, then three random letters — "LV19 XKD".
 *
 * The age identifier is the part people get wrong. It changes twice a year:
 * March plates take the last two digits of the year, September plates take
 * that plus 50. So a car first registered in September 2019 wears a "69"
 * plate, not a "19", and one registered in January 2020 still wears "69"
 * because it precedes that March's change.
 */

import { type Instant, toLocalParts } from '@/domain/instant'

export function ageIdentifierFor(registeredAt: Instant): string {
  const { year, month } = toLocalParts(registeredAt)
  const yy = year % 100
  if (month >= 3 && month <= 8) return String(yy).padStart(2, '0')
  if (month >= 9) return String(yy + 50).padStart(2, '0')
  // January and February still carry the previous September's identifier.
  return String(((year - 1) % 100) + 50).padStart(2, '0')
}

export function formatRegistration(area: string, ageIdentifier: string, suffix: string): string {
  return `${area}${ageIdentifier} ${suffix}`
}

/** True for a correctly-formed current-style mark. */
export function isValidRegistration(reg: string): boolean {
  return /^[A-Z]{2}\d{2} [A-Z]{3}$/.test(reg)
}
