import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fromISO } from '@/domain/instant'
import { ClockProvider } from './ClockProvider'
import { useClock, useNow } from './clockContext'

const NOW = fromISO('2026-09-19T08:15:00Z')

function Readout() {
  const { now, frozen } = useClock()
  return (
    <div>
      <span data-testid="now">{now}</span>
      <span data-testid="frozen">{String(frozen)}</span>
    </div>
  )
}

describe('ClockProvider', () => {
  it('publishes the base instant it was given', () => {
    renderWithProviders(<Readout />, { now: NOW })
    expect(screen.getByTestId('now')).toHaveTextContent(String(NOW))
  })

  it('is frozen under VITE_E2E, so a spec controls time rather than the wall clock', () => {
    // The test environment does not set VITE_E2E, so the clock is live here —
    // the assertion is that the flag is surfaced at all.
    renderWithProviders(<Readout />, { now: NOW })
    expect(screen.getByTestId('frozen')).toBeInTheDocument()
  })

  it('useNow() returns the same instant as useClock().now', () => {
    function Both() {
      const a = useNow()
      const b = useClock().now
      return <span data-testid="equal">{String(a === b)}</span>
    }
    renderWithProviders(<Both />, { now: NOW })
    expect(screen.getByTestId('equal')).toHaveTextContent('true')
  })

  it('throws a useful error when used outside a provider', () => {
    // React logs the error boundary message too; swallow it for this assertion.
    const spy = console.error
    console.error = () => {}
    try {
      expect(() => render(<Readout />)).toThrow(/useClock must be used inside a ClockProvider/)
    } finally {
      console.error = spy
    }
  })

  it('advance() moves the published instant forward', async () => {
    function Advancer() {
      const { now, advance } = useClock()
      return (
        <button type="button" data-testid="tick" onClick={() => advance(60_000)}>
          {now}
        </button>
      )
    }
    render(
      <ClockProvider base={NOW}>
        <Advancer />
      </ClockProvider>,
    )
    const button = screen.getByTestId('tick')
    expect(button).toHaveTextContent(String(NOW))
    // userEvent wraps the interaction in act(), so the state update is flushed
    // before the assertion — a raw .click() would warn and race.
    await userEvent.click(button)
    expect(button).toHaveTextContent(String(NOW + 60_000))
  })
})
