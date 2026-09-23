import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupServer } from 'msw/node'
import { createStore } from '@/data/store'
import { memoryDb } from '@/data/db'
import { createHandlers } from '@/mocks/handlers'
import { DEMO_NOW } from '@/mocks/seed/generate'
import { renderWithProviders } from '@/test/renderWithProviders'
import { allowConsoleError } from '@/test/setup'
import { LeadDetailPage } from './LeadDetailPage'

const store = createStore(memoryDb())
const server = setupServer(...createHandlers(store))

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())
beforeEach(() => {
  server.resetHandlers()
  store.reset({ scenario: 'default', now: DEMO_NOW })
})

const leadIdFor = (reference: string): string => {
  const lead = store.leads().find((l) => l.reference === reference)
  if (!lead) throw new Error(`no lead ${reference}`)
  return lead.id
}

const renderLead = (reference: string) =>
  renderWithProviders(<LeadDetailPage />, {
    route: `/leads/${leadIdFor(reference)}`,
    path: '/leads/:leadId',
  })

describe('LeadDetailPage', () => {
  it('shows the customer, reference and stage', async () => {
    renderLead('ENQ-4101')
    await waitFor(() => expect(screen.getByTestId('lead-detail-page')).toBeInTheDocument())
    expect(screen.getByTestId('lead-reference')).toHaveTextContent('ENQ-4101')
    expect(screen.getByTestId('lead-title')).not.toBeEmptyDOMElement()
  })

  it('explains the response target in plain English', async () => {
    renderLead('ENQ-4101')
    await waitFor(() => expect(screen.getByTestId('sla-explainer')).toBeInTheDocument())
    const explainer = screen.getByTestId('sla-explainer')
    // Arrived 8 minutes before Friday close, resumed at Saturday 09:00.
    expect(explainer).toHaveTextContent('Fri 18 Sep, 17:52')
    expect(explainer).toHaveTextContent('Showroom closed')
    expect(explainer).toHaveTextContent('23')
  })

  it('says a walk-in has no response target', async () => {
    renderLead('ENQ-4107')
    await waitFor(() => expect(screen.getByTestId('sla-explainer')).toBeInTheDocument())
    expect(screen.getByTestId('sla-explainer')).toHaveTextContent('already in the showroom')
  })

  it('shows a 404 with a remedy when the lead does not exist', async () => {
    allowConsoleError()
    renderWithProviders(<LeadDetailPage />, { route: '/leads/lead_nope', path: '/leads/:leadId' })
    await waitFor(() => expect(screen.getByTestId('lead-error')).toBeInTheDocument())
    expect(screen.getByTestId('lead-error')).toHaveTextContent('could not be found')
  })

  describe('logging an activity', () => {
    it('adds it to the timeline', async () => {
      renderLead('ENQ-4101')
      await waitFor(() => expect(screen.getByTestId('log-activity-button')).toBeInTheDocument())

      await userEvent.click(screen.getByTestId('log-activity-button'))
      expect(await screen.findByTestId('log-activity-dialog')).toBeInTheDocument()

      await userEvent.selectOptions(screen.getByTestId('activity-type'), 'call-outbound')
      await userEvent.type(screen.getByTestId('activity-note'), 'Called about the 320d.')
      await userEvent.click(screen.getByTestId('activity-submit'))

      await waitFor(() =>
        expect(screen.getByTestId('activity-timeline')).toHaveTextContent('Called about the 320d.'),
      )
    })

    it('closes the dialog on success', async () => {
      renderLead('ENQ-4101')
      await waitFor(() => expect(screen.getByTestId('log-activity-button')).toBeInTheDocument())
      await userEvent.click(screen.getByTestId('log-activity-button'))
      await userEvent.type(screen.getByTestId('activity-note'), 'Quick note')
      await userEvent.click(screen.getByTestId('activity-submit'))
      await waitFor(() =>
        expect(screen.queryByTestId('log-activity-dialog')).not.toBeInTheDocument(),
      )
    })

    it('offers an outcome only for activity types that have one', async () => {
      renderLead('ENQ-4101')
      await waitFor(() => expect(screen.getByTestId('log-activity-button')).toBeInTheDocument())
      await userEvent.click(screen.getByTestId('log-activity-button'))

      // A call has an outcome.
      await userEvent.selectOptions(screen.getByTestId('activity-type'), 'call-outbound')
      expect(screen.getByTestId('activity-outcome')).toBeInTheDocument()

      // An email does not.
      await userEvent.selectOptions(screen.getByTestId('activity-type'), 'email-sent')
      expect(screen.queryByTestId('activity-outcome')).not.toBeInTheDocument()
    })

    it('can be cancelled without logging anything', async () => {
      renderLead('ENQ-4101')
      await waitFor(() => expect(screen.getByTestId('log-activity-button')).toBeInTheDocument())
      await userEvent.click(screen.getByTestId('log-activity-button'))
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      await waitFor(() =>
        expect(screen.queryByTestId('log-activity-dialog')).not.toBeInTheDocument(),
      )
      expect(screen.getByTestId('timeline-empty')).toBeInTheDocument()
    })
  })

  describe('stage guards', () => {
    it('disables a test drive until the licence has been checked', async () => {
      renderLead('ENQ-4105')
      await waitFor(() => expect(screen.getByTestId('stage-actions')).toBeInTheDocument())
      expect(screen.getByTestId('stage-to-test-drive')).toBeDisabled()
    })

    it('enables it once a licence check is logged', async () => {
      renderLead('ENQ-4105')
      await waitFor(() => expect(screen.getByTestId('stage-to-test-drive')).toBeDisabled())

      await userEvent.click(screen.getByTestId('log-activity-button'))
      await userEvent.selectOptions(screen.getByTestId('activity-type'), 'licence-check')
      await userEvent.click(screen.getByTestId('activity-submit'))

      await waitFor(() => expect(screen.getByTestId('stage-to-test-drive')).not.toBeDisabled())
    })

    it('will not hand over before the order is placed', async () => {
      renderLead('ENQ-4108')
      await waitFor(() => expect(screen.getByTestId('stage-actions')).toBeInTheDocument())
      expect(screen.getByTestId('stage-to-handover')).toBeDisabled()
    })
  })

  describe('part exchange', () => {
    it('shows negative equity as a negative figure, and calls it out', async () => {
      renderLead('ENQ-4104')
      await waitFor(() => expect(screen.getByTestId('part-exchange-panel')).toBeInTheDocument())
      const panel = screen.getByTestId('part-exchange-panel')
      expect(within(panel).getByTestId('px-equity').textContent).toMatch(/^-£/)
      expect(panel).toHaveTextContent('Negative equity')
    })
  })

  it('lists marketing consent per channel', async () => {
    renderLead('ENQ-4101')
    await waitFor(() => expect(screen.getByTestId('lead-detail-page')).toBeInTheDocument())
    expect(screen.getByText(/email:/)).toBeInTheDocument()
    expect(screen.getByText(/whatsapp:/)).toBeInTheDocument()
  })
})
