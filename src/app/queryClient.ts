import { QueryClient } from '@tanstack/react-query'

/**
 * Query defaults.
 *
 * `retry: false` is deliberate. A mock API that fails is failing on purpose —
 * for the reliability demo — and retrying would hide exactly the behaviour the
 * error path is meant to show. It also keeps E2E fast and deterministic.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 5_000,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

export const queryKeys = {
  reference: ['reference'] as const,
  leads: (filters: Record<string, string | undefined> = {}) => ['leads', filters] as const,
  lead: (leadId: string) => ['lead', leadId] as const,
  activities: (leadId: string) => ['lead', leadId, 'activities'] as const,
}
