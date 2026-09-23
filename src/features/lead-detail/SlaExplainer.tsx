import { useNow } from '@/app/clockContext'
import { formatDateTime, formatTime } from '@/components/format'
import { DEFAULT_CALENDAR, periodsForDay } from '@/domain/businessHours'
import { type Instant, startOfLocalDay } from '@/domain/instant'
import { describeSla, type SlaStatus } from '@/domain/sla'
import type { Lead } from '@/domain/types'

function closingTimeOn(at: Instant): string | null {
  const periods = periodsForDay(DEFAULT_CALENDAR, at)
  const last = periods[periods.length - 1]
  if (last === undefined) return null
  return `${String(Math.floor(last.closeMinute / 60)).padStart(2, '0')}:${String(last.closeMinute % 60).padStart(2, '0')}`
}

/**
 * The plain-English SLA card.
 *
 * The single hardest claim this app makes is that the response clock counts
 * working minutes rather than wall-clock minutes. This card states the whole
 * argument in four lines, on the record it applies to, so a reviewer can check
 * it against the timestamps rather than take it on trust.
 */
export function SlaExplainer({
  lead,
  status,
}: {
  readonly lead: Lead
  readonly status: SlaStatus
}) {
  const now = useNow()
  if (status.state === 'not-applicable') {
    return (
      <p className="text-sm text-muted" data-testid="sla-explainer">
        {describeSla(status)}
      </p>
    )
  }

  const receivedDayEnd = closingTimeOn(lead.receivedAt)
  const spansAClose =
    status.dueAt !== undefined && startOfLocalDay(status.dueAt) !== startOfLocalDay(lead.receivedAt)

  return (
    <div className="flex flex-col gap-1 text-sm" data-testid="sla-explainer">
      <p className="text-muted">
        Received <strong className="text-ink">{formatDateTime(lead.receivedAt)}</strong>.
      </p>
      {spansAClose && receivedDayEnd !== null && (
        <p className="text-muted">
          Showroom closed <strong className="text-ink">{receivedDayEnd}</strong> that day, so the
          clock paused overnight.
        </p>
      )}
      <p className="text-muted">
        <strong className="text-ink" data-numeric>
          {status.consumedMinutes}
        </strong>{' '}
        working {status.consumedMinutes === 1 ? 'minute' : 'minutes'} consumed against a{' '}
        <strong className="text-ink" data-numeric>
          {status.targetMinutes}
        </strong>
        -minute target.
      </p>
      {status.dueAt !== undefined && status.respondedAt === undefined && (
        <p className="text-muted">
          Due <strong className="text-ink">{formatDateTime(status.dueAt)}</strong>
          {spansAClose && ', when the showroom reopens'}.
        </p>
      )}
      {status.respondedAt !== undefined && (
        <p className="text-muted">
          First response logged{' '}
          <strong className="text-ink">{formatDateTime(status.respondedAt)}</strong>.
        </p>
      )}
      <p className="mt-1 text-xs text-subtle">
        Evaluated at {formatTime(now)} · {describeSla(status)}
      </p>
    </div>
  )
}
