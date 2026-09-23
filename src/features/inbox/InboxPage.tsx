import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useNow } from '@/app/clockContext'
import { Badge, EmptyState, RegPlate, Skeleton } from '@/components/Primitives'
import { SlaChip } from '@/components/SlaChip'
import { cx } from '@/components/classNames'
import { relativeTime } from '@/components/format'
import type { SlaStatus } from '@/domain/sla'
import { slaUrgencyRank } from '@/domain/sla'
import {
  LEAD_SOURCE_LABELS,
  PIPELINE_STAGE_LABELS,
  type Lead,
  customerFullName,
  vehicleDescription,
} from '@/domain/types'
import { useLeads, useReference } from '@/hooks/useLeads'
import { useSlaMap } from '@/hooks/useSla'

type ViewKey = 'triage' | 'unworked' | 'breached' | 'all' | 'closed'

const VIEWS: ReadonlyArray<{ key: ViewKey; label: string; hint: string }> = [
  { key: 'triage', label: 'Triage', hint: 'Open leads, most urgent first' },
  { key: 'unworked', label: 'Never worked', hint: 'Nobody has contacted the customer' },
  { key: 'breached', label: 'Breached', hint: 'Past the response target' },
  { key: 'all', label: 'All open', hint: 'Every open enquiry' },
  { key: 'closed', label: 'Closed', hint: 'Won and lost' },
]

type SortKey = 'urgency' | 'recent'

export function InboxPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  /**
   * View, sort order and search all live in the URL rather than in component
   * state. Two reasons, and the second is the one that matters: they survive
   * opening a lead and coming back, and a filtered inbox becomes a link a
   * manager can send to an executive.
   */
  const view = (searchParams.get('view') ?? 'triage') as ViewKey
  const sort = (searchParams.get('sort') ?? 'urgency') as SortKey
  const urlQuery = searchParams.get('q') ?? ''

  /**
   * The search box is the one control that cannot be driven by the URL alone.
   * A text input controlled by a router value lags: React re-renders with the
   * previous `value` prop and resets the DOM element between keystrokes, so
   * fast typing drops characters — "ENQ-4101" arrives as "EQ-4101".
   *
   * So the input is driven by local state, which updates synchronously, and the
   * URL is mirrored from it. Seeding that state from the URL is enough to restore
   * it: opening a lead unmounts this page, so coming back remounts it and reads
   * the query string again. No effect is needed to sync the two, and the spec
   * "survives opening a lead and coming back" is what holds that true.
   */
  const [query, setQueryLocal] = useState(urlQuery)

  const now = useNow()
  const leadsQuery = useLeads()
  const referenceQuery = useReference()

  const allLeads = useMemo(() => leadsQuery.data?.leads ?? [], [leadsQuery.data])
  const slaMap = useSlaMap(allLeads)

  const executiveName = useMemo(() => {
    const map = new Map((referenceQuery.data?.executives ?? []).map((e) => [e.id, e.name]))
    return (id: string | undefined) => (id === undefined ? 'Unassigned' : (map.get(id) ?? id))
  }, [referenceQuery.data])

  const open = useMemo(() => allLeads.filter((l) => l.status.kind === 'open'), [allLeads])

  const counts = useMemo(() => {
    let breached = 0
    let dueSoon = 0
    let onTrack = 0
    for (const lead of open) {
      const status = slaMap.get(lead.id)
      if (!status) continue
      if (status.state === 'breached') breached += 1
      else if (status.state === 'at-risk') dueSoon += 1
      else if (status.state === 'on-track') onTrack += 1
    }
    const neverWorked = open.filter((l) => l.firstRespondedAt === undefined).length
    return { breached, dueSoon, onTrack, neverWorked, closed: allLeads.length - open.length }
  }, [open, slaMap, allLeads.length])

  const visible = useMemo(() => {
    let rows: Lead[]
    switch (view) {
      case 'closed':
        rows = allLeads.filter((l) => l.status.kind !== 'open')
        break
      case 'unworked':
        rows = open.filter((l) => l.firstRespondedAt === undefined)
        break
      case 'breached':
        rows = open.filter((l) => slaMap.get(l.id)?.state === 'breached')
        break
      default:
        rows = open
    }

    const needle = query.trim().toLowerCase()
    if (needle.length > 0) {
      rows = rows.filter((lead) => {
        const haystack = [
          customerFullName(lead.customer),
          lead.reference,
          lead.customer.postcode,
          lead.vehicleOfInterest ? vehicleDescription(lead.vehicleOfInterest) : '',
          lead.partExchange?.registration ?? '',
          lead.vehicleOfInterest?.registration ?? '',
        ]
          .join(' ')
          .toLowerCase()
        return haystack.includes(needle)
      })
    }

    const sorted = [...rows]
    if (sort === 'urgency' && view !== 'closed') {
      sorted.sort((a, b) => {
        const rankA = slaMap.get(a.id)
        const rankB = slaMap.get(b.id)
        const diff =
          (rankA ? slaUrgencyRank(rankA) : Number.MAX_SAFE_INTEGER) -
          (rankB ? slaUrgencyRank(rankB) : Number.MAX_SAFE_INTEGER)
        return diff !== 0 ? diff : b.receivedAt - a.receivedAt
      })
    } else {
      sorted.sort((a, b) => b.receivedAt - a.receivedAt)
    }
    return sorted
  }, [view, allLeads, open, slaMap, query, sort])

  /**
   * Writes one query parameter, dropping it entirely when it is the default so
   * a pristine inbox has a clean URL.
   *
   * The updater form is not optional here. Building the next params from the
   * `searchParams` in scope reads a snapshot that is already stale by the second
   * keystroke, so fast typing silently loses characters — "ENQ-4101" arrives as
   * "EQ-4101". Taking `prev` from the router reads the latest value instead.
   */
  const setParam = (key: 'view' | 'sort' | 'q', value: string, fallback: string) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        if (value === fallback) params.delete(key)
        else params.set(key, value)
        return params
      },
      { replace: true },
    )
  }

  const setView = (next: ViewKey) => setParam('view', next, 'triage')
  const setSort = (next: SortKey) => setParam('sort', next, 'urgency')
  const setQuery = (next: string) => {
    setQueryLocal(next)
    setParam('q', next, '')
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="inbox-page">
      {/* The page needs a level-one heading for screen readers and for axe's
          page-has-heading-one rule; the visible title lives in the app header. */}
      <h1 className="sr-only">Lead inbox</h1>
      <TriageBar counts={counts} loading={leadsQuery.isPending} />

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pt-3 pb-4 lg:flex-row lg:gap-4">
        <nav
          aria-label="Inbox views"
          className="flex gap-1.5 overflow-x-auto lg:w-52 lg:flex-col lg:overflow-visible"
        >
          {VIEWS.map((item) => {
            const count =
              item.key === 'unworked'
                ? counts.neverWorked
                : item.key === 'breached'
                  ? counts.breached
                  : item.key === 'closed'
                    ? counts.closed
                    : open.length
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setView(item.key)}
                title={item.hint}
                data-testid={`view-${item.key}`}
                aria-current={view === item.key ? 'page' : undefined}
                className={cx(
                  'flex shrink-0 items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
                  view === item.key
                    ? 'bg-brand-subtle font-medium text-brand'
                    : 'text-muted hover:bg-surface-sunken hover:text-ink',
                )}
              >
                <span>{item.label}</span>
                <span data-numeric className="text-xs text-subtle">
                  {count}
                </span>
              </button>
            )
          })}
        </nav>

        <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-line bg-surface">
          <header className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, reference, postcode or reg…"
              aria-label="Search leads"
              data-testid="inbox-search"
              className="min-w-0 flex-1 rounded-md border border-line-strong bg-canvas px-2.5 py-1.5 text-sm"
            />
            <div
              className="flex items-center gap-1 rounded-md border border-line-strong p-0.5"
              role="group"
              aria-label="Sort order"
            >
              {(
                [
                  ['urgency', 'Most urgent'],
                  ['recent', 'Most recent'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSort(key)}
                  data-testid={`sort-${key}`}
                  aria-pressed={sort === key}
                  className={cx(
                    'rounded px-2 py-1 text-xs font-medium transition-colors',
                    sort === key ? 'bg-brand text-brand-fg' : 'text-muted hover:text-ink',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto" data-testid="lead-list">
            {leadsQuery.isPending ? (
              <LoadingRows />
            ) : leadsQuery.isError ? (
              <EmptyState
                data-testid="inbox-error"
                title="The inbox could not be loaded"
                description="The dealer management system did not respond. Refresh to try again."
              />
            ) : visible.length === 0 ? (
              <EmptyState
                data-testid="inbox-empty"
                title="Nothing here"
                description={
                  query.length > 0
                    ? 'No lead matches that search.'
                    : 'Every enquiry in this view has been dealt with.'
                }
              />
            ) : (
              <ul>
                {visible.map((lead) => (
                  <LeadRow
                    key={lead.id}
                    lead={lead}
                    sla={slaMap.get(lead.id)}
                    now={now}
                    executiveName={executiveName(lead.assignedTo)}
                  />
                ))}
              </ul>
            )}
          </div>

          <footer className="border-t border-line px-3 py-1.5 text-xs text-subtle">
            Showing{' '}
            <span data-numeric data-testid="visible-count">
              {visible.length}
            </span>{' '}
            of <span data-numeric>{allLeads.length}</span> enquiries
          </footer>
        </section>
      </div>
    </div>
  )
}

function TriageBar({
  counts,
  loading,
}: {
  readonly counts: { breached: number; dueSoon: number; onTrack: number; neverWorked: number }
  readonly loading: boolean
}) {
  const alarm = counts.breached > 0
  return (
    <div
      data-testid="triage-bar"
      className={cx(
        'flex flex-wrap items-center gap-x-5 gap-y-1 border-b px-4 py-2 text-sm',
        alarm ? 'border-danger/25 bg-danger-subtle' : 'border-line bg-surface',
      )}
    >
      {loading ? (
        <Skeleton className="h-4 w-64" />
      ) : (
        <>
          <span className={cx('font-semibold', alarm ? 'text-danger' : 'text-ink')}>
            Breaching{' '}
            <span data-numeric data-testid="count-breached">
              {counts.breached}
            </span>
          </span>
          <span className="text-muted">
            Due soon{' '}
            <span data-numeric data-testid="count-due-soon">
              {counts.dueSoon}
            </span>
          </span>
          <span className="text-muted">
            On track{' '}
            <span data-numeric data-testid="count-on-track">
              {counts.onTrack}
            </span>
          </span>
          <span className="ml-auto text-muted">
            Never worked{' '}
            <span data-numeric data-testid="count-never-worked">
              {counts.neverWorked}
            </span>
          </span>
        </>
      )}
    </div>
  )
}

function LoadingRows() {
  return (
    <ul aria-hidden>
      {Array.from({ length: 8 }, (_, i) => (
        <li key={i} className="flex items-center gap-3 border-b border-line px-3 py-3">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-5 w-16" />
        </li>
      ))}
    </ul>
  )
}

function LeadRow({
  lead,
  sla,
  now,
  executiveName,
}: {
  readonly lead: Lead
  readonly sla: SlaStatus | undefined
  readonly now: number
  readonly executiveName: string
}) {
  const vehicle = lead.vehicleOfInterest
  const closed = lead.status.kind !== 'open'

  return (
    <li className="border-b border-line last:border-b-0">
      <Link
        to={`/leads/${lead.id}`}
        data-testid="lead-row"
        data-lead-id={lead.id}
        data-lead-reference={lead.reference}
        className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-sunken focus-visible:bg-surface-sunken"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-ink" data-testid="lead-customer">
              {customerFullName(lead.customer)}
            </span>
            <Badge tone="neutral">{LEAD_SOURCE_LABELS[lead.source]}</Badge>
            {lead.firstRespondedAt === undefined && !closed && (
              <Badge tone="danger" data-testid="never-worked-badge">
                Never worked
              </Badge>
            )}
            {lead.status.kind === 'lost' && <Badge tone="danger">Lost</Badge>}
            {lead.status.kind === 'won' && <Badge tone="ok">Won</Badge>}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
            <span className="truncate">
              {vehicle ? vehicleDescription(vehicle) : 'No vehicle recorded'}
            </span>
            {vehicle?.registration !== undefined && <RegPlate reg={vehicle.registration} />}
            {lead.partExchange !== undefined && <Badge tone="info">PX</Badge>}
          </div>
        </div>

        <div className="hidden w-36 shrink-0 text-xs text-muted sm:block">
          <div className="truncate">{PIPELINE_STAGE_LABELS[lead.stage]}</div>
          <div className="truncate text-subtle">{executiveName}</div>
        </div>

        <div className="hidden w-24 shrink-0 text-right text-xs text-subtle md:block">
          {relativeTime(lead.receivedAt, now as never)}
        </div>

        <div className="hidden w-12 shrink-0 text-right sm:block"></div>

        <div className="w-24 shrink-0 text-right">
          {sla !== undefined && !closed && <SlaChip status={sla} />}
        </div>
      </Link>
    </li>
  )
}
