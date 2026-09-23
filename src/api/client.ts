/**
 * The REST client.
 *
 * Deliberately a real HTTP client hitting real URLs, not a function that
 * reaches into a fake store. MSW intercepts at the network layer, so this code
 * is exactly what would run against a genuine backend — swapping in the real
 * thing is a base-URL change and nothing else.
 *
 * Every request carries a correlation id, times itself, and logs the outcome.
 */

import { API_BASE } from '@/mocks/handlers'
import type { DomainError } from '@/domain/result'
import type {
  Activity,
  Lead,
  LostReason,
  PipelineStage,
  SalesExecutive,
  Site,
} from '@/domain/types'
import type { StoreMeta } from '@/data/store'
import { CORRELATION_HEADER, nextCorrelationId } from '@/observability/correlation'
import { logger } from '@/observability/logger'

/** An error carrying the server's DomainError, so the UI can show its remedy. */
export class ApiError extends Error {
  readonly status: number
  readonly detail: DomainError
  readonly correlationId: string

  constructor(status: number, detail: DomainError, correlationId: string) {
    super(detail.message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    this.correlationId = correlationId
  }
}

const GENERIC_ERROR: DomainError = {
  code: 'NETWORK_ERROR',
  message: 'The dealer management system could not be reached.',
  remedy: 'Check your connection and try again',
}

/**
 * Requests are issued against an absolute URL. In the browser that is simply
 * the current origin; under Node (Vitest) `fetch` rejects relative URLs
 * outright, so the jsdom origin is used instead. Same code path either way.
 */
export function resolveUrl(path: string): string {
  const origin =
    typeof globalThis.location !== 'undefined' && globalThis.location.origin
      ? globalThis.location.origin
      : 'http://localhost'
  return new URL(`${API_BASE}${path}`, origin).toString()
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const correlationId = nextCorrelationId()
  const log = logger.withCorrelation(correlationId)
  const method = init.method ?? 'GET'
  const startedAt = performance.now()

  log.debug('api.request', { method, path })

  let response: Response
  try {
    response = await fetch(resolveUrl(path), {
      ...init,
      headers: {
        'content-type': 'application/json',
        [CORRELATION_HEADER]: correlationId,
        ...(init.headers ?? {}),
      },
    })
  } catch (cause) {
    log.error('api.network_error', { method, path, cause: String(cause) })
    throw new ApiError(0, GENERIC_ERROR, correlationId)
  }

  const durationMs = Math.round(performance.now() - startedAt)

  if (!response.ok) {
    let detail = GENERIC_ERROR
    try {
      const body = (await response.json()) as { error?: DomainError }
      if (body.error) detail = body.error
    } catch {
      // A non-JSON error body is still an error; keep the generic detail.
    }
    log.error('api.response_error', {
      method,
      path,
      status: response.status,
      durationMs,
      code: detail.code,
    })
    throw new ApiError(response.status, detail, correlationId)
  }

  log.info('api.response', { method, path, status: response.status, durationMs })
  return (await response.json()) as T
}

// ----------------------------------------------------------------- endpoints

export interface ReferenceData {
  readonly sites: Site[]
  readonly executives: SalesExecutive[]
  readonly meta: StoreMeta
}

export const api = {
  reference: (): Promise<ReferenceData> => request<ReferenceData>('/reference'),

  listLeads: (filters: { status?: string; siteId?: string; assignedTo?: string } = {}) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== '') params.set(key, value)
    }
    const query = params.toString()
    return request<{ leads: Lead[]; total: number }>(`/leads${query ? `?${query}` : ''}`)
  },

  getLead: (leadId: string) => request<{ lead: Lead; activities: Activity[] }>(`/leads/${leadId}`),

  listActivities: (leadId: string) =>
    request<{ activities: Activity[] }>(`/leads/${leadId}/activities`),

  logActivity: (
    leadId: string,
    body: {
      type: Activity['type']
      note?: string
      occurredAt?: number
      outcome?: Activity['outcome']
      isCustomerContact?: boolean
    },
  ) =>
    request<{ activity: Activity; lead: Lead }>(`/leads/${leadId}/activities`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  moveStage: (leadId: string, stage: PipelineStage) =>
    request<{ lead: Lead }>(`/leads/${leadId}/stage`, {
      method: 'PATCH',
      body: JSON.stringify({ stage }),
    }),

  closeLead: (
    leadId: string,
    body: { outcome: 'won' } | { outcome: 'lost'; reason: LostReason; note?: string },
  ) =>
    request<{ lead: Lead }>(`/leads/${leadId}/close`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  reopenLead: (leadId: string) =>
    request<{ lead: Lead }>(`/leads/${leadId}/reopen`, { method: 'POST' }),
}
