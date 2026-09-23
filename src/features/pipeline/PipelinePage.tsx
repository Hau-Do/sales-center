import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ApiError } from '@/api/client'
import { useNow } from '@/app/clockContext'
import { Badge, EmptyState, RegPlate, Skeleton } from '@/components/Primitives'
import { SlaChip } from '@/components/SlaChip'
import { cx } from '@/components/classNames'
import { formatGBP } from '@/domain/money'
import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  type Lead,
  type PipelineStage,
  customerFullName,
  vehicleDescription,
} from '@/domain/types'
import { useLeads, useMoveStage } from '@/hooks/useLeads'
import { useSlaMap } from '@/hooks/useSla'
import { LoseLeadDialog } from './LoseLeadDialog'
import { MoveStageMenu } from './MoveStageMenu'

/**
 * The pipeline board.
 *
 * One column per stage, open leads only. Moves happen through a keyboard-
 * operable menu rather than drag-and-drop — see MoveStageMenu for why.
 *
 * A refused move surfaces the domain's own remedy text, and because the mock
 * API runs the same `moveStage()` the UI does, you can watch the server refuse
 * a move the UI thought was fine.
 */
export function PipelinePage() {
  const leadsQuery = useLeads({ status: 'open' })
  const [losing, setLosing] = useState<string | null>(null)

  const leads = useMemo(() => leadsQuery.data?.leads ?? [], [leadsQuery.data])
  const slaMap = useSlaMap(leads)

  const byStage = useMemo(() => {
    const groups = new Map<PipelineStage, Lead[]>(PIPELINE_STAGES.map((s) => [s, []]))
    for (const lead of leads) groups.get(lead.stage)?.push(lead)
    for (const list of groups.values()) {
      // Most urgent at the top of every column, so the board reads the same way
      // as the inbox.
      list.sort((a, b) => {
        const rankA = slaMap.get(a.id)?.remainingMinutes ?? Number.MAX_SAFE_INTEGER
        const rankB = slaMap.get(b.id)?.remainingMinutes ?? Number.MAX_SAFE_INTEGER
        return rankA - rankB
      })
    }
    return groups
  }, [leads, slaMap])

  if (leadsQuery.isPending) {
    return (
      <div className="flex gap-3 overflow-x-auto p-4">
        {PIPELINE_STAGES.slice(0, 6).map((stage) => (
          <Skeleton key={stage} className="h-64 w-64 shrink-0" />
        ))}
      </div>
    )
  }

  if (leadsQuery.isError) {
    return (
      <div className="p-4">
        <EmptyState
          data-testid="pipeline-error"
          title="The pipeline could not be loaded"
          description="The dealer management system did not respond. Refresh to try again."
        />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="pipeline-page">
      <h1 className="sr-only">Sales pipeline</h1>

      <div className="flex items-center gap-4 border-b border-line bg-surface px-4 py-2 text-sm">
        <span className="text-muted">
          <span data-numeric data-testid="pipeline-total">
            {leads.length}
          </span>{' '}
          open {leads.length === 1 ? 'deal' : 'deals'} on the board
        </span>
        <span className="text-[11px] text-subtle">
          Moves are keyboard-operable — open a card's <strong>Move</strong> menu
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-x-auto p-3">
        <div className="flex h-full min-h-0 gap-3">
          {PIPELINE_STAGES.map((stage) => {
            const column = byStage.get(stage) ?? []
            return (
              <section
                key={stage}
                data-testid={`column-${stage}`}
                data-column-count={column.length}
                className="flex h-full w-64 shrink-0 flex-col rounded-lg border border-line bg-surface-sunken"
              >
                <header className="flex items-baseline justify-between border-b border-line px-2.5 py-2">
                  <h2 className="text-xs font-semibold text-ink">{PIPELINE_STAGE_LABELS[stage]}</h2>
                  <span data-numeric className="text-xs text-subtle">
                    {column.length}
                  </span>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                  {column.length === 0 ? (
                    <p className="px-1 py-4 text-center text-[11px] text-subtle">Nothing here</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {column.map((lead) => (
                        <PipelineCard
                          key={lead.id}
                          lead={lead}
                          sla={slaMap.get(lead.id)}
                          onLose={() => setLosing(lead.id)}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      </div>

      {losing !== null && (
        <LoseLeadDialog
          leadId={losing}
          open={losing !== null}
          onOpenChange={(open) => !open && setLosing(null)}
        />
      )}
    </div>
  )
}

function PipelineCard({
  lead,
  sla,
  onLose,
}: {
  readonly lead: Lead
  readonly sla: ReturnType<typeof useSlaMap> extends Map<string, infer S> ? S | undefined : never
  readonly onLose: () => void
}) {
  const move = useMoveStage(lead.id)
  const now = useNow()
  const error = move.error instanceof ApiError ? move.error.detail : undefined
  const vehicle = lead.vehicleOfInterest

  return (
    <li
      data-testid="pipeline-card"
      data-lead-id={lead.id}
      data-lead-reference={lead.reference}
      className={cx(
        'rounded-md border border-line bg-surface p-2.5 shadow-card transition-opacity',
        move.isPending && 'opacity-60',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          to={`/leads/${lead.id}`}
          className="min-w-0 flex-1 text-sm font-medium text-ink hover:text-brand"
          data-testid="pipeline-card-link"
        >
          {customerFullName(lead.customer)}
        </Link>
      </div>

      {vehicle && (
        <p className="mt-0.5 truncate text-[11px] text-muted" title={vehicleDescription(vehicle)}>
          {vehicleDescription(vehicle)}
        </p>
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {sla !== undefined && <SlaChip status={sla} />}
        {vehicle?.registration !== undefined && <RegPlate reg={vehicle.registration} />}
        {lead.partExchange !== undefined && <Badge tone="info">PX</Badge>}
      </div>

      {vehicle && (
        <p data-numeric className="mt-1 text-[11px] text-subtle">
          {formatGBP(vehicle.otrPrice)}
        </p>
      )}

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-1.5">
        <span className="truncate text-[10px] text-subtle">{lead.reference}</span>
        <MoveStageMenu
          lead={lead}
          disabled={move.isPending}
          onMove={(stage) => move.mutate(stage)}
          onLose={onLose}
        />
      </div>

      {error !== undefined && (
        <div
          role="alert"
          data-testid="card-move-error"
          className="mt-1.5 rounded border border-danger/30 bg-danger-subtle px-2 py-1 text-[10px] text-danger"
        >
          <p className="font-medium">{error.message}</p>
          <p data-testid="card-move-remedy">{error.remedy}</p>
        </div>
      )}
      {/* `now` participates so the card re-renders as the clock ticks. */}
      <span hidden data-now={now} />
    </li>
  )
}
