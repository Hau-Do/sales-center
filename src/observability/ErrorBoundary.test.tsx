import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { allowConsoleError } from '@/test/setup'
import { ErrorBoundary } from './ErrorBoundary'
import { logger } from './logger'

function Boom({ explode = true }: { readonly explode?: boolean }) {
  if (explode) throw new Error('kaboom')
  return <p>recovered</p>
}

describe('ErrorBoundary', () => {
  it('renders its children when nothing goes wrong', () => {
    render(
      <ErrorBoundary>
        <p>all fine</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('all fine')).toBeInTheDocument()
  })

  it('catches a render crash and shows something actionable', () => {
    allowConsoleError() // React logs the caught error itself.
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.getByTestId('error-boundary')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('kaboom')
  })

  it('logs the crash as structured telemetry', () => {
    allowConsoleError()
    const spy = vi.spyOn(logger, 'error')
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(spy).toHaveBeenCalledWith(
      'ui.render_error',
      expect.objectContaining({ message: 'kaboom' }),
    )
    spy.mockRestore()
  })

  it('can be reset, and renders children again once they behave', async () => {
    allowConsoleError()
    function Flaky() {
      return (
        <ErrorBoundary>
          <Boom explode={false} />
        </ErrorBoundary>
      )
    }
    const { rerender } = render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    rerender(<Flaky />)
    expect(screen.getByText('recovered')).toBeInTheDocument()
  })

  it('uses a custom fallback when one is given', () => {
    allowConsoleError()
    render(
      <ErrorBoundary fallback={(error) => <p>custom: {error.message}</p>}>
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.getByText('custom: kaboom')).toBeInTheDocument()
  })
})
