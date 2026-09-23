import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Instant } from '@/domain/instant'
import { isE2E } from '@/bootstrap'
import { ClockContext, type ClockValue } from './clockContext'

/**
 * One clock for the whole application.
 *
 * Every SLA chip, countdown and "x minutes ago" descends from this single
 * value rather than each calling the ambient clock on its own. Two payoffs:
 * one interval drives the entire screen instead of one per card, and freezing
 * this context freezes the app's entire sense of time — which is what makes
 * the E2E suite deterministic.
 *
 * Under `VITE_E2E` the clock does NOT advance on its own. It moves only when a
 * spec asks it to, via `window.__testHooks.advanceClock(ms)`.
 */

export interface ClockProviderProps {
  readonly base: Instant
  readonly children: ReactNode
  /** Tick interval in ms. One second is enough for a minute-resolution countdown. */
  readonly tickMs?: number
}

export function ClockProvider({ base, children, tickMs = 1000 }: ClockProviderProps) {
  const frozen = isE2E()
  const [offsetMs, setOffsetMs] = useState(0)
  const mountedAtRef = useRef<number | null>(null)

  useEffect(() => {
    if (frozen) return undefined
    mountedAtRef.current = performance.now()
    const id = setInterval(() => {
      const startedAt = mountedAtRef.current
      if (startedAt !== null) setOffsetMs(Math.floor(performance.now() - startedAt))
    }, tickMs)
    return () => clearInterval(id)
  }, [frozen, tickMs])

  const advance = useCallback((ms: number) => {
    setOffsetMs((current) => current + ms)
  }, [])

  const value = useMemo<ClockValue>(
    () => ({ now: (base + offsetMs) as Instant, frozen, advance }),
    [base, offsetMs, frozen, advance],
  )

  return <ClockContext.Provider value={value}>{children}</ClockContext.Provider>
}
