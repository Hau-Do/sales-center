/**
 * The activity timeline.
 *
 * Part A of the brief asks for "a chronological log of all follow-up
 * activities", which sounds like a sort call and is not. Real dealership data
 * arrives with two flavours of disorder:
 *
 *  - An activity is *recorded* later than it *occurred* — the executive takes a
 *    call at 11:40 and writes it up at 15:10. Both timestamps matter, and they
 *    disagree.
 *  - Keyloop's own Sales Activities API chains each activity to a previous one.
 *    Chains and timestamps can contradict each other after a bad import.
 *
 * So the timeline sorts by when things actually happened, keeps a total order
 * so two runs never differ, and SURFACES contradictions rather than quietly
 * reordering them away. A silently-corrected timeline is how a dealership ends
 * up arguing with a customer about who said what.
 */

import { type Instant, localDateKey } from './instant'
import { type Activity, type ActivityType } from './types'

/**
 * Activity types that count as genuinely responding to the customer.
 *
 * A note to yourself is not a response, and neither is a stage change. This
 * set is what stops the SLA clock.
 */
export const CUSTOMER_CONTACT_TYPES: ReadonlySet<ActivityType> = new Set<ActivityType>([
  'call-outbound',
  'call-inbound',
  'email-sent',
  'sms-sent',
  'whatsapp-sent',
  'showroom-visit',
  'showroom-appointment-booked',
  'test-drive-booked',
  'test-drive-completed',
  'quotation-made',
  'handover-completed',
])

export function isCustomerContact(activity: Activity): boolean {
  return activity.isCustomerContact ?? CUSTOMER_CONTACT_TYPES.has(activity.type)
}

/**
 * Total ordering: when it happened, then when it was written down, then id.
 *
 * The id tie-break is what makes this a TOTAL order rather than merely a
 * consistent one. Without it, two activities sharing both timestamps could
 * come back in either order depending on the sort implementation, and a
 * snapshot test would flake roughly never — which is the worst frequency.
 */
export function compareActivities(a: Activity, b: Activity): number {
  if (a.occurredAt !== b.occurredAt) return a.occurredAt - b.occurredAt
  if (a.recordedAt !== b.recordedAt) return a.recordedAt - b.recordedAt
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** Oldest first. */
export function sortActivities(activities: readonly Activity[]): Activity[] {
  return [...activities].sort(compareActivities)
}

/** Newest first — the order the lead record renders in. */
export function sortActivitiesDescending(activities: readonly Activity[]): Activity[] {
  return [...activities].sort((a, b) => compareActivities(b, a))
}

export type ActivityAnomalyKind =
  | 'inverted-chain'
  | 'orphaned-chain'
  | 'self-referential-chain'
  | 'recorded-before-occurred'
  | 'duplicate-chain-target'

export interface ActivityAnomaly {
  readonly kind: ActivityAnomalyKind
  readonly activityId: string
  readonly message: string
}

/**
 * Find contradictions between the chain and the timestamps.
 *
 * The seed data contains a small number of deliberate anomalies so this is
 * demonstrable in the running app rather than only in a test — see DESIGN.md.
 */
export function detectAnomalies(activities: readonly Activity[]): ActivityAnomaly[] {
  const byId = new Map(activities.map((a) => [a.id, a]))
  const anomalies: ActivityAnomaly[] = []
  const chainTargets = new Map<string, number>()

  for (const activity of sortActivities(activities)) {
    if (activity.recordedAt < activity.occurredAt) {
      anomalies.push({
        kind: 'recorded-before-occurred',
        activityId: activity.id,
        message: 'Recorded before it occurred.',
      })
    }

    const previousId = activity.previousActivityId
    if (previousId === undefined) continue

    if (previousId === activity.id) {
      anomalies.push({
        kind: 'self-referential-chain',
        activityId: activity.id,
        message: 'Links to itself.',
      })
      continue
    }

    chainTargets.set(previousId, (chainTargets.get(previousId) ?? 0) + 1)

    const previous = byId.get(previousId)
    if (!previous) {
      anomalies.push({
        kind: 'orphaned-chain',
        activityId: activity.id,
        message: `Links to ${previousId}, which is not on this lead.`,
      })
      continue
    }

    if (activity.occurredAt < previous.occurredAt) {
      anomalies.push({
        kind: 'inverted-chain',
        activityId: activity.id,
        message: 'Occurred before the activity it follows.',
      })
    }
  }

  for (const [targetId, count] of chainTargets) {
    if (count > 1) {
      anomalies.push({
        kind: 'duplicate-chain-target',
        activityId: targetId,
        message: `${count} activities claim to follow this one.`,
      })
    }
  }

  return anomalies
}

export interface ActivityDayGroup {
  readonly dateKey: string
  readonly activities: readonly Activity[]
}

/** Group for the day-separated timeline rendering. Newest day first. */
export function groupActivitiesByDay(activities: readonly Activity[]): ActivityDayGroup[] {
  const groups = new Map<string, Activity[]>()
  for (const activity of sortActivitiesDescending(activities)) {
    const key = localDateKey(activity.occurredAt)
    const bucket = groups.get(key)
    if (bucket) bucket.push(activity)
    else groups.set(key, [activity])
  }
  return [...groups.entries()].map(([dateKey, list]) => ({ dateKey, activities: list }))
}

/**
 * The first activity that genuinely reached the customer, which is what stops
 * the SLA clock. Activities occurring before the enquiry landed are ignored —
 * a back-dated note cannot retroactively satisfy a response target.
 */
export function firstCustomerContact(
  activities: readonly Activity[],
  receivedAt: Instant,
): Activity | undefined {
  return sortActivities(activities).find((a) => isCustomerContact(a) && a.occurredAt >= receivedAt)
}

export function lastActivity(activities: readonly Activity[]): Activity | undefined {
  return sortActivities(activities).at(-1)
}

export function countByType(activities: readonly Activity[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const a of activities) {
    counts[a.type] = (counts[a.type] ?? 0) + 1
  }
  return counts
}

/** True when nobody has logged anything that reached the customer. */
export function isUnworked(activities: readonly Activity[], receivedAt: Instant): boolean {
  return firstCustomerContact(activities, receivedAt) === undefined
}
