import { useMemo } from 'react'
import { DEFAULT_CALENDAR } from '@/domain/businessHours'
import { DEFAULT_SLA_POLICY, type SlaStatus, computeSla } from '@/domain/sla'
import type { Instant } from '@/domain/instant'
import type { Lead } from '@/domain/types'
import { useNow } from '@/app/clockContext'

export function slaFor(lead: Lead, now: Instant): SlaStatus {
  return computeSla(
    {
      source: lead.source,
      receivedAt: lead.receivedAt,
      ...(lead.firstRespondedAt !== undefined ? { firstRespondedAt: lead.firstRespondedAt } : {}),
    },
    DEFAULT_SLA_POLICY,
    DEFAULT_CALENDAR,
    now,
  )
}

export function useSla(lead: Lead): SlaStatus {
  const now = useNow()
  return useMemo(() => slaFor(lead, now), [lead, now])
}

export function useSlaMap(leads: readonly Lead[]): Map<string, SlaStatus> {
  const now = useNow()
  return useMemo(() => new Map(leads.map((lead) => [lead.id, slaFor(lead, now)])), [leads, now])
}
