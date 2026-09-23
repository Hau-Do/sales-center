/**
 * The road to a sale, as a state machine.
 *
 * Two things make this more than an enum with arrows:
 *
 *  1. **Guards carry remedies.** Refusing a move is useless if the salesperson
 *     cannot tell what to do about it. Every refusal names the blocking rule
 *     AND the action that unblocks it, and the UI renders that remedy verbatim
 *     next to a button that performs it. The same string is asserted in the
 *     unit test and in the Cypress spec, so the copy cannot drift from the rule.
 *
 *  2. **The mock API calls this same function.** `PATCH /leads/:id` runs
 *     `moveStage` and returns 422 with the identical error shape the optimistic
 *     UI produced. The rules live in exactly one place, and the reviewer can
 *     see that on screen by watching an optimistic move roll back.
 */

import { type Instant, addLocalDays } from './instant'
import { type DomainError, type Result, domainError, err, ok } from './result'
import {
  type Lead,
  type LostReason,
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  type PipelineStage,
} from './types'

/**
 * How many stages a lead may be moved backwards in one step (ASM-PIPE-01).
 *
 * One covers the real case — correcting a mis-click — without letting a deal
 * silently rewind past evidence that has already been captured. Exported so
 * `scripts/mutation-sanity.mjs` can flip it and prove the suite notices.
 */
export const BACKWARD_LIMIT = 1

/** A driving licence check is valid for a year (ASM-PIPE-03). Checked before a test drive. */
export const LICENCE_CHECK_VALID_DAYS = 365

export function stageIndex(stage: PipelineStage): number {
  return PIPELINE_STAGES.indexOf(stage)
}

export function stageLabel(stage: PipelineStage): string {
  return PIPELINE_STAGE_LABELS[stage]
}

export function isTerminalStage(stage: PipelineStage): boolean {
  return stage === 'handover'
}

/** A guard that must hold before a lead may enter a stage. */
interface StageGuard {
  readonly code: string
  readonly appliesTo: PipelineStage
  readonly check: (lead: Lead, now: Instant) => boolean
  readonly message: string
  readonly remedy: string
}

const GUARDS: readonly StageGuard[] = [
  {
    code: 'LICENCE_CHECK_REQUIRED',
    appliesTo: 'test-drive',
    check: (lead, now) => {
      if (lead.licenceCheckedAt === undefined) return false
      const expiresAt = addLocalDays(lead.licenceCheckedAt, LICENCE_CHECK_VALID_DAYS)
      return now < expiresAt
    },
    message: 'The customer’s driving licence has not been checked in the last 12 months.',
    remedy: 'Log a licence check',
  },
  {
    code: 'DEPOSIT_REQUIRED',
    appliesTo: 'order-placed',
    check: (lead) => lead.depositTaken !== undefined && lead.depositTaken > 0,
    message: 'No deposit has been recorded against this deal.',
    remedy: 'Log a deposit',
  },
  {
    code: 'PREPARATION_REQUIRED_BEFORE_HANDOVER',
    appliesTo: 'handover',
    check: (lead) => stageIndex(lead.stage) >= stageIndex('preparation'),
    // ASM-PIPE-04: a car is prepared before it is handed over.
    message: 'The vehicle has not been through pre-delivery inspection yet.',
    remedy: 'Move the lead to Preparation (PDI) first',
  },
]

/**
 * Is this stage move legal for this lead, right now?
 *
 * Ordering matters: structural rules (closed lead, same stage, rewinding too
 * far) are checked before guards, so a closed lead reports that it is closed
 * rather than complaining about a missing licence check.
 */
export function canMoveStage(lead: Lead, to: PipelineStage, now: Instant): Result<void> {
  if (lead.status.kind !== 'open') {
    return err(
      domainError(
        'LEAD_CLOSED',
        `This lead is already marked as ${lead.status.kind}.`,
        'Reopen the lead before changing its stage',
        { status: lead.status.kind },
      ),
    )
  }

  const from = stageIndex(lead.stage)
  const target = stageIndex(to)

  /* v8 ignore next 10 -- unreachable through the typed API; defends the JSON boundary */
  if (target === -1) {
    return err(
      domainError(
        'UNKNOWN_STAGE',
        `${String(to)} is not a pipeline stage.`,
        'Pick a stage from the board',
      ),
    )
  }

  if (target === from) {
    return err(
      domainError(
        'SAME_STAGE',
        `This lead is already at ${stageLabel(to)}.`,
        'Pick a different stage',
      ),
    )
  }

  if (target < from - BACKWARD_LIMIT) {
    return err(
      domainError(
        'BACKWARD_LIMIT_EXCEEDED',
        `A lead can only be moved back one stage at a time, and this is ${from - target}.`,
        /* v8 ignore next -- target >= 0 and target < from-1 imply from >= 2, so from-1 is always in range */
        `Move it back to ${stageLabel(PIPELINE_STAGES[from - 1] ?? lead.stage)} first`,
        { from: lead.stage, to, distance: from - target },
      ),
    )
  }

  // Guards apply on ENTRY only, not when rewinding past a stage (ASM-PIPE-02):
  // a rewind is an administrative correction, not a fresh test drive.
  if (target > from) {
    const guard = GUARDS.find((g) => g.appliesTo === to)
    if (guard && !guard.check(lead, now)) {
      return err(domainError(guard.code, guard.message, guard.remedy, { stage: to }))
    }
  }

  return ok(undefined)
}

/** Every stage this lead could legally move to right now. Never throws. */
export function legalTargets(lead: Lead, now: Instant): PipelineStage[] {
  return PIPELINE_STAGES.filter((stage) => canMoveStage(lead, stage, now).ok)
}

/** Apply a stage move, returning the updated lead or the refusal. */
export function moveStage(lead: Lead, to: PipelineStage, now: Instant): Result<Lead> {
  const check = canMoveStage(lead, to, now)
  if (!check.ok) return check

  return ok({ ...lead, stage: to, lastStageChangeAt: now, updatedAt: now })
}

/** Close a lead as lost. The reason is required by the type, not by a guard. */
export function markLost(
  lead: Lead,
  reason: LostReason,
  now: Instant,
  note?: string,
): Result<Lead> {
  if (lead.status.kind !== 'open') {
    return err(
      domainError(
        'LEAD_CLOSED',
        `This lead is already marked as ${lead.status.kind}.`,
        'Reopen the lead before closing it again',
      ),
    )
  }
  return ok({
    ...lead,
    status: { kind: 'lost', reason, lostAt: now, ...(note !== undefined ? { note } : {}) },
    updatedAt: now,
  })
}

export function markWon(lead: Lead, now: Instant): Result<Lead> {
  if (lead.status.kind !== 'open') {
    return err(
      domainError(
        'LEAD_CLOSED',
        `This lead is already marked as ${lead.status.kind}.`,
        'Reopen the lead before closing it again',
      ),
    )
  }
  if (lead.stage !== 'handover') {
    return err(
      domainError(
        'HANDOVER_REQUIRED',
        'A deal is only won once the vehicle has been handed over.',
        'Move the lead to Handover first',
      ),
    )
  }
  return ok({ ...lead, status: { kind: 'won', wonAt: now }, updatedAt: now })
}

export function reopenLead(lead: Lead, now: Instant): Result<Lead> {
  if (lead.status.kind === 'open') {
    return err(domainError('LEAD_ALREADY_OPEN', 'This lead is already open.', 'No action needed'))
  }
  return ok({ ...lead, status: { kind: 'open' }, updatedAt: now })
}

/** The guard blocking entry to `stage`, if any — for pre-emptive UI hints. */
export function blockingGuard(
  lead: Lead,
  stage: PipelineStage,
  now: Instant,
): DomainError | undefined {
  const guard = GUARDS.find((g) => g.appliesTo === stage)
  if (!guard || guard.check(lead, now)) return undefined
  return domainError(guard.code, guard.message, guard.remedy, { stage })
}

export const GUARDED_STAGES: readonly PipelineStage[] = GUARDS.map((g) => g.appliesTo)
