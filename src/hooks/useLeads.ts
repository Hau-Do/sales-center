import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { queryKeys } from '@/app/queryClient'
import { useNow } from '@/app/clockContext'
import type { Activity, LostReason, PipelineStage } from '@/domain/types'

export function useReference() {
  return useQuery({ queryKey: queryKeys.reference, queryFn: api.reference })
}

export function useLeads(filters: { status?: string; siteId?: string; assignedTo?: string } = {}) {
  return useQuery({
    queryKey: queryKeys.leads(filters),
    queryFn: () => api.listLeads(filters),
  })
}

export function useLead(leadId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.lead(leadId ?? ''),
    queryFn: () => api.getLead(leadId!),
    enabled: leadId !== undefined && leadId !== '',
  })
}

/**
 * Log an activity.
 *
 * Invalidates both the lead and the inbox, because logging a genuine customer
 * contact stops the SLA clock server-side — so the inbox chip must re-derive,
 * not just the timeline.
 */
export function useLogActivity(leadId: string) {
  const queryClient = useQueryClient()
  const now = useNow()
  return useMutation({
    mutationFn: (body: {
      type: Activity['type']
      note?: string
      outcome?: Activity['outcome']
      isCustomerContact?: boolean
    }) => api.logActivity(leadId, { ...body, actionAt: now }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.lead(leadId) }),
        queryClient.invalidateQueries({ queryKey: ['leads'] }),
      ])
    },
  })
}

export function useMoveStage(leadId: string) {
  const queryClient = useQueryClient()
  const now = useNow()
  return useMutation({
    mutationFn: (stage: PipelineStage) => api.moveStage(leadId, stage, now),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.lead(leadId) }),
        queryClient.invalidateQueries({ queryKey: ['leads'] }),
      ])
    },
  })
}

export function useCloseLead(leadId: string) {
  const queryClient = useQueryClient()
  const now = useNow()
  return useMutation({
    mutationFn: (
      body: { outcome: 'won' } | { outcome: 'lost'; reason: LostReason; note?: string },
    ) => api.closeLead(leadId, { ...body, actionAt: now }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.lead(leadId) }),
        queryClient.invalidateQueries({ queryKey: ['leads'] }),
      ])
    },
  })
}
