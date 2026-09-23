/// <reference types="cypress" />

/**
 * Custom commands.
 *
 * Two rules this suite lives by, both lint-enforced:
 *   - No `cy.wait(number)`. Fixed sleeps are how a suite rots into flakes.
 *     Wait on `cy.settled()`, which reads the app's own `data-app-busy`
 *     attribute (driven by TanStack Query's in-flight counts).
 *   - No `cy.intercept()`. MSW is the single mocking layer; cy.intercept stubs
 *     fetch inside the page so requests never reach the service worker, and the
 *     two silently fight.
 */

export type Scenario = 'default' | 'empty' | 'sla-breach' | 'negative-equity' | 'analytics-rich'

export interface VisitScenarioOptions {
  readonly scenario?: Scenario
  /** ISO instant to freeze the app clock at. */
  readonly now?: string
  readonly latencyMs?: number
  readonly errorRate?: number
  readonly rngSeed?: number
}

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Visit a path with the bootstrap contract applied.
       *
       * Reset happens in the page, before the worker starts and before React
       * renders — NOT over HTTP. `cy.request` is issued from Cypress's Node
       * process and can never reach an MSW service worker running in the
       * browser, so the usual "POST /__test__/reset" approach silently does
       * nothing and every spec inherits the previous spec's state.
       */
      visitScenario(path: string, options?: VisitScenarioOptions): Chainable<void>
      /** Wait until the application reports no in-flight queries or mutations. */
      settled(): Chainable<void>
      byTestId(
        testId: string,
        options?: Partial<Cypress.Loggable & Cypress.Timeoutable>,
      ): Chainable<JQuery<HTMLElement>>
      /** Move the frozen clock forward, then let the UI re-derive. */
      advanceClock(ms: number): Chainable<void>
      /** Run axe and print any violations to the CI log before failing. */
      checkA11yReported(context?: string): Chainable<void>
      /**
       * Opt this spec out of the console-error guard.
       *
       * For specs that deliberately drive an error path — the API client logs
       * every failed response, and that is the behaviour under test.
       */
      allowConsoleError(): Chainable<void>
    }
  }
}

Cypress.Commands.add('visitScenario', (path: string, options: VisitScenarioOptions = {}) => {
  const params = new URLSearchParams()
  params.set('__seed', options.scenario ?? 'default')
  // Pin the clock by default so nothing in the suite depends on real time.
  params.set('__now', options.now ?? '2026-09-19T08:15:00Z')
  if (options.latencyMs !== undefined) params.set('__latency', String(options.latencyMs))
  if (options.errorRate !== undefined) params.set('__errorRate', String(options.errorRate))
  if (options.rngSeed !== undefined) params.set('__rngSeed', String(options.rngSeed))

  const separator = path.includes('?') ? '&' : '?'
  cy.visit(`${path}${separator}${params.toString()}`)
  cy.byTestId('app-shell').should('exist')
  cy.settled()
})

Cypress.Commands.add('settled', () => {
  cy.get('[data-app-busy]', { timeout: 15000 }).should('have.attr', 'data-app-busy', 'false')
})

Cypress.Commands.add('byTestId', (testId: string, options = {}) =>
  cy.get(`[data-testid="${testId}"]`, options),
)

/**
 * Advance the frozen clock by re-entering the page with a later `__now`.
 *
 * An earlier version mutated the store via __testHooks and then called
 * cy.reload() — which silently undid itself, because the reloaded URL still
 * carried the original `__seed`/`__now` and the bootstrap reseeded from those.
 * Going through the URL contract keeps one mechanism in charge of the clock.
 */
Cypress.Commands.add('advanceClock', (ms: number) => {
  cy.location().then((loc) => {
    const params = new URLSearchParams(loc.search)
    const currentNow = params.get('__now')
    const base = currentNow === null ? Date.parse('2026-09-19T08:15:00Z') : Date.parse(currentNow)
    params.set('__now', new Date(base + ms).toISOString())
    cy.visit(`${loc.pathname}?${params.toString()}`)
    cy.byTestId('app-shell').should('exist')
    cy.settled()
  })
})

Cypress.Commands.add('checkA11yReported', (context?: string) => {
  cy.injectAxe()
  cy.checkA11y(
    context,
    {
      rules: {
        // Radix portals its dialog content to the body, so the resulting
        // landmark nesting is a known false positive rather than a real defect.
        region: { enabled: false },
      },
    },
    (violations) => {
      cy.task('a11yReport', violations, { log: false })
    },
  )
})
