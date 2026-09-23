import type { SlaState, SlaStatus } from '@/domain/sla'
import { formatCountdown } from '@/domain/sla'
import { cx } from './classNames'

const TONE: Record<SlaState, string> = {
  breached: 'bg-danger-subtle text-danger ring-1 ring-danger/30',
  'at-risk': 'bg-warn-subtle text-warn ring-1 ring-warn/30',
  'on-track': 'bg-ok-subtle text-ok ring-1 ring-ok/25',
  met: 'bg-surface-sunken text-subtle ring-1 ring-line',
  'not-applicable': 'bg-surface-sunken text-subtle ring-1 ring-line',
}

const LABEL: Record<SlaState, string> = {
  breached: 'Breached',
  'at-risk': 'Due soon',
  'on-track': 'On track',
  met: 'Responded',
  'not-applicable': 'No target',
}

/**
 * The response clock, as a chip.
 *
 * Monospaced and tabular so the digits do not jitter as it ticks, and the
 * countdown goes NEGATIVE once breached rather than clamping at zero — a
 * salesperson needs to know whether a lead is one minute late or ninety.
 */
export function SlaChip({
  status,
  className,
  showLabel = false,
}: {
  readonly status: SlaStatus
  readonly className?: string
  readonly showLabel?: boolean
}) {
  /**
   * The clock stops the moment somebody responds — whether or not they made
   * the target. A lead answered LATE has state 'breached' AND a respondedAt,
   * and showing it a live countdown implies work is still outstanding when it
   * is not. Caught by an E2E spec, not by inspection.
   */
  const responded = status.respondedAt !== undefined
  const settled = responded || status.state === 'not-applicable'
  const settledLabel =
    status.state === 'not-applicable'
      ? 'No target'
      : status.state === 'met'
        ? 'Responded'
        : 'Missed'

  return (
    <span
      data-testid="sla-chip"
      data-sla-state={status.state}
      title={LABEL[status.state]}
      data-sla-settled={settled ? 'true' : 'false'}
      className={cx(
        'inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold',
        settled ? TONE.met : TONE[status.state],
        className,
      )}
    >
      <span
        aria-hidden
        className={cx(
          'size-1.5 rounded-full',
          !settled && status.state === 'breached' && 'bg-danger',
          !settled && status.state === 'at-risk' && 'bg-warn',
          !settled && status.state === 'on-track' && 'bg-ok',
          settled && 'bg-subtle',
        )}
      />
      <span data-numeric data-testid="sla-countdown">
        {settled ? settledLabel : formatCountdown(status.remainingMinutes)}
      </span>
      {showLabel && !settled && <span className="font-sans">{LABEL[status.state]}</span>}
    </span>
  )
}
