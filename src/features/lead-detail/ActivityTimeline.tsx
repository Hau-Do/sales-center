import { useMemo } from 'react'
import { Badge } from '@/components/Primitives'
import { cx } from '@/components/classNames'
import { formatLongDate, formatTime } from '@/components/format'
import { detectAnomalies, groupActivitiesByDay, isCustomerContact } from '@/domain/activities'
import { fromISO } from '@/domain/instant'
import { ACTIVITY_TYPE_LABELS, type Activity } from '@/domain/types'

/**
 * The chronological activity log.
 *
 * Grouped by London calendar day, newest first, with a total ordering so two
 * renders never disagree. Contradictions between the activity chain and the
 * timestamps are SURFACED rather than silently sorted away — a dealership that
 * quietly reorders its own audit trail cannot then use it to settle a dispute
 * with a customer.
 */
export function ActivityTimeline({
  activities,
  authorName,
}: {
  readonly activities: readonly Activity[]
  readonly authorName: (id: string) => string
}) {
  const groups = useMemo(() => groupActivitiesByDay(activities), [activities])
  const anomalies = useMemo(() => detectAnomalies(activities), [activities])
  const anomalyFor = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const a of anomalies) {
      map.set(a.activityId, [...(map.get(a.activityId) ?? []), a.message])
    }
    return map
  }, [anomalies])

  if (activities.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-subtle" data-testid="timeline-empty">
        Nothing has been logged against this enquiry yet.
      </p>
    )
  }

  return (
    <div data-testid="activity-timeline">
      {anomalies.length > 0 && (
        <div
          data-testid="timeline-anomaly-banner"
          className="mx-4 mt-3 rounded-md border border-warn/30 bg-warn-subtle px-3 py-2 text-xs text-warn"
        >
          <strong className="font-semibold">
            {anomalies.length} timeline {anomalies.length === 1 ? 'anomaly' : 'anomalies'}
          </strong>{' '}
          — this record was imported from the legacy showroom system. The entries are shown as
          recorded, not reordered.
        </div>
      )}

      <ol className="px-4 py-3">
        {groups.map((group) => (
          <li key={group.dateKey} className="mb-4 last:mb-0">
            <h3 className="sticky top-0 bg-surface pb-1.5 text-[11px] font-semibold tracking-wide text-subtle uppercase">
              {formatLongDate(fromISO(`${group.dateKey}T12:00:00Z`))}
            </h3>
            <ol className="border-l border-line pl-4">
              {group.activities.map((activity) => {
                const issues = anomalyFor.get(activity.id)
                return (
                  <li
                    key={activity.id}
                    data-testid="timeline-entry"
                    data-activity-type={activity.type}
                    className="relative py-2"
                  >
                    <span
                      aria-hidden
                      className={cx(
                        'absolute top-3.5 -left-[21px] size-2 rounded-full ring-2 ring-surface',
                        isCustomerContact(activity) ? 'bg-brand' : 'bg-line-strong',
                      )}
                    />
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span data-numeric className="font-mono text-xs text-subtle">
                        {formatTime(activity.occurredAt)}
                      </span>
                      <span className="text-sm font-medium text-ink">
                        {ACTIVITY_TYPE_LABELS[activity.type]}
                      </span>
                      {activity.outcome !== undefined && (
                        <Badge tone={activity.outcome === 'no-show' ? 'danger' : 'neutral'}>
                          {activity.outcome.replace(/-/g, ' ')}
                        </Badge>
                      )}
                      {issues !== undefined && (
                        <Badge
                          tone="warn"
                          data-testid="timeline-entry-anomaly"
                          title={issues.join(' ')}
                        >
                          Check
                        </Badge>
                      )}
                    </div>
                    {activity.note !== undefined && (
                      <p className="mt-0.5 text-sm text-muted">{activity.note}</p>
                    )}
                    <p className="mt-0.5 text-[11px] text-subtle">
                      {authorName(activity.author)}
                      {activity.recordedAt !== activity.occurredAt &&
                        ` · recorded ${formatTime(activity.recordedAt)}`}
                    </p>
                    {issues !== undefined && (
                      <p className="mt-0.5 text-[11px] text-warn">{issues.join(' ')}</p>
                    )}
                  </li>
                )
              })}
            </ol>
          </li>
        ))}
      </ol>
    </div>
  )
}
