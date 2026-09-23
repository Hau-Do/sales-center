/**
 * Application bootstrap, and the scenario contract.
 *
 * Reset happens HERE, from the URL, before the worker starts and before React
 * renders. That ordering is not a style choice — it is the only design that
 * works:
 *
 *   `cy.request()` is issued from Cypress's Node process, so it never passes
 *   through the page's service worker and can never reach an MSW handler.
 *   Any "reset the mock over HTTP from the test runner" design silently fails,
 *   leaving every spec starting from whatever the previous spec left behind.
 *
 * Driving reset from the URL sidesteps that entirely, is race-free by
 * construction, and has a pleasant side effect: every scenario becomes a
 * shareable link a reviewer can open.
 *
 *   /inbox?__seed=sla-breach&__now=2026-09-19T08:15:00Z&__latency=400
 */

import { type Instant, fromISO, instant } from '@/domain/instant'
import type { Store, StoreMeta } from '@/data/store'
import { DEMO_NOW, isScenarioName, type ScenarioName } from '@/mocks/seed/generate'

export interface BootstrapParams {
  readonly seed?: ScenarioName
  readonly now?: Instant
  readonly rngSeed?: number
  readonly latencyMs?: number
  readonly errorRate?: number
  /** True when any `__`-prefixed parameter was supplied. */
  readonly explicit: boolean
}

/** Parse the `__`-prefixed bootstrap contract out of a query string. */
export function parseBootstrapParams(search: string): BootstrapParams {
  const params = new URLSearchParams(search)
  const seedRaw = params.get('__seed')
  const nowRaw = params.get('__now')
  const rngRaw = params.get('__rngSeed')
  const latencyRaw = params.get('__latency')
  const errorRaw = params.get('__errorRate')

  const explicit = [seedRaw, nowRaw, rngRaw, latencyRaw, errorRaw].some((v) => v !== null)

  let now: Instant | undefined
  if (nowRaw !== null) {
    try {
      now = /^\d+$/.test(nowRaw) ? instant(Number(nowRaw)) : fromISO(nowRaw)
    } catch {
      // An unparseable clock falls back to the demo clock rather than taking
      // the app down — a mistyped deep link should still render something.
      now = undefined
    }
  }

  const numeric = (raw: string | null): number | undefined => {
    if (raw === null) return undefined
    const value = Number(raw)
    return Number.isFinite(value) && value >= 0 ? value : undefined
  }

  return {
    ...(seedRaw !== null && isScenarioName(seedRaw) ? { seed: seedRaw } : {}),
    ...(now !== undefined ? { now } : {}),
    ...(numeric(rngRaw) !== undefined ? { rngSeed: numeric(rngRaw)! } : {}),
    ...(numeric(latencyRaw) !== undefined ? { latencyMs: numeric(latencyRaw)! } : {}),
    ...(numeric(errorRaw) !== undefined ? { errorRate: numeric(errorRaw)! } : {}),
    explicit,
  }
}

/**
 * Decide what the store should hold, and make it so.
 *
 * Reseeds when the URL asks explicitly, or when nothing has been seeded yet.
 * Otherwise it leaves the existing data alone — that is what makes a logged
 * activity survive a reload.
 */
export function applyBootstrap(store: Store, params: BootstrapParams): StoreMeta {
  if (params.explicit || !store.isSeeded()) {
    return store.reset({
      scenario: params.seed ?? 'default',
      now: params.now ?? DEMO_NOW,
      ...(params.rngSeed !== undefined ? { rngSeed: params.rngSeed } : {}),
      ...(params.latencyMs !== undefined ? { latencyMs: params.latencyMs } : {}),
      ...(params.errorRate !== undefined ? { errorRate: params.errorRate } : {}),
    })
  }
  return store.meta()
}

/** True when the test-only surfaces should exist. Never gated on PROD. */
export const isE2E = (): boolean => import.meta.env.VITE_E2E === '1'
