import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupServer } from 'msw/node'
import { createStore } from '@/data/store'
import { memoryDb } from '@/data/db'
import { createHandlers } from '@/mocks/handlers'
import { DEMO_NOW } from '@/mocks/seed/generate'
import { renderWithProviders } from '@/test/renderWithProviders'
import { InboxPage } from './InboxPage'

/*
 * Driven through the real MSW handlers rather than stubbed hooks, so this
 * exercises the query layer, the SLA derivation and the rendering together.
 */
const store = createStore(memoryDb())
const server = setupServer(...createHandlers(store))

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())
beforeEach(() => {
  server.resetHandlers()
  store.reset({ scenario: 'default', now: DEMO_NOW })
})

const renderInbox = () => renderWithProviders(<InboxPage />, { route: '/inbox' })
const rows = () => screen.getAllByTestId('lead-row')

describe('InboxPage', () => {
  it('shows loading skeletons before the data arrives', () => {
    renderInbox()
    expect(screen.queryAllByTestId('lead-row')).toHaveLength(0)
  })

  it('lists incoming leads once loaded', async () => {
    renderInbox()
    await waitFor(() => expect(rows().length).toBeGreaterThan(10))
  })

  it('counts breached, due-soon and never-worked leads in the triage bar', async () => {
    renderInbox()
    await waitFor(() => expect(rows().length).toBeGreaterThan(0))
    expect(Number(screen.getByTestId('count-breached').textContent)).toBeGreaterThan(0)
    expect(Number(screen.getByTestId('count-never-worked').textContent)).toBeGreaterThan(0)
  })

  it('puts the most urgent lead first by default', async () => {
    renderInbox()
    await waitFor(() => expect(rows().length).toBeGreaterThan(0))
    const firstChip = within(rows()[0]!).getByTestId('sla-chip')
    expect(firstChip).toHaveAttribute('data-sla-state', 'breached')
  })

  it('re-sorting by most recent changes the order', async () => {
    renderInbox()
    await waitFor(() => expect(rows().length).toBeGreaterThan(0))
    const byUrgency = rows().map((r) => r.getAttribute('data-lead-id'))

    await userEvent.click(screen.getByTestId('sort-recent'))
    await waitFor(() => {
      const byRecent = rows().map((r) => r.getAttribute('data-lead-id'))
      expect(byRecent).not.toEqual(byUrgency)
    })
  })

  it('filters to leads nobody has worked', async () => {
    renderInbox()
    await waitFor(() => expect(rows().length).toBeGreaterThan(0))
    const total = rows().length

    await userEvent.click(screen.getByTestId('view-unworked'))
    await waitFor(() => expect(rows().length).toBeLessThan(total))
    expect(screen.getAllByTestId('never-worked-badge').length).toBeGreaterThan(0)
  })

  it('filters to breached leads, and every row really is breached', async () => {
    renderInbox()
    await waitFor(() => expect(rows().length).toBeGreaterThan(0))

    await userEvent.click(screen.getByTestId('view-breached'))
    await waitFor(() => expect(rows().length).toBeGreaterThan(0))
    for (const chip of screen.getAllByTestId('sla-chip')) {
      expect(chip).toHaveAttribute('data-sla-state', 'breached')
    }
  })

  it('searches by lead reference', async () => {
    renderInbox()
    await waitFor(() => expect(rows().length).toBeGreaterThan(0))

    await userEvent.type(screen.getByTestId('inbox-search'), 'ENQ-4101')
    await waitFor(() => expect(rows()).toHaveLength(1))
  })

  it('shows an honest empty state when nothing matches', async () => {
    renderInbox()
    await waitFor(() => expect(rows().length).toBeGreaterThan(0))

    await userEvent.type(screen.getByTestId('inbox-search'), 'zzzz-nobody')
    await waitFor(() => expect(screen.getByTestId('inbox-empty')).toBeInTheDocument())
  })

  it('renders an empty dataset without crashing', async () => {
    store.reset({ scenario: 'empty', now: DEMO_NOW })
    renderInbox()
    await waitFor(() => expect(screen.getByTestId('inbox-empty')).toBeInTheDocument())
    expect(screen.getByTestId('count-breached')).toHaveTextContent('0')
  })

  it('reports how many of the total are being shown', async () => {
    renderInbox()
    await waitFor(() => expect(rows().length).toBeGreaterThan(0))
    expect(Number(screen.getByTestId('visible-count').textContent)).toBe(rows().length)
  })
})
