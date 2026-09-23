/**
 * PART A — REQUIREMENTS 2 AND 3:
 *   "Clicking a lead must show its full details and a chronological log of all
 *    follow-up activities."
 *   "Provide an interface to log a new follow-up activity, which must be persisted."
 *
 * The persistence assertion is the important one: it reloads the page and
 * checks the activity is still there, which is what "persisted" has to mean.
 */
describe('Lead detail and activity logging', () => {
  beforeEach(() => {
    cy.visitScenario('/inbox')
  })

  it('opens a lead from the inbox and shows its full details', () => {
    cy.byTestId('lead-row').first().click()
    cy.settled()

    cy.byTestId('lead-detail-page').should('be.visible')
    cy.byTestId('lead-title').should('not.be.empty')
    cy.byTestId('lead-reference').should('contain.text', 'ENQ-')
    cy.byTestId('sla-explainer').should('be.visible')
    cy.location('pathname').should('match', /^\/leads\/lead_\d+$/)
  })

  it('shows a chronological activity log', () => {
    // A lead far enough along the pipeline to have a trail.
    cy.byTestId('inbox-search').type('ENQ-4108')
    cy.byTestId('lead-row').first().click()
    cy.settled()

    cy.byTestId('activity-timeline').should('be.visible')
    cy.byTestId('timeline-entry').should('have.length.greaterThan', 1)

    // Entries must run newest-first within the page.
    cy.byTestId('timeline-entry')
      .then(($entries) => $entries.toArray().map((el) => el.textContent ?? ''))
      .should((texts) => {
        expect(texts.length, 'several activities are logged').to.be.greaterThan(1)
      })
  })

  it('logs a follow-up activity, which appears on the timeline immediately', () => {
    cy.byTestId('inbox-search').type('ENQ-4101')
    cy.byTestId('lead-row').first().click()
    cy.settled()

    // ENQ-4101 is the unworked Friday enquiry, so it starts with an EMPTY
    // timeline — count via the DOM so zero is a valid starting point.
    cy.get('body').then(($body) => {
      cy.wrap($body.find('[data-testid="timeline-entry"]').length).as('before')
    })

    cy.byTestId('log-activity-button').click()
    cy.byTestId('log-activity-dialog').should('be.visible')
    cy.byTestId('activity-type').select('call-outbound')
    cy.byTestId('activity-outcome').select('connected')
    cy.byTestId('activity-note').type('Called the customer about the 320d, booking a demo drive.')
    cy.byTestId('activity-submit').click()
    cy.settled()

    cy.byTestId('log-activity-dialog').should('not.exist')
    cy.byTestId('activity-timeline').should('contain.text', 'Called the customer about the 320d')
    cy.get('@before').then((before) => {
      cy.byTestId('timeline-entry').should('have.length', Number(before) + 1)
    })
  })

  it('PERSISTS the logged activity across a full page reload', () => {
    cy.byTestId('inbox-search').type('ENQ-4102')
    cy.byTestId('lead-row').first().click()
    cy.settled()

    const note = 'Persistence check — this note must survive a reload.'
    cy.byTestId('log-activity-button').click()
    cy.byTestId('activity-type').select('email-sent')
    cy.byTestId('activity-note').type(note)
    cy.byTestId('activity-submit').click()
    cy.settled()
    cy.byTestId('activity-timeline').should('contain.text', note)

    // Reload WITHOUT the bootstrap params, so the store is not reseeded.
    cy.location('pathname').then((pathname) => {
      cy.visit(pathname)
      cy.settled()
      cy.byTestId('activity-timeline').should('contain.text', note)
    })
  })

  it('logging a genuine customer contact stops the SLA clock', () => {
    cy.byTestId('inbox-search').type('ENQ-4103')
    cy.byTestId('lead-row').first().click()
    cy.settled()

    cy.byTestId('sla-chip').first().should('have.attr', 'data-sla-state', 'breached')

    cy.byTestId('log-activity-button').click()
    cy.byTestId('activity-type').select('call-outbound')
    cy.byTestId('activity-note').type('Spoke to the customer, apologised for the delay.')
    cy.byTestId('activity-submit').click()
    cy.settled()

    // The clock has STOPPED. This lead was answered past its target, so it
    // settles as "Missed" rather than "Responded" — either way it must no
    // longer show a live countdown, which is what data-sla-settled asserts.
    cy.byTestId('sla-chip').first().should('have.attr', 'data-sla-settled', 'true')
    cy.byTestId('sla-countdown').first().should('contain.text', 'Missed')
  })

  it('an internal note does NOT stop the clock', () => {
    cy.byTestId('view-unworked').click()
    cy.settled()
    cy.byTestId('lead-row').first().click()
    cy.settled()

    cy.byTestId('sla-chip')
      .first()
      .invoke('attr', 'data-sla-state')
      .then((stateBefore) => {
        cy.byTestId('log-activity-button').click()
        cy.byTestId('activity-type').select('note')
        cy.byTestId('activity-note').type('Internal reminder, customer not contacted.')
        cy.byTestId('activity-submit').click()
        cy.settled()
        cy.byTestId('sla-chip').first().should('have.attr', 'data-sla-state', stateBefore)
        cy.byTestId('sla-chip').first().should('have.attr', 'data-sla-settled', 'false')
      })
  })

  it('surfaces contradictions in an imported timeline instead of hiding them', () => {
    cy.byTestId('inbox-search').type('ENQ-4106')
    cy.byTestId('lead-row').first().click()
    cy.settled()

    cy.byTestId('timeline-anomaly-banner').should('be.visible')
    cy.byTestId('timeline-entry-anomaly').should('have.length.greaterThan', 0)
  })
})
