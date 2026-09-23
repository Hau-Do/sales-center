/**
 * PART A — REQUIREMENT 1: "Lead Inbox: display a list of all incoming sales leads."
 *
 * Walks the inbox the way a sales executive opens it on a Saturday morning:
 * what is on fire, what has never been touched, and can I find one customer.
 */
describe('Lead inbox', () => {
  beforeEach(() => {
    cy.visitScenario('/inbox')
  })

  it('lists incoming leads', () => {
    cy.byTestId('lead-list').should('be.visible')
    cy.byTestId('lead-row').should('have.length.greaterThan', 10)
    cy.byTestId('visible-count').should('not.have.text', '0')
  })

  it('shows a triage bar that counts what needs attention', () => {
    cy.byTestId('triage-bar').should('be.visible')
    cy.byTestId('count-breached')
      .invoke('text')
      .then((text) => {
        expect(Number(text), 'at least one lead is breached in the seeded demo').to.be.greaterThan(
          0,
        )
      })
    cy.byTestId('count-never-worked')
      .invoke('text')
      .then((text) => expect(Number(text)).to.be.greaterThan(0))
  })

  it('renders each row with the trade detail a salesperson scans for', () => {
    cy.byTestId('lead-row')
      .first()
      .within(() => {
        cy.byTestId('lead-customer').should('not.be.empty')
        cy.byTestId('sla-chip').should('exist')
      })
  })

  it('sorts by urgency by default, putting breached leads at the top', () => {
    cy.byTestId('sort-urgency').should('have.attr', 'aria-pressed', 'true')
    cy.byTestId('lead-row')
      .first()
      .find('[data-testid="sla-chip"]')
      .should('have.attr', 'data-sla-state', 'breached')
  })

  it('can re-sort by most recent, which changes the order', () => {
    // Compare the WHOLE ordering rather than just the head: the most urgent
    // lead could legitimately also be the most recent, and asserting on one
    // row would make this test depend on that coincidence.
    const idsNow = () =>
      cy
        .byTestId('lead-row')
        .then(($rows) => $rows.toArray().map((el) => el.getAttribute('data-lead-id')))

    idsNow().then((byUrgency) => {
      cy.byTestId('sort-recent').click()
      cy.settled()
      cy.byTestId('sort-recent').should('have.attr', 'aria-pressed', 'true')
      idsNow().then((byRecent) => {
        expect(byRecent, 'the two sort orders differ').to.not.deep.equal(byUrgency)
        expect(byRecent.length).to.equal(byUrgency.length)
      })
    })
  })

  it('filters to leads nobody has worked', () => {
    cy.byTestId('view-unworked').click()
    cy.settled()
    cy.byTestId('lead-row').should('have.length.greaterThan', 0)
    cy.byTestId('never-worked-badge').should('have.length.greaterThan', 0)
  })

  it('filters to breached leads, and every row shown really is breached', () => {
    cy.byTestId('view-breached').click()
    cy.settled()
    cy.byTestId('lead-row').should('have.length.greaterThan', 0)
    cy.byTestId('sla-chip').each(($chip) => {
      expect($chip.attr('data-sla-state')).to.equal('breached')
    })
  })

  it('searches by customer name', () => {
    cy.byTestId('lead-row').first().find('[data-testid="lead-customer"]').invoke('text').as('name')
    cy.get('@name').then((name) => {
      cy.byTestId('inbox-search').type(String(name))
      cy.byTestId('lead-row').should('have.length.greaterThan', 0)
      cy.byTestId('lead-customer').first().should('contain.text', String(name))
    })
  })

  it('shows an honest empty state when a search matches nothing', () => {
    cy.byTestId('inbox-search').type('zzzz-no-such-customer')
    cy.byTestId('inbox-empty').should('be.visible')
  })

  it('keeps the selected view in the URL, so it can be shared', () => {
    cy.byTestId('view-breached').click()
    cy.location('search').should('include', 'view=breached')
  })

  it('keeps the sort order and the search in the URL too', () => {
    cy.byTestId('sort-recent').click()
    cy.location('search').should('include', 'sort=recent')

    cy.byTestId('inbox-search').type('ENQ-4101')
    cy.location('search').should('include', 'q=ENQ-4101')

    // Defaults are dropped rather than written, so a pristine inbox has a clean URL.
    cy.byTestId('sort-urgency').click()
    cy.location('search').should('not.include', 'sort=')
  })

  it('survives opening a lead and coming back — sort and search are not lost', () => {
    cy.byTestId('sort-recent').click()
    // Search for a name that is genuinely in the dataset rather than a guess.
    cy.byTestId('lead-row').first().find('[data-testid="lead-customer"]').invoke('text').as('who')
    cy.get('@who').then((who) => {
      const name = String(who)
      cy.byTestId('inbox-search').type(name)
      cy.byTestId('lead-row').should('have.length.greaterThan', 0)

      cy.byTestId('lead-row').first().click()
      cy.settled()
      cy.byTestId('lead-detail-page').should('be.visible')

      cy.go('back')
      cy.settled()
      // This is the whole point of holding them in the URL rather than in state.
      cy.byTestId('sort-recent').should('have.attr', 'aria-pressed', 'true')
      cy.byTestId('inbox-search').should('have.value', name)
    })
  })

  it('renders an empty inbox without crashing', () => {
    cy.visitScenario('/inbox', { scenario: 'empty' })
    cy.byTestId('inbox-empty').should('be.visible')
    cy.byTestId('count-breached').should('have.text', '0')
  })
})
