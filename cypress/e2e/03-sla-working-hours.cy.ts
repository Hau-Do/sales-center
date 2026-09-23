/**
 * The response clock counts WORKING minutes, not wall-clock minutes.
 *
 * This is the hardest claim the app makes, so it gets its own spec. The anchor
 * is a real enquiry in the seeded data: ENQ-4101 arrived at 17:52 on Friday
 * 18 September 2026, eight minutes before the showroom closed at 18:00.
 *
 * Naive wall-clock arithmetic would call it breached by Saturday morning.
 * Counting working minutes, it has consumed 8 minutes on Friday plus 15 more
 * since Saturday's 09:00 opening — 23 of its 30-minute target — so it is AMBER,
 * not breached. The whole SLA engine stands or falls on this distinction.
 */
describe('SLA working-hours arithmetic', () => {
  beforeEach(() => {
    cy.visitScenario('/inbox')
    cy.byTestId('inbox-search').type('ENQ-4101')
    cy.byTestId('lead-row').first().click()
    cy.settled()
  })

  it('shows the Friday 17:52 enquiry as due soon, NOT breached', () => {
    cy.byTestId('sla-chip').first().should('have.attr', 'data-sla-state', 'at-risk')
    cy.byTestId('sla-chip').first().should('not.have.attr', 'data-sla-state', 'breached')
  })

  it('counts 23 working minutes: 8 before Friday close plus 15 since Saturday open', () => {
    cy.byTestId('sla-explainer')
      .should('contain.text', '23')
      .and('contain.text', 'working')
      .and('contain.text', '30')
  })

  it('explains in plain English that the clock paused overnight', () => {
    cy.byTestId('sla-explainer')
      .should('contain.text', 'Fri 18 Sep, 17:52')
      .and('contain.text', 'Showroom closed')
      .and('contain.text', '18:00')
  })

  it('reports 7 working minutes left on the countdown', () => {
    // 30 target - 23 consumed = 7 remaining, rendered as 00:07.
    cy.byTestId('sla-countdown').first().should('have.text', '00:07')
  })

  it('tips into breach once the clock advances past the remaining 7 minutes', () => {
    cy.byTestId('sla-chip').first().should('have.attr', 'data-sla-state', 'at-risk')
    // Advance 10 minutes. The showroom is open on a Saturday morning, so all
    // ten are working minutes: 7 remaining becomes 3 overdue. advanceClock
    // stays on this lead's page, so no re-navigation is needed.
    cy.advanceClock(10 * 60 * 1000)
    cy.byTestId('sla-chip').first().should('have.attr', 'data-sla-state', 'breached')
    cy.byTestId('sla-countdown').first().should('have.text', '-00:03')
  })

  it('gives a walk-in no response target at all', () => {
    cy.visitScenario('/inbox')
    cy.byTestId('inbox-search').type('ENQ-4107')
    cy.byTestId('lead-row').first().click()
    cy.settled()
    cy.byTestId('sla-explainer').should('contain.text', 'already in the showroom')
  })
})
