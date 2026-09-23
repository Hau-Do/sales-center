import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import type { SlaStatus } from '@/domain/sla'
import { fromISO } from '@/domain/instant'
import { SlaChip } from './SlaChip'

const base: SlaStatus = {
  state: 'on-track',
  targetMinutes: 30,
  consumedMinutes: 5,
  remainingMinutes: 25,
  countsTowardCompliance: true,
}

const chip = () => screen.getByTestId('sla-chip')

describe('SlaChip', () => {
  it('counts down while a lead is on track', () => {
    renderWithProviders(<SlaChip status={base} />)
    expect(chip()).toHaveAttribute('data-sla-state', 'on-track')
    expect(chip()).toHaveAttribute('data-sla-settled', 'false')
    expect(screen.getByTestId('sla-countdown')).toHaveTextContent('00:25')
  })

  it('goes negative once breached, rather than clamping at zero', () => {
    renderWithProviders(
      <SlaChip
        status={{ ...base, state: 'breached', consumedMinutes: 77, remainingMinutes: -47 }}
      />,
    )
    expect(chip()).toHaveAttribute('data-sla-state', 'breached')
    expect(screen.getByTestId('sla-countdown')).toHaveTextContent('-00:47')
  })

  it('shows amber while at risk', () => {
    renderWithProviders(<SlaChip status={{ ...base, state: 'at-risk', remainingMinutes: 7 }} />)
    expect(chip()).toHaveAttribute('data-sla-state', 'at-risk')
    expect(screen.getByTestId('sla-countdown')).toHaveTextContent('00:07')
  })

  describe('once the lead has been answered', () => {
    const respondedAt = fromISO('2026-09-19T08:15:00Z')

    it('reads "Responded" when the target was met, and stops counting', () => {
      renderWithProviders(
        <SlaChip
          status={{ ...base, state: 'met', consumedMinutes: 12, remainingMinutes: 18, respondedAt }}
        />,
      )
      expect(chip()).toHaveAttribute('data-sla-settled', 'true')
      expect(screen.getByTestId('sla-countdown')).toHaveTextContent('Responded')
    })

    it('reads "Missed" when the answer came late — but STILL stops counting', () => {
      // The regression this guards: a lead answered late keeps state 'breached'
      // AND gains a respondedAt. Showing it a live countdown implies work is
      // still outstanding when it is not.
      renderWithProviders(
        <SlaChip
          status={{
            ...base,
            state: 'breached',
            consumedMinutes: 45,
            remainingMinutes: -25,
            respondedAt,
          }}
        />,
      )
      expect(chip()).toHaveAttribute('data-sla-settled', 'true')
      expect(screen.getByTestId('sla-countdown')).toHaveTextContent('Missed')
      expect(screen.getByTestId('sla-countdown')).not.toHaveTextContent('-00:25')
    })
  })

  it('says a walk-in has no target', () => {
    renderWithProviders(
      <SlaChip
        status={{
          state: 'not-applicable',
          targetMinutes: 0,
          consumedMinutes: 0,
          remainingMinutes: 0,
          countsTowardCompliance: false,
        }}
      />,
    )
    expect(chip()).toHaveAttribute('data-sla-settled', 'true')
    expect(screen.getByTestId('sla-countdown')).toHaveTextContent('No target')
  })

  it('can show a written label alongside the countdown', () => {
    renderWithProviders(
      <SlaChip status={{ ...base, state: 'at-risk', remainingMinutes: 3 }} showLabel />,
    )
    expect(chip()).toHaveTextContent('Due soon')
  })

  it('does not show a written label on a settled lead', () => {
    renderWithProviders(
      <SlaChip
        status={{ ...base, state: 'met', respondedAt: fromISO('2026-09-19T08:15:00Z') }}
        showLabel
      />,
    )
    expect(chip()).not.toHaveTextContent('On track')
  })

  it('renders money-safe tabular figures so the clock does not jitter', () => {
    renderWithProviders(<SlaChip status={base} />)
    expect(screen.getByTestId('sla-countdown')).toHaveAttribute('data-numeric')
  })
})
