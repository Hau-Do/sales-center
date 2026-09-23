import { createContext, useContext } from 'react'
import type { Instant } from '@/domain/instant'

export interface ClockValue {
  /** The domain's current instant: the seeded base plus any elapsed time. */
  readonly now: Instant
  readonly frozen: boolean
  advance(ms: number): void
}

export const ClockContext = createContext<ClockValue | null>(null)

export function useClock(): ClockValue {
  const value = useContext(ClockContext)
  if (value === null) throw new Error('useClock must be used inside a ClockProvider')
  return value
}

/** Just the instant, for the many components that only need to read it. */
export function useNow(): Instant {
  return useClock().now
}
