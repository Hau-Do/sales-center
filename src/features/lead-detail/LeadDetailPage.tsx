import { useMemo } from 'react'
import { Link, useParams } from 'react-router'
import { ApiError } from '@/api/client'
import { Badge, Button, EmptyState, RegPlate, Skeleton } from '@/components/Primitives'
import { SlaChip } from '@/components/SlaChip'
import { formatDateTime, formatMileage } from '@/components/format'
import { formatGBP, formatGBPSigned, pence, subPence } from '@/domain/money'
import { blockingGuard, legalTargets, stageLabel } from '@/domain/pipeline'
import {
  ENQUIRY_TYPE_LABELS,
  LEAD_SOURCE_LABELS,
  LOST_REASON_LABELS,
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  type Lead,
  customerFullName,
  vehicleDescription,
} from '@/domain/types'
import { useLead, useMoveStage, useReference } from '@/hooks/useLeads'
import { useSla } from '@/hooks/useSla'
import { useNow } from '@/app/clockContext'
import { ActivityTimeline } from './ActivityTimeline'
import { LogActivityDialog } from './LogActivityDialog'
import { SlaExplainer } from './SlaExplainer'

export function LeadDetailPage() {
  const { leadId } = useParams<{ leadId: string }>()
  const query = useLead(leadId)
  const referenceQuery = useReference()

  const authorName = useMemo(() => {
    const map = new Map((referenceQuery.data?.executives ?? []).map((e) => [e.id, e.name]))
    return (id: string) => map.get(id) ?? id
  }, [referenceQuery.data])

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (query.isError || query.data === undefined) {
    const detail = query.error instanceof ApiError ? query.error.detail : undefined
    return (
      <div className="p-4">
        <EmptyState
          data-testid="lead-error"
          title={detail?.message ?? 'That lead could not be loaded'}
          description={detail?.remedy ?? 'Go back to the inbox and pick another lead.'}
          action={
            <Link to="/inbox">
              <Button size="sm">Back to inbox</Button>
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <LeadDetail lead={query.data.lead} activities={query.data.activities} authorName={authorName} />
  )
}

function LeadDetail({
  lead,
  activities,
  authorName,
}: {
  readonly lead: Lead
  readonly activities: ReturnType<typeof useLead>['data'] extends undefined
    ? never
    : NonNullable<ReturnType<typeof useLead>['data']>['activities']
  readonly authorName: (id: string) => string
}) {
  const sla = useSla(lead)
  const now = useNow()
  const moveStage = useMoveStage(lead.id)
  const targets = useMemo(() => legalTargets(lead, now), [lead, now])
  const moveError = moveStage.error instanceof ApiError ? moveStage.error.detail : undefined

  const px = lead.partExchange
  const equity =
    px?.allowance !== undefined
      ? subPence(px.allowance, px.settlementFigure ?? pence(0))
      : undefined

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      data-testid="lead-detail-page"
      data-lead-id={lead.id}
    >
      <header className="border-b border-line bg-surface px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-subtle">
              <Link to="/inbox" className="hover:text-ink">
                Inbox
              </Link>
              <span aria-hidden>/</span>
              <span data-testid="lead-reference">{lead.reference}</span>
            </div>
            <h1 className="mt-0.5 truncate text-xl font-semibold text-ink" data-testid="lead-title">
              {customerFullName(lead.customer)}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
              <Badge tone="brand">{PIPELINE_STAGE_LABELS[lead.stage]}</Badge>
              <Badge>{LEAD_SOURCE_LABELS[lead.source]}</Badge>
              <Badge>{ENQUIRY_TYPE_LABELS[lead.enquiryType]}</Badge>
              {lead.status.kind === 'lost' && (
                <Badge tone="danger" data-testid="lost-badge">
                  Lost — {LOST_REASON_LABELS[lead.status.reason]}
                </Badge>
              )}
              {lead.status.kind === 'won' && <Badge tone="ok">Won</Badge>}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <SlaChip status={sla} showLabel />
            <LogActivityDialog
              leadId={lead.id}
              trigger={
                <Button variant="primary" size="md" data-testid="log-activity-button">
                  Log activity
                </Button>
              }
            />
          </div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="flex min-h-0 flex-col rounded-lg border border-line bg-surface">
          <h2 className="border-b border-line px-4 py-2 text-sm font-semibold text-ink">
            Activity timeline
          </h2>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ActivityTimeline activities={activities} authorName={authorName} />
          </div>
        </section>

        <aside className="flex flex-col gap-3">
          <Panel title="Response target">
            <SlaExplainer lead={lead} status={sla} />
          </Panel>

          <Panel title="Move stage">
            <div className="flex flex-wrap gap-1.5" data-testid="stage-actions">
              {PIPELINE_STAGES.filter((s) => s !== lead.stage).map((stage) => {
                const allowed = targets.includes(stage)
                const guard = blockingGuard(lead, stage, now)
                return (
                  <Button
                    key={stage}
                    size="sm"
                    data-testid={`stage-to-${stage}`}
                    disabled={!allowed || moveStage.isPending}
                    title={
                      allowed
                        ? `Move to ${stageLabel(stage)}`
                        : (guard?.message ?? 'Not available from here')
                    }
                    onClick={() => moveStage.mutate(stage)}
                  >
                    {PIPELINE_STAGE_LABELS[stage]}
                  </Button>
                )
              })}
            </div>
            {moveError !== undefined && (
              <div
                role="alert"
                data-testid="stage-error"
                className="mt-2 rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-xs text-danger"
              >
                <p className="font-medium">{moveError.message}</p>
                <p className="mt-0.5" data-testid="stage-error-remedy">
                  {moveError.remedy}
                </p>
                {moveError.code === 'LICENCE_CHECK_REQUIRED' && (
                  <LogActivityDialog
                    leadId={lead.id}
                    defaultType="licence-check"
                    trigger={
                      <Button
                        size="sm"
                        variant="danger"
                        className="mt-2"
                        data-testid="remedy-action"
                      >
                        Log a licence check
                      </Button>
                    }
                  />
                )}
              </div>
            )}
          </Panel>

          <Panel title="Customer">
            <Row label="Email" value={lead.customer.email} />
            <Row label="Mobile" value={lead.customer.mobile} />
            <Row label="Postcode" value={lead.customer.postcode} />
            <Row label="Enquired" value={formatDateTime(lead.receivedAt)} />
            {lead.budgetMonthly !== undefined && (
              <Row label="Budget" value={`${formatGBP(lead.budgetMonthly)} / month`} />
            )}
            {lead.financePreference !== undefined && (
              <Row label="Finance" value={lead.financePreference.toUpperCase()} />
            )}
          </Panel>

          {lead.vehicleOfInterest !== undefined && (
            <Panel title="Vehicle of interest">
              <p className="text-sm font-medium text-ink">
                {vehicleDescription(lead.vehicleOfInterest)}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {lead.vehicleOfInterest.registration !== undefined && (
                  <RegPlate reg={lead.vehicleOfInterest.registration} />
                )}
                <Badge>{lead.vehicleOfInterest.stockType}</Badge>
                <Badge>{lead.vehicleOfInterest.fuel.toUpperCase()}</Badge>
              </div>
              <div className="mt-2">
                <Row label="OTR price" value={formatGBP(lead.vehicleOfInterest.otrPrice)} />
                {lead.vehicleOfInterest.mileage !== undefined && (
                  <Row label="Mileage" value={formatMileage(lead.vehicleOfInterest.mileage)} />
                )}
                <Row label="Colour" value={lead.vehicleOfInterest.colour} />
              </div>
            </Panel>
          )}

          {px !== undefined && (
            <Panel title="Part exchange" testId="part-exchange-panel">
              <p className="text-sm font-medium text-ink">
                {px.make} {px.model} {px.derivative}
              </p>
              <div className="mt-1">
                <RegPlate reg={px.registration} />
              </div>
              <div className="mt-2">
                <Row label="Mileage" value={formatMileage(px.mileage)} />
                <Row label="Condition" value={`Grade ${px.conditionGrade}`} />
                <Row label="Service history" value={px.serviceHistory.replace(/-/g, ' ')} />
                {px.motExpiry !== undefined && (
                  <Row
                    label="MOT expiry"
                    value={formatDateTime(px.motExpiry)}
                    tone={px.motExpiry < now ? 'danger' : undefined}
                  />
                )}
                {px.allowance !== undefined && (
                  <Row label="PX allowance" value={formatGBP(px.allowance)} />
                )}
                {px.settlementFigure !== undefined && (
                  <Row label="Settlement" value={formatGBP(px.settlementFigure)} />
                )}
                {equity !== undefined && (
                  <Row
                    label="Equity"
                    value={formatGBPSigned(equity)}
                    tone={equity < 0 ? 'danger' : 'ok'}
                    testId="px-equity"
                  />
                )}
              </div>
              {equity !== undefined && equity < 0 && (
                <p className="mt-2 rounded border border-warn/30 bg-warn-subtle px-2 py-1.5 text-[11px] text-warn">
                  Negative equity — the shortfall rolls into the new agreement.
                </p>
              )}
            </Panel>
          )}

          <Panel title="Marketing consent">
            <div className="flex flex-wrap gap-1.5">
              {lead.consent.map((c) => (
                <Badge key={c.channel} tone={c.granted ? 'ok' : 'neutral'}>
                  {c.channel}: {c.granted ? 'yes' : 'no'}
                </Badge>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-subtle">
              Captured per channel with a lawful basis, as GDPR requires.
            </p>
          </Panel>
        </aside>
      </div>
    </div>
  )
}

function Panel({
  title,
  children,
  testId,
}: {
  readonly title: string
  readonly children: React.ReactNode
  readonly testId?: string
}) {
  return (
    <section className="rounded-lg border border-line bg-surface p-3" data-testid={testId}>
      <h2 className="mb-2 text-[11px] font-semibold tracking-wide text-subtle uppercase">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Row({
  label,
  value,
  tone,
  testId,
}: {
  readonly label: string
  readonly value: string
  readonly tone?: 'danger' | 'ok' | undefined
  readonly testId?: string | undefined
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-sm">
      <span className="text-subtle">{label}</span>
      <span
        data-numeric
        data-testid={testId}
        className={tone === 'danger' ? 'text-danger' : tone === 'ok' ? 'text-ok' : 'text-ink'}
      >
        {value}
      </span>
    </div>
  )
}
