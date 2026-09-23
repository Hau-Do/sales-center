import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { applyBootstrap, isE2E, parseBootstrapParams } from './bootstrap'
import { logger } from './observability/logger'
import { reportWebVitals } from './observability/webVitals'
import { systemClock } from './ports'

/**
 * Startup order matters, and this is the order:
 *
 *   1. Parse the `__`-prefixed bootstrap contract from the URL.
 *   2. Reset the store to the requested scenario.
 *   3. AWAIT worker.start() — MSW's own docs call out the race if you don't.
 *   4. Only then render React.
 *
 * Doing the reset here, in the page, is what makes it work at all: cy.request()
 * runs in Cypress's Node process and never reaches the service worker, so
 * "reset over HTTP from the test runner" silently does nothing. See DESIGN.md.
 */
async function start(): Promise<void> {
  const { worker, browserStore } = await import('./mocks/browser')
  const params = parseBootstrapParams(window.location.search)
  const meta = applyBootstrap(browserStore, params)
  const clockBase = params.now ?? systemClock().now()

  await worker.start({
    onUnhandledRequest: 'bypass',
    quiet: true,
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
  })

  logger.info('app.bootstrap', {
    scenario: meta.scenario,
    now: meta.now,
    latencyMs: meta.latencyMs,
    errorRate: meta.errorRate,
    e2e: isE2E(),
  })

  if (isE2E()) {
    // Kill CSS transitions so a scan or assertion can never land mid-animation.
    document.documentElement.dataset['e2e'] = 'true'

    // Mid-test manipulation only. The URL contract is the primary mechanism;
    // this exists so a spec can advance the clock without a full reload.
    ;(window as unknown as Record<string, unknown>)['__testHooks'] = {
      reset: (options: Parameters<typeof browserStore.reset>[0]) => browserStore.reset(options),
      meta: () => browserStore.meta(),
      setMeta: (patch: Parameters<typeof browserStore.setMeta>[0]) => browserStore.setMeta(patch),
    }
  }

  const rootEl = document.getElementById('root')
  if (!rootEl) throw new Error('Root element #root is missing from index.html')

  createRoot(rootEl).render(
    <StrictMode>
      <App clockBase={clockBase} />
    </StrictMode>,
  )

  reportWebVitals()
}

void start()
