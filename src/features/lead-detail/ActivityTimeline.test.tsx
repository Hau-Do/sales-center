import { describe, it, expect } from 'vitest'
import { screen, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fromISO, type Instant } from '@/domain/instant'
import type { Activity } from '@/domain/types'
import { ActivityTimeline } from './ActivityTimeline'

const T = (iso: string): Instant => fromISO(iso)
const authorName = (id: string) => (id === 'exec_amara' ? 'Amara Bello' : id)

function activity(overrides: Partial<Activity> & { id: string }): Activity {
  const occurredAt = overrides.occurredAt ?? T('2026-09-18T09:00:00Z')
  return {
    leadId: 'lead_0001',
    type: 'note',
    author: 'exec_amara',
    ...overrides,
    occurredAt,
    recordedAt: overrides.recordedAt ?? occurredAt,
  }
}

describe('ActivityTimeline', () => {
  it('tells the user plainly when nothing has been logged', () => {
    renderWithProviders(<ActivityTimeline activities={[]} authorName={authorName} />)
    expect(screen.getByTestId('timeline-empty')).toBeInTheDocument()
  })

  it('renders one entry per activity', () => {
    renderWithProviders(
      <ActivityTimeline
        activities={[
          activity({ id: 'a1', type: 'call-outbound' }),
          activity({ id: 'a2', type: 'email-sent', occurredAt: T('2026-09-18T11:00:00Z') }),
        ]}
        authorName={authorName}
      />,
    )
    expect(screen.getAllByTestId('timeline-entry')).toHaveLength(2)
  })

  it('shows newest first within a day', () => {
    renderWithProviders(
      <ActivityTimeline
        activities={[
          activity({ id: 'early', type: 'call-outbound', occurredAt: T('2026-09-18T08:00:00Z') }),
          activity({ id: 'late', type: 'email-sent', occurredAt: T('2026-09-18T15:00:00Z') }),
        ]}
        authorName={authorName}
      />,
    )
    const entries = screen.getAllByTestId('timeline-entry')
    expect(entries[0]).toHaveAttribute('data-activity-type', 'email-sent')
    expect(entries[1]).toHaveAttribute('data-activity-type', 'call-outbound')
  })

  it('groups by London calendar day, newest day first', () => {
    renderWithProviders(
      <ActivityTimeline
        activities={[
          activity({ id: 'a1', occurredAt: T('2026-09-17T10:00:00Z') }),
          activity({ id: 'a2', occurredAt: T('2026-09-18T10:00:00Z') }),
        ]}
        authorName={authorName}
      />,
    )
    const headings = screen.getAllByRole('heading', { level: 3 })
    expect(headings[0]).toHaveTextContent('Friday 18 September 2026')
    expect(headings[1]).toHaveTextContent('Thursday 17 September 2026')
  })

  it('renders the human label, the note, the author and the time', () => {
    renderWithProviders(
      <ActivityTimeline
        activities={[
          activity({
            id: 'a1',
            type: 'test-drive-booked',
            occurredAt: T('2026-09-18T16:52:00Z'),
            note: 'Booked for Saturday at 10:00.',
          }),
        ]}
        authorName={authorName}
      />,
    )
    const entry = screen.getByTestId('timeline-entry')
    expect(within(entry).getByText('Test drive booked')).toBeInTheDocument()
    expect(within(entry).getByText('Booked for Saturday at 10:00.')).toBeInTheDocument()
    expect(within(entry).getByText(/Amara Bello/)).toBeInTheDocument()
    expect(within(entry).getByText('17:52')).toBeInTheDocument()
  })

  it('notes when an activity was written up later than it happened', () => {
    renderWithProviders(
      <ActivityTimeline
        activities={[
          activity({
            id: 'a1',
            occurredAt: T('2026-09-18T10:40:00Z'),
            recordedAt: T('2026-09-18T14:10:00Z'),
          }),
        ]}
        authorName={authorName}
      />,
    )
    expect(screen.getByTestId('timeline-entry')).toHaveTextContent('recorded 15:10')
  })

  it('shows an outcome when one was captured', () => {
    renderWithProviders(
      <ActivityTimeline
        activities={[activity({ id: 'a1', type: 'call-outbound', outcome: 'no-answer' })]}
        authorName={authorName}
      />,
    )
    expect(screen.getByText('no answer')).toBeInTheDocument()
  })

  describe('contradictory imported data', () => {
    const broken = [
      activity({ id: 'a1', type: 'email-sent', occurredAt: T('2026-09-18T12:00:00Z') }),
      activity({
        id: 'a2',
        type: 'call-outbound',
        occurredAt: T('2026-09-18T09:00:00Z'),
        previousActivityId: 'a1',
      }),
      activity({ id: 'a3', type: 'note', previousActivityId: 'gone_9999' }),
    ]

    it('warns that the timeline contains anomalies', () => {
      renderWithProviders(<ActivityTimeline activities={broken} authorName={authorName} />)
      expect(screen.getByTestId('timeline-anomaly-banner')).toBeInTheDocument()
    })

    it('says the entries are shown as recorded, NOT silently reordered', () => {
      renderWithProviders(<ActivityTimeline activities={broken} authorName={authorName} />)
      expect(screen.getByTestId('timeline-anomaly-banner')).toHaveTextContent('not reordered')
    })

    it('marks the offending entries individually', () => {
      renderWithProviders(<ActivityTimeline activities={broken} authorName={authorName} />)
      expect(screen.getAllByTestId('timeline-entry-anomaly').length).toBeGreaterThanOrEqual(2)
    })

    it('shows no banner at all for a clean timeline', () => {
      renderWithProviders(
        <ActivityTimeline
          activities={[activity({ id: 'a1' }), activity({ id: 'a2', previousActivityId: 'a1' })]}
          authorName={authorName}
        />,
      )
      expect(screen.queryByTestId('timeline-anomaly-banner')).not.toBeInTheDocument()
    })
  })
})
