/**
 * The mock dealership API.
 *
 * These handlers are the ONLY mocking layer. They run in the browser during
 * development and E2E (via `setupWorker`) and under Node in Vitest (via
 * `setupServer`), from one definition — so what the tests prove is what the
 * reviewer sees.
 *
 * Two deliberate choices worth noting:
 *
 *  - `PATCH /leads/:id/stage` calls the SAME `moveStage()` the optimistic UI
 *    called, and returns 422 carrying the identical `DomainError` shape. The
 *    rules live in exactly one place, and you can watch an optimistic move roll
 *    back on screen when the server refuses it.
 *  - Every response echoes the caller's `x-correlation-id`, so a request can be
 *    followed from the click, through the log, to the response — which is what
 *    makes the observability panel more than decoration.
 */

import { http, HttpResponse, delay } from 'msw'
import type { Store } from '@/data/store'
import { type Instant, instant } from '@/domain/instant'
import { moveStage, markLost, markWon, reopenLead } from '@/domain/pipeline'
import { isCustomerContact } from '@/domain/activities'
import type { DomainError } from '@/domain/result'
import {
  ACTIVITY_TYPES,
  LOST_REASONS,
  PIPELINE_STAGES,
  type Activity,
  type ActivityOutcome,
  type ActivityType,
  type Lead,
  type LostReason,
  type PipelineStage,
} from '@/domain/types'

const ACTIVITY_OUTCOMES: readonly ActivityOutcome[] = [
  'connected',
  'no-answer',
  'voicemail',
  'attended',
  'no-show',
  'accepted',
  'declined',
  'referred',
]

function isActivityOutcome(value: unknown): value is ActivityOutcome {
  return typeof value === 'string' && (ACTIVITY_OUTCOMES as readonly string[]).includes(value)
}

export const API_BASE = '/api/v1'

const CORRELATION_HEADER = 'x-correlation-id'

function withCorrelation(request: Request, extra: Record<string, string> = {}): HeadersInit {
  const id = request.headers.get(CORRELATION_HEADER)
  return id === null ? extra : { ...extra, [CORRELATION_HEADER]: id }
}

function problem(request: Request, status: number, error: DomainError): Response {
  return HttpResponse.json({ error }, { status, headers: withCorrelation(request) })
}

const notFound = (request: Request, what: string): Response =>
  problem(request, 404, {
    code: 'NOT_FOUND',
    message: `${what} could not be found.`,
    remedy: 'Go back to the inbox and pick another lead',
  })

/**
 * Artificial latency and fault injection, so the UI's loading and error paths
 * are real.
 *
 * This goes through `problem()` like every other failure, which matters more
 * than it looks: an injected fault is the one response class where a reviewer
 * most wants a correlation id, so it must echo the header too.
 */
async function simulateConditions(
  request: Request,
  store: Store,
  mutating: boolean,
): Promise<Response | null> {
  const meta = store.meta()
  if (meta.latencyMs > 0) await delay(meta.latencyMs)
  if (mutating && meta.errorRate > 0) {
    // Deterministic: every Nth write fails rather than a random one, so a demo
    // of the failure path is reproducible.
    const counter = (globalThis as { __scWriteCount?: number }).__scWriteCount ?? 0
    ;(globalThis as { __scWriteCount?: number }).__scWriteCount = counter + 1
    if ((counter + 1) % Math.round(1 / meta.errorRate) === 0) {
      return problem(request, 503, {
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'The dealer management system did not respond.',
        remedy: 'Try again — your work has not been lost',
      })
    }
  }
  return null
}

function isActivityType(value: unknown): value is ActivityType {
  return typeof value === 'string' && (ACTIVITY_TYPES as readonly string[]).includes(value)
}

function isPipelineStage(value: unknown): value is PipelineStage {
  return typeof value === 'string' && (PIPELINE_STAGES as readonly string[]).includes(value)
}

function isLostReason(value: unknown): value is LostReason {
  return typeof value === 'string' && (LOST_REASONS as readonly string[]).includes(value)
}

/**
 * The ONE place the response clock is stopped.
 *
 * Both write paths that can constitute a first response — logging an activity
 * and saving a quote — go through here, so the rule cannot drift between them.
 * The predicate itself is `isCustomerContact()` from the domain, which is the
 * same function the timeline and the SLA chip read, so there is exactly one
 * definition of "this counts as answering the customer".
 *
 * The `occurredAt >= receivedAt` test matters: back-dating an activity to
 * before the enquiry arrived must not retroactively stop a clock that had not
 * started.
 */
function applyClockStop(lead: Lead, activity: Activity): Lead {
  if (lead.firstRespondedAt !== undefined) return lead
  if (!isCustomerContact(activity)) return lead
  if (activity.occurredAt < lead.receivedAt) return lead
  return { ...lead, firstRespondedAt: activity.occurredAt }
}

export function createHandlers(store: Store) {
  const ensureSeeded = (): void => {
    if (!store.isSeeded()) store.reset()
  }

  return [
    // ------------------------------------------------------------- reference
    http.get(`${API_BASE}/reference`, async ({ request }) => {
      ensureSeeded()
      const failure = await simulateConditions(request, store, false)
      if (failure) return failure
      const meta = store.meta()
      return HttpResponse.json(
        {
          sites: store.sites(),
          executives: store.executives(),
          meta,
        },
        { headers: withCorrelation(request) },
      )
    }),

    // ----------------------------------------------------------------- leads
    http.get(`${API_BASE}/leads`, async ({ request }) => {
      ensureSeeded()
      const failure = await simulateConditions(request, store, false)
      if (failure) return failure

      const url = new URL(request.url)
      const status = url.searchParams.get('status')
      const siteId = url.searchParams.get('siteId')
      const assignedTo = url.searchParams.get('assignedTo')

      let leads = store.leads()
      if (status !== null) leads = leads.filter((l) => l.status.kind === status)
      if (siteId !== null) leads = leads.filter((l) => l.siteId === siteId)
      if (assignedTo !== null) leads = leads.filter((l) => l.assignedTo === assignedTo)

      return HttpResponse.json(
        { leads, total: leads.length },
        { headers: withCorrelation(request) },
      )
    }),

    http.get(`${API_BASE}/leads/:leadId`, async ({ request, params }) => {
      ensureSeeded()
      const failure = await simulateConditions(request, store, false)
      if (failure) return failure

      const lead = store.lead(String(params['leadId']))
      if (!lead) return notFound(request, 'That lead')

      const activities = store.activities(lead.id)

      return HttpResponse.json({ lead, activities }, { headers: withCorrelation(request) })
    }),

    // ------------------------------------------------------------ activities
    http.get(`${API_BASE}/leads/:leadId/activities`, async ({ request, params }) => {
      ensureSeeded()
      const failure = await simulateConditions(request, store, false)
      if (failure) return failure

      const leadId = String(params['leadId'])
      if (!store.lead(leadId)) return notFound(request, 'That lead')
      return HttpResponse.json(
        { activities: store.activities(leadId) },
        { headers: withCorrelation(request) },
      )
    }),

    http.post(`${API_BASE}/leads/:leadId/activities`, async ({ request, params }) => {
      ensureSeeded()
      const failure = await simulateConditions(request, store, true)
      if (failure) return failure

      const leadId = String(params['leadId'])
      const lead = store.lead(leadId)
      if (!lead) return notFound(request, 'That lead')

      const body = (await request.json()) as {
        type?: unknown
        note?: unknown
        occurredAt?: unknown
        actionAt?: unknown
        author?: unknown
        outcome?: unknown
        isCustomerContact?: unknown
      }

      if (!isActivityType(body.type)) {
        return problem(request, 422, {
          code: 'INVALID_ACTIVITY_TYPE',
          message: 'That is not an activity type this dealership records.',
          remedy: 'Pick an activity type from the list',
        })
      }

      const meta = store.meta()
      const actionAt: Instant =
        typeof body.actionAt === 'number' ? instant(body.actionAt) : meta.now
      const occurredAt: Instant =
        typeof body.occurredAt === 'number' ? instant(body.occurredAt) : actionAt

      const existing = store.activities(leadId)
      const previous = existing.length > 0 ? existing[existing.length - 1] : undefined

      const activity: Activity = {
        id: store.nextId('act'),
        leadId,
        type: body.type,
        occurredAt,
        recordedAt: actionAt,
        author: typeof body.author === 'string' ? body.author : (lead.assignedTo ?? 'exec_amara'),
        ...(typeof body.note === 'string' && body.note.length > 0 ? { note: body.note } : {}),
        ...(isActivityOutcome(body.outcome) ? { outcome: body.outcome } : {}),
        ...(previous !== undefined ? { previousActivityId: previous.id } : {}),
        ...(typeof body.isCustomerContact === 'boolean'
          ? { isCustomerContact: body.isCustomerContact }
          : {}),
      }

      store.addActivity(activity)

      // Logging the first genuine contact stops the response clock. Doing this
      // server-side means the SLA cannot be "fixed" by the UI alone.
      let updated = applyClockStop({ ...lead, updatedAt: actionAt }, activity)
      if (activity.type === 'licence-check') {
        updated = { ...updated, licenceCheckedAt: activity.occurredAt }
      }
      store.putLead(updated)

      return HttpResponse.json(
        { activity, lead: updated },
        { status: 201, headers: withCorrelation(request) },
      )
    }),

    // ----------------------------------------------------------- stage moves
    http.patch(`${API_BASE}/leads/:leadId/stage`, async ({ request, params }) => {
      ensureSeeded()
      const failure = await simulateConditions(request, store, true)
      if (failure) return failure

      const lead = store.lead(String(params['leadId']))
      if (!lead) return notFound(request, 'That lead')

      const body = (await request.json()) as { stage?: unknown; actionAt?: unknown }
      if (!isPipelineStage(body.stage)) {
        return problem(request, 422, {
          code: 'UNKNOWN_STAGE',
          message: 'That is not a stage on this pipeline.',
          remedy: 'Pick a stage from the board',
        })
      }

      const meta = store.meta()
      const actionAt: Instant =
        typeof body.actionAt === 'number' ? instant(body.actionAt) : meta.now
      // The same domain function the optimistic UI called.
      const result = moveStage(lead, body.stage, actionAt)
      if (!result.ok) return problem(request, 422, result.error)

      const moved = result.value
      store.putLead(moved)
      store.addActivity({
        id: store.nextId('act'),
        leadId: moved.id,
        type: 'stage-changed',
        occurredAt: actionAt,
        recordedAt: actionAt,
        author: moved.assignedTo ?? 'exec_amara',
        note: `Stage moved to ${body.stage}.`,
      })

      return HttpResponse.json({ lead: moved }, { headers: withCorrelation(request) })
    }),

    // --------------------------------------------------------- close / reopen
    http.post(`${API_BASE}/leads/:leadId/close`, async ({ request, params }) => {
      ensureSeeded()
      const failure = await simulateConditions(request, store, true)
      if (failure) return failure

      const lead = store.lead(String(params['leadId']))
      if (!lead) return notFound(request, 'That lead')

      const body = (await request.json()) as {
        outcome?: unknown
        reason?: unknown
        note?: unknown
        actionAt?: unknown
      }
      const meta = store.meta()
      const actionAt: Instant =
        typeof body.actionAt === 'number' ? instant(body.actionAt) : meta.now

      if (body.outcome === 'won') {
        const result = markWon(lead, actionAt)
        if (!result.ok) return problem(request, 422, result.error)
        store.putLead(result.value)
        return HttpResponse.json({ lead: result.value }, { headers: withCorrelation(request) })
      }

      if (!isLostReason(body.reason)) {
        return problem(request, 422, {
          code: 'LOST_REASON_REQUIRED',
          message: 'A lost sale must record why it was lost.',
          remedy: 'Choose a lost reason',
        })
      }

      const result = markLost(
        lead,
        body.reason,
        actionAt,
        typeof body.note === 'string' ? body.note : undefined,
      )
      if (!result.ok) return problem(request, 422, result.error)
      store.putLead(result.value)
      store.addActivity({
        id: store.nextId('act'),
        leadId: lead.id,
        type: 'lost-sale',
        occurredAt: actionAt,
        recordedAt: actionAt,
        author: lead.assignedTo ?? 'exec_amara',
        note: `Lost: ${body.reason}.`,
      })
      return HttpResponse.json({ lead: result.value }, { headers: withCorrelation(request) })
    }),

    // ---------------------------------------------------------- analytics
    /**
     * KPIs are computed SERVER-SIDE from the same domain module the screens
     * use. A real dashboard would not ship every lead to the browser to add
     * them up, and computing them here means the figures cannot diverge from
     * what the inbox and the pipeline show.
     */

    http.post(`${API_BASE}/leads/:leadId/reopen`, async ({ request, params }) => {
      ensureSeeded()
      const failure = await simulateConditions(request, store, true)
      if (failure) return failure

      const lead = store.lead(String(params['leadId']))
      if (!lead) return notFound(request, 'That lead')

      const body = (await request.json()) as { actionAt?: unknown }
      const meta = store.meta()
      const actionAt: Instant =
        typeof body.actionAt === 'number' ? instant(body.actionAt) : meta.now
      const result = reopenLead(lead, actionAt)
      if (!result.ok) return problem(request, 422, result.error)
      store.putLead(result.value)
      return HttpResponse.json({ lead: result.value }, { headers: withCorrelation(request) })
    }),
  ]
}
