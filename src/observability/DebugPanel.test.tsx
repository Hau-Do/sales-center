import { describe, it, expect, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DebugPanel } from './DebugPanel'
import { logger } from './logger'

beforeEach(() => {
  logger.clear()
})

describe('DebugPanel', () => {
  it('starts closed, showing only the toggle and a count', () => {
    render(<DebugPanel />)
    expect(screen.getByTestId('debug-toggle')).toBeInTheDocument()
    expect(screen.queryByTestId('debug-panel')).not.toBeInTheDocument()
  })

  it('opens and closes on click', async () => {
    render(<DebugPanel />)
    await userEvent.click(screen.getByTestId('debug-toggle'))
    expect(screen.getByTestId('debug-panel')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('debug-toggle'))
    expect(screen.queryByTestId('debug-panel')).not.toBeInTheDocument()
  })

  it('says so plainly when there is no telemetry yet', async () => {
    render(<DebugPanel />)
    await userEvent.click(screen.getByTestId('debug-toggle'))
    expect(screen.getByText('No telemetry yet.')).toBeInTheDocument()
  })

  it('renders log records with their correlation id', async () => {
    render(<DebugPanel />)
    act(() => logger.withCorrelation('req-00007').info('api.response', { status: 200 }))
    await userEvent.click(screen.getByTestId('debug-toggle'))

    const row = screen.getByTestId('debug-row')
    expect(row).toHaveTextContent('api.response')
    expect(row).toHaveTextContent('req-00007')
    expect(row).toHaveTextContent('200')
  })

  it('shows the newest record first', async () => {
    render(<DebugPanel />)
    act(() => {
      logger.info('first')
      logger.info('second')
    })
    await userEvent.click(screen.getByTestId('debug-toggle'))

    const rows = screen.getAllByTestId('debug-row')
    expect(rows[0]).toHaveTextContent('second')
    expect(rows[1]).toHaveTextContent('first')
  })

  it('updates live as new records arrive', async () => {
    render(<DebugPanel />)
    await userEvent.click(screen.getByTestId('debug-toggle'))
    expect(screen.queryAllByTestId('debug-row')).toHaveLength(0)
    act(() => logger.info('late arrival'))
    expect(await screen.findByTestId('debug-row')).toHaveTextContent('late arrival')
  })

  it('can be cleared', async () => {
    render(<DebugPanel />)
    act(() => logger.info('noise'))
    await userEvent.click(screen.getByTestId('debug-toggle'))
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByText('No telemetry yet.')).toBeInTheDocument()
  })

  it('shows an em dash for a record with no correlation id', async () => {
    render(<DebugPanel />)
    act(() => logger.info('uncorrelated'))
    await userEvent.click(screen.getByTestId('debug-toggle'))
    expect(screen.getByTestId('debug-row')).toHaveTextContent('—')
  })
})
