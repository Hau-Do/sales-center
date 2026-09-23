import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import {
  Badge,
  Button,
  EmptyState,
  Field,
  RegPlate,
  Skeleton,
  Stat,
  TextArea,
  TextInput,
} from './Primitives'

describe('Button', () => {
  it('renders its label and fires onClick', async () => {
    const onClick = vi.fn()
    renderWithProviders(<Button onClick={onClick}>Log activity</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Log activity' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('defaults to type="button", so it cannot accidentally submit a form', () => {
    renderWithProviders(<Button>Safe</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })

  it('does not fire when disabled', async () => {
    const onClick = vi.fn()
    renderWithProviders(
      <Button onClick={onClick} disabled>
        Blocked
      </Button>,
    )
    await userEvent.click(screen.getByRole('button'), { pointerEventsCheck: 0 })
    expect(onClick).not.toHaveBeenCalled()
  })

  it('renders each variant and size without error', () => {
    for (const variant of ['primary', 'secondary', 'ghost', 'danger'] as const) {
      const { unmount } = renderWithProviders(<Button variant={variant}>x</Button>)
      expect(screen.getByRole('button')).toBeInTheDocument()
      unmount()
    }
    for (const size of ['sm', 'md'] as const) {
      const { unmount } = renderWithProviders(<Button size={size}>x</Button>)
      expect(screen.getByRole('button')).toBeInTheDocument()
      unmount()
    }
  })
})

describe('Badge', () => {
  it('renders its children', () => {
    renderWithProviders(<Badge>Website enquiry</Badge>)
    expect(screen.getByText('Website enquiry')).toBeInTheDocument()
  })

  it('renders every tone', () => {
    for (const tone of ['neutral', 'brand', 'ok', 'warn', 'danger', 'info'] as const) {
      const { unmount } = renderWithProviders(<Badge tone={tone}>{tone}</Badge>)
      expect(screen.getByText(tone)).toBeInTheDocument()
      unmount()
    }
  })
})

describe('RegPlate', () => {
  it('renders a UK registration mark', () => {
    renderWithProviders(<RegPlate reg="LV19 XKD" />)
    expect(screen.getByTestId('reg-plate')).toHaveTextContent('LV19 XKD')
  })
})

describe('Stat', () => {
  it('shows a value', () => {
    renderWithProviders(<Stat label="Close rate" value="27%" />)
    expect(screen.getByText('27%')).toBeInTheDocument()
  })

  it('shows an em dash for null rather than a misleading zero', () => {
    // A tile reading "0%" when there is simply nothing to measure is a lie.
    renderWithProviders(<Stat label="Close rate" value={null} />)
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByText('0%')).not.toBeInTheDocument()
  })

  it('renders an optional hint', () => {
    renderWithProviders(<Stat label="Close rate" value="27%" hint="last 30 days" />)
    expect(screen.getByText('last 30 days')).toBeInTheDocument()
  })

  it('marks the figure as tabular so it does not jitter', () => {
    renderWithProviders(<Stat label="Units" value="12" />)
    expect(screen.getByText('12')).toHaveAttribute('data-numeric')
  })
})

describe('EmptyState', () => {
  it('renders a title, description and action', () => {
    renderWithProviders(
      <EmptyState
        title="Nothing here"
        description="Everything is dealt with."
        action={<Button>Refresh</Button>}
      />,
    )
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
    expect(screen.getByText('Everything is dealt with.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
  })

  it('works with only a title', () => {
    renderWithProviders(<EmptyState title="Nothing here" />)
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
  })
})

describe('Field', () => {
  it('associates the label with its control', () => {
    renderWithProviders(
      <Field label="Notes" htmlFor="notes">
        <TextArea id="notes" />
      </Field>,
    )
    expect(screen.getByLabelText('Notes')).toBeInTheDocument()
  })

  it('shows a hint when there is no error', () => {
    renderWithProviders(
      <Field label="Notes" htmlFor="n" hint="What happens next">
        <TextInput id="n" />
      </Field>,
    )
    expect(screen.getByText('What happens next')).toBeInTheDocument()
  })

  it('replaces the hint with the error, and announces it', () => {
    renderWithProviders(
      <Field label="Notes" htmlFor="n" hint="What happens next" error="Required">
        <TextInput id="n" />
      </Field>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Required')
    expect(screen.queryByText('What happens next')).not.toBeInTheDocument()
  })
})

describe('Skeleton', () => {
  it('is hidden from assistive technology', () => {
    const { container } = renderWithProviders(<Skeleton className="h-4" />)
    expect(container.querySelector('[aria-hidden]')).toBeInTheDocument()
  })
})
