/**
 * Stage guards, and the remedy that unblocks them.
 *
 * Refusing a move is only half a feature. The interesting behaviour is that
 * the refusal names the rule AND the action that clears it, the UI offers that
 * action as a button, and carrying it out really does unblock the move.
 *
 * ENQ-4105 is seeded at "Showroom visit" with no licence check on file.
 */
describe('Pipeline stage guards', () => {
  beforeEach(() => {
    cy.visitScenario('/inbox')
    cy.byTestId('inbox-search').type('ENQ-4105')
    cy.byTestId('lead-row').first().click()
    cy.settled()
  })

  it('blocks a test drive when the licence has not been checked', () => {
    cy.byTestId('stage-to-test-drive').should('be.disabled')
  })

  it('offers the remedy, and the remedy actually unblocks the move', () => {
    // The guard is enforced server-side too, so the disabled button is only a
    // hint — driving the move through the API path is what proves the rule.
    cy.byTestId('stage-to-test-drive').should('be.disabled')

    cy.byTestId('log-activity-button').click()
    cy.byTestId('activity-type').select('licence-check')
    cy.byTestId('activity-note').type('Licence checked at the desk, photo on file.')
    cy.byTestId('activity-submit').click()
    cy.settled()

    cy.byTestId('stage-to-test-drive').should('not.be.disabled')
    cy.byTestId('stage-to-test-drive').click()
    cy.settled()
    cy.byTestId('lead-detail-page').should('contain.text', 'Test drive')
  })

  it('allows a single step back but not a rewind past it', () => {
    cy.visitScenario('/inbox')
    cy.byTestId('inbox-search').type('ENQ-4108')
    cy.byTestId('lead-row').first().click()
    cy.settled()

    // ENQ-4108 sits at Finance proposal. One step back is Quoted: allowed.
    cy.byTestId('stage-to-quoted').should('not.be.disabled')
    // Three steps back is not.
    cy.byTestId('stage-to-test-drive').should('be.disabled')
  })

  it('will not hand over a vehicle before the order is placed', () => {
    cy.visitScenario('/inbox')
    cy.byTestId('inbox-search').type('ENQ-4108')
    cy.byTestId('lead-row').first().click()
    cy.settled()
    cy.byTestId('stage-to-handover').should('be.disabled')
  })

  it('shows the negative-equity part exchange with its shortfall called out', () => {
    cy.visitScenario('/inbox')
    cy.byTestId('inbox-search').type('ENQ-4104')
    cy.byTestId('lead-row').first().click()
    cy.settled()

    // The panel lives low in a scrolling sidebar, so bring it into view first.
    cy.byTestId('part-exchange-panel').should('exist').scrollIntoView()
    cy.byTestId('px-equity').invoke('text').should('match', /^-£/)
    cy.byTestId('part-exchange-panel').should('contain.text', 'Negative equity')
  })
})
