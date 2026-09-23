import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupServer } from 'msw/node'
import { createStore } from '@/data/store'
import { memoryDb } from '@/data/db'
import { createHandlers } from '@/mocks/handlers'
import { DEMO_NOW } from '@/mocks/seed/generate'
import { renderWithProviders } from '@/test/renderWithProviders'
import { PIPELINE_STAGES } from '@/domain/types'
import { PipelinePage } from './PipelinePage'

const store = createStore(memoryDb())
const server = setupServer(...createHandlers(store))

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())
beforeEach(() => {
  server.resetHandlers()
  store.reset({ scenario: 'default', now: DEMO_NOW })
})

const renderBoard = () => renderWithProviders(<PipelinePage />, { route: '/pipeline' })
const cards = () => screen.getAllByTestId('pipeline-card')
const cardFor = (reference: string) =>
  screen
    .getByTestId('pipeline-page')
    .querySelector(`[data-lead-reference="${reference}"]`) as HTMLElement

describe('PipelinePage', () => {
  it('renders a column for every stage', async () => {
    renderBoard()
    await waitFor(() => expect(cards().length).toBeGreaterThan(0))
    for (const stage of PIPELINE_STAGES) {
      expect(screen.getByTestId(`column-${stage}`)).toBeInTheDocument()
    }
  })

  it('places every open lead on the board', async () => {
    renderBoard()
    await waitFor(() => expect(cards().length).toBeGreaterThan(5))
    const total = Number(screen.getByTestId('pipeline-total').textContent)
    expect(cards()).toHaveLength(total)
  })

  it('column counts sum to the board total', async () => {
    renderBoard()
    await waitFor(() => expect(cards().length).toBeGreaterThan(0))
    const summed = PIPELINE_STAGES.reduce(
      (n, stage) =>
        n + Number(screen.getByTestId(`column-${stage}`).getAttribute('data-column-count')),
      0,
    )
    expect(Number(screen.getByTestId('pipeline-total').textContent)).toBe(summed)
  })

  it('shows only OPEN leads', async () => {
    renderBoard()
    await waitFor(() => expect(cards().length).toBeGreaterThan(0))
    const openCount = store.leads().filter((l) => l.status.kind === 'open').length
    expect(cards()).toHaveLength(openCount)
  })

  it('puts each card in the column matching its stage', async () => {
    renderBoard()
    await waitFor(() => expect(cards().length).toBeGreaterThan(0))
    for (const stage of PIPELINE_STAGES) {
      const column = screen.getByTestId(`column-${stage}`)
      const expected = store
        .leads()
        .filter((l) => l.status.kind === 'open' && l.stage === stage).length
      expect(within(column).queryAllByTestId('pipeline-card')).toHaveLength(expected)
    }
  })

  describe('the move menu', () => {
    it('moves a lead forward', async () => {
      renderBoard()
      await waitFor(() => expect(cards().length).toBeGreaterThan(0))

      const column = screen.getByTestId('column-new-enquiry')
      const card = within(column).getAllByTestId('pipeline-card')[0]!
      const reference = card.getAttribute('data-lead-reference')

      await userEvent.click(within(card).getByTestId('move-stage-trigger'))
      await userEvent.click(await screen.findByTestId('move-to-contacted'))

      await waitFor(() => {
        const moved = screen
          .getByTestId('column-contacted')
          .querySelector(`[data-lead-reference="${reference}"]`)
        expect(moved, `${reference} should now sit in Contacted`).not.toBeNull()
      })
    })

    it('disables a stage the lead cannot reach, and names the remedy', async () => {
      renderBoard()
      await waitFor(() => expect(cards().length).toBeGreaterThan(0))

      // ENQ-4105 sits at Showroom visit with no licence check on file.
      const card = cardFor('ENQ-4105')
      await userEvent.click(within(card).getByTestId('move-stage-trigger'))

      const blocked = await screen.findByTestId('move-to-test-drive')
      expect(blocked).toHaveAttribute('data-disabled')
      expect(blocked).toHaveTextContent('Log a licence check')
    })

    it('allows one step back but not three', async () => {
      renderBoard()
      await waitFor(() => expect(cards().length).toBeGreaterThan(0))

      const card = cardFor('ENQ-4108') // sits at Finance proposal
      await userEvent.click(within(card).getByTestId('move-stage-trigger'))

      expect(await screen.findByTestId('move-to-quoted')).not.toHaveAttribute('data-disabled')
      expect(screen.getByTestId('move-to-test-drive')).toHaveAttribute('data-disabled')
    })

    it('will not hand over before the order is placed', async () => {
      renderBoard()
      await waitFor(() => expect(cards().length).toBeGreaterThan(0))
      const card = cardFor('ENQ-4108')
      await userEvent.click(within(card).getByTestId('move-stage-trigger'))
      expect(await screen.findByTestId('move-to-handover')).toHaveAttribute('data-disabled')
    })
  })

  describe('losing a lead', () => {
    it('will not close without a reason', async () => {
      renderBoard()
      await waitFor(() => expect(cards().length).toBeGreaterThan(0))

      await userEvent.click(within(cards()[0]!).getByTestId('move-stage-trigger'))
      await userEvent.click(await screen.findByTestId('move-to-lost'))
      expect(await screen.findByTestId('lose-lead-dialog')).toBeInTheDocument()

      await userEvent.click(screen.getByTestId('confirm-lost'))
      expect(screen.getByTestId('lose-lead-dialog')).toBeInTheDocument()
      expect(screen.getByRole('alert')).toHaveTextContent('Choose a reason')
    })

    it('closes the lead once a reason is chosen, and takes it off the board', async () => {
      renderBoard()
      await waitFor(() => expect(cards().length).toBeGreaterThan(0))
      const before = cards().length
      const reference = cards()[0]!.getAttribute('data-lead-reference')

      await userEvent.click(within(cards()[0]!).getByTestId('move-stage-trigger'))
      await userEvent.click(await screen.findByTestId('move-to-lost'))
      await userEvent.selectOptions(await screen.findByTestId('lost-reason'), 'px-offer-too-low')
      await userEvent.click(screen.getByTestId('confirm-lost'))

      await waitFor(() => expect(cards()).toHaveLength(before - 1))
      const closed = store.leads().find((l) => l.reference === reference)
      expect(closed?.status.kind).toBe('lost')
      if (closed?.status.kind === 'lost') expect(closed.status.reason).toBe('px-offer-too-low')
    })
  })
})
