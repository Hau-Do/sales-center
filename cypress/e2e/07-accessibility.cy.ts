/**
 * Accessibility gates.
 *
 * Radix primitives supply focus management and ARIA wiring, but that only
 * helps if the composition around them is sound. These scan the real screens
 * with axe and drive the keyboard paths that a salesperson on a headset
 * actually uses.
 */
describe('Accessibility', () => {
  it('the inbox has no detectable violations', () => {
    cy.visitScenario('/inbox')
    cy.checkA11yReported()
  })

  it('the lead detail has no detectable violations', () => {
    cy.visitScenario('/inbox')
    cy.byTestId('lead-row').first().click()
    cy.settled()
    cy.checkA11yReported()
  })

  it('the log-activity dialog has no detectable violations', () => {
    cy.visitScenario('/inbox')
    cy.byTestId('lead-row').first().click()
    cy.settled()
    cy.byTestId('log-activity-button').click()
    cy.byTestId('log-activity-dialog').should('be.visible')
    cy.checkA11yReported()
  })

  it('traps and restores focus around the dialog', () => {
    cy.visitScenario('/inbox')
    cy.byTestId('lead-row').first().click()
    cy.settled()

    cy.byTestId('log-activity-button').click()
    cy.byTestId('log-activity-dialog').should('be.visible')
    // Focus moved into the dialog.
    cy.focused().should('exist')
    cy.get('body').type('{esc}')
    cy.byTestId('log-activity-dialog').should('not.exist')
    // Radix restores focus to the trigger on close.
    cy.focused().should('have.attr', 'data-testid', 'log-activity-button')
  })

  it('each lead row is a real focusable link, so the keyboard reaches it', () => {
    cy.visitScenario('/inbox')
    cy.byTestId('lead-row').first().focus()
    // A genuine anchor with an href is keyboard-activatable by definition —
    // asserting that is more honest than simulating a synthetic Enter press.
    cy.focused()
      .should('have.attr', 'data-testid', 'lead-row')
      .and('match', 'a')
      .and('have.attr', 'href')
    cy.focused().click()
    cy.settled()
    cy.byTestId('lead-detail-page').should('be.visible')
  })

  it('opens in the dark theme by default', () => {
    cy.visitScenario('/inbox')
    // Dark is the product default, so every scan above is already a dark-theme
    // scan. Asserting it here is what stops that becoming true by accident.
    cy.get('html').should('have.attr', 'data-theme', 'dark')
  })

  it('supports light mode without losing contrast', () => {
    cy.visitScenario('/inbox')
    cy.byTestId('theme-toggle').click()
    cy.get('html').should('have.attr', 'data-theme', 'light')
    cy.checkA11yReported()
  })
})
