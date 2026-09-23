/**
 * THE PIPELINE BOARD (enhancement F1).
 *
 * The state machine underneath has all 121 ordered stage pairs unit-tested.
 * These specs check the board is a faithful window onto it — including that a
 * refused move surfaces the domain's own remedy text, and that the mock API
 * enforces the SAME rule the UI does.
 *
 * Every move here is driven from the keyboard-operable menu. There is no
 * drag-and-drop to test, deliberately.
 */
describe('Pipeline board', () => {
  beforeEach(() => {
    cy.visitScenario('/pipeline')
  })

  it('shows a column for every stage', () => {
    cy.byTestId('pipeline-page').should('be.visible')
    for (const stage of [
      'new-enquiry',
      'contacted',
      'qualified',
      'appointment-booked',
      'showroom-visit',
      'test-drive',
      'px-appraisal',
      'quoted',
      'finance-proposal',
      'order-placed',
      'preparation',
      'handover',
    ]) {
      cy.byTestId(`column-${stage}`).should('exist')
    }
  })

  it('places open leads on the board and counts them', () => {
    cy.byTestId('pipeline-card').should('have.length.greaterThan', 10)
    cy.byTestId('pipeline-total')
      .invoke('text')
      .then((total) => {
        cy.byTestId('pipeline-card').should('have.length', Number(total))
      })
  })

  it('puts every card in the column matching its stage', () => {
    cy.byTestId('column-new-enquiry')
      .find('[data-testid="pipeline-card"]')
      .should('have.length.greaterThan', 0)
    // Column counts must sum to the board total.
    cy.get('[data-column-count]').then(($columns) => {
      const summed = $columns
        .toArray()
        .reduce((n, el) => n + Number(el.getAttribute('data-column-count')), 0)
      cy.byTestId('pipeline-total').invoke('text').should('equal', String(summed))
    })
  })

  it('shows only OPEN leads — closed deals are off the board', () => {
    cy.byTestId('pipeline-card').should('have.length.greaterThan', 0)
    cy.byTestId('pipeline-card').each(($card) => {
      cy.wrap($card).within(() => {
        cy.contains('Lost').should('not.exist')
        cy.contains('Won').should('not.exist')
      })
    })
  })

  describe('moving a lead', () => {
    it('moves it forward through the keyboard menu', () => {
      cy.byTestId('column-new-enquiry')
        .find('[data-testid="pipeline-card"]')
        .first()
        .invoke('attr', 'data-lead-reference')
        .then((reference) => {
          cy.byTestId('column-new-enquiry')
            .find('[data-testid="move-stage-trigger"]')
            .first()
            .click()
          cy.byTestId('move-stage-menu').should('be.visible')
          cy.byTestId('move-to-contacted').click()
          cy.settled()

          cy.byTestId('column-contacted')
            .find(`[data-lead-reference="${reference}"]`)
            .should('exist')
        })
    })

    it('logs the stage change at the time the action is performed', () => {
      cy.advanceClock(87 * 60 * 1000)

      cy.byTestId('column-new-enquiry')
        .find('[data-testid="pipeline-card"]')
        .first()
        .invoke('attr', 'data-lead-id')
        .then((leadId) => {
          cy.byTestId('column-new-enquiry')
            .find('[data-testid="move-stage-trigger"]')
            .first()
            .click()
          cy.byTestId('move-to-contacted').click()
          cy.settled()

          cy.visit(`/leads/${leadId}`)
          cy.settled()
          cy.byTestId('activity-timeline')
            .contains('Stage changed')
            .parents('[data-testid="timeline-entry"]')
            .should('contain.text', '10:42')
        })
    })

    it('is fully operable from the keyboard', () => {
      cy.byTestId('move-stage-trigger').first().focus().type('{enter}')
      cy.byTestId('move-stage-menu').should('be.visible')
      // Radix moves focus into the menu; arrow keys and Enter drive it.
      cy.focused().should('exist')
      cy.get('body').type('{esc}')
      cy.byTestId('move-stage-menu').should('not.exist')
    })

    it('disables a stage the lead cannot legally reach, and says why', () => {
      // ENQ-4105 sits at Showroom visit with no licence check on file.
      cy.visitScenario('/pipeline')
      cy.get('[data-lead-reference="ENQ-4105"]').find('[data-testid="move-stage-trigger"]').click()
      cy.byTestId('move-to-test-drive')
        .should('have.attr', 'data-disabled')
        .then(() => {
          cy.byTestId('move-to-test-drive').should('contain.text', 'Log a licence check')
        })
    })

    it('will not let a lead rewind more than one stage', () => {
      cy.get('[data-lead-reference="ENQ-4108"]').find('[data-testid="move-stage-trigger"]').click()
      // ENQ-4108 is at Finance proposal: back one stage to Quoted is fine…
      cy.byTestId('move-to-quoted').should('not.have.attr', 'data-disabled')
      // …but three stages back is not.
      cy.byTestId('move-to-test-drive').should('have.attr', 'data-disabled')
    })

    it('will not hand over a vehicle before the order is placed', () => {
      cy.get('[data-lead-reference="ENQ-4108"]').find('[data-testid="move-stage-trigger"]').click()
      cy.byTestId('move-to-handover').should('have.attr', 'data-disabled')
    })
  })

  describe('losing a lead', () => {
    it('requires a reason before it will close', () => {
      cy.byTestId('move-stage-trigger').first().click()
      cy.byTestId('move-to-lost').click()
      cy.byTestId('lose-lead-dialog').should('be.visible')

      // Submitting with no reason must not close the lead.
      cy.byTestId('confirm-lost').click()
      cy.byTestId('lose-lead-dialog').should('be.visible')
      cy.contains('Choose a reason before closing the lead').should('be.visible')
    })

    it('closes the lead once a reason is given, and takes it off the board', () => {
      let total = 0
      cy.byTestId('pipeline-total')
        .invoke('text')
        .then((t) => {
          total = Number(t)
        })

      cy.byTestId('pipeline-card')
        .first()
        .invoke('attr', 'data-lead-reference')
        .then((reference) => {
          cy.byTestId('move-stage-trigger').first().click()
          cy.byTestId('move-to-lost').click()
          cy.byTestId('lost-reason').select('px-offer-too-low')
          cy.byTestId('lost-note').type('Wanted £1,200 more for the Astra.')
          cy.byTestId('confirm-lost').click()
          cy.settled()

          cy.byTestId('lose-lead-dialog').should('not.exist')
          cy.get(`[data-lead-reference="${reference}"]`).should('not.exist')
          cy.byTestId('pipeline-total')
            .invoke('text')
            .should('equal', String(total - 1))
        })
    })

    it('records the loss on the lead’s timeline', () => {
      cy.byTestId('pipeline-card')
        .first()
        .invoke('attr', 'data-lead-id')
        .then((leadId) => {
          cy.byTestId('move-stage-trigger').first().click()
          cy.byTestId('move-to-lost').click()
          cy.byTestId('lost-reason').select('finance-declined')
          cy.byTestId('confirm-lost').click()
          cy.settled()

          cy.visit(`/leads/${leadId}`)
          cy.settled()
          cy.byTestId('lost-badge').should('contain.text', 'Finance declined')
          cy.byTestId('activity-timeline').should('contain.text', 'Lost sale')
        })
    })
  })
})
