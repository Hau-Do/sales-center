/**
 * OBSERVABILITY (M9).
 *
 * The claim this project makes is that a reviewer can click something and
 * follow it through to the response it caused, without opening devtools. That
 * is only worth asserting against the REAL app: the unit tests prove the panel
 * renders records, but not that genuine API traffic reaches it.
 */
describe('Observability', () => {
  beforeEach(() => {
    cy.visitScenario('/inbox')
  })

  it('exposes a telemetry panel with a live record count', () => {
    cy.byTestId('debug-toggle').should('be.visible')
    cy.byTestId('debug-toggle')
      .invoke('text')
      .then((text) => {
        const count = Number(text.replace(/\D/g, ''))
        expect(count, 'loading the inbox already produced telemetry').to.be.greaterThan(0)
      })
  })

  it('shows the live trace of real API calls', () => {
    cy.byTestId('debug-toggle').click()
    cy.byTestId('debug-panel').should('be.visible')
    cy.byTestId('debug-row').should('have.length.greaterThan', 0)
    // The inbox load really did go over HTTP to the mock API.
    cy.byTestId('debug-panel').should('contain.text', 'api.response')
    cy.byTestId('debug-panel').should('contain.text', '/leads')
  })

  it('stamps every API call with a correlation id the server echoes back', () => {
    cy.byTestId('debug-toggle').click()
    // Not every record is a request — a web_vital correctly carries no
    // correlation id — so assert on the rows that ARE API calls.
    cy.byTestId('debug-row')
      .filter(':contains("api.")')
      .should('have.length.greaterThan', 0)
      .each(($row) => {
        expect($row.text()).to.match(/req-\d{5}/)
      })
  })

  it('records duration and status alongside the call', () => {
    cy.byTestId('debug-toggle').click()
    cy.byTestId('debug-panel').should('contain.text', 'durationMs')
    cy.byTestId('debug-panel').should('contain.text', 'status')
  })

  it('traces a user action end to end — logging an activity appears in telemetry', () => {
    cy.byTestId('lead-row').first().click()
    cy.settled()
    cy.byTestId('debug-toggle').click()
    cy.byTestId('debug-panel').should('be.visible')

    // Capture the trace depth before the action.
    cy.byTestId('debug-row')
      .its('length')
      .then((before) => {
        cy.byTestId('log-activity-button').click()
        cy.byTestId('activity-note').type('Traced through the telemetry panel.')
        cy.byTestId('activity-submit').click()
        cy.settled()

        cy.byTestId('debug-row').should('have.length.greaterThan', before)
        // The POST that created it is visible, with its own correlation id.
        cy.byTestId('debug-panel').should('contain.text', 'activities')
      })
  })

  it('can be cleared, and refills as work continues', () => {
    cy.byTestId('debug-toggle').click()
    cy.contains('button', 'Clear').click()
    cy.contains('No telemetry yet.').should('be.visible')

    // Switching views filters in the browser and issues no request, so drive
    // something that genuinely hits the API.
    cy.byTestId('lead-row').first().click()
    cy.settled()
    cy.byTestId('debug-row').should('have.length.greaterThan', 0)
  })

  it('reports Core Web Vitals into the same structured log', () => {
    // LCP and FCP resolve once the page has painted and settled.
    cy.byTestId('debug-toggle').click()
    cy.byTestId('debug-panel').should('contain.text', 'web_vital')
  })

  it('surfaces a deliberate server failure with a remedy, not a stack trace', () => {
    // The client logs every failed response; that is the path under test.
    cy.allowConsoleError()
    // Every write fails under this error rate, deterministically.
    cy.visitScenario('/inbox', { errorRate: 1 })
    cy.byTestId('lead-row').first().click()
    cy.settled()

    cy.byTestId('log-activity-button').click()
    cy.byTestId('activity-note').type('This save is meant to fail.')
    cy.byTestId('activity-submit').click()

    cy.byTestId('activity-error').should('be.visible')
    cy.byTestId('activity-error').should('contain.text', 'did not respond')
    // The remedy line is rendered verbatim from the domain error.
    cy.byTestId('activity-error').should('contain.text', 'your work has not been lost')
  })
})
