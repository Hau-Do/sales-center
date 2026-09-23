import { Component, type ErrorInfo, type ReactNode } from 'react'
import { logger } from './logger'

interface Props {
  readonly children: ReactNode
  readonly fallback?: (error: Error, reset: () => void) => ReactNode
}

interface State {
  readonly error: Error | null
}

/**
 * Catches a render-time crash, logs it as structured telemetry, and shows
 * something a salesperson can act on instead of a blank page.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error('ui.render_error', {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    })
  }

  private readonly reset = (): void => this.setState({ error: null })

  override render(): ReactNode {
    const { error } = this.state
    if (error === null) return this.props.children
    if (this.props.fallback) return this.props.fallback(error, this.reset)

    return (
      <div
        role="alert"
        data-testid="error-boundary"
        className="m-4 rounded-lg border border-danger/30 bg-danger-subtle p-4"
      >
        <p className="text-sm font-semibold text-danger">Something went wrong on this screen.</p>
        <p className="mt-1 text-xs text-danger/80">{error.message}</p>
        <button
          type="button"
          onClick={this.reset}
          className="mt-3 rounded-md bg-danger px-3 py-1.5 text-xs font-medium text-white"
        >
          Try again
        </button>
      </div>
    )
  }
}
