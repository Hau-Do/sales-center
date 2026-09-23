import { useId, useState } from 'react'
import { Dialog } from 'radix-ui'
import { Button, Field, TextArea } from '@/components/Primitives'
import { cx } from '@/components/classNames'
import { ApiError } from '@/api/client'
import { ACTIVITY_TYPE_LABELS, type Activity, type ActivityType } from '@/domain/types'
import { useLogActivity } from '@/hooks/useLeads'

/** The activity types a sales executive logs by hand, in the order they'd reach for them. */
const LOGGABLE: readonly ActivityType[] = [
  'call-outbound',
  'call-inbound',
  'email-sent',
  'sms-sent',
  'whatsapp-sent',
  'showroom-appointment-booked',
  'showroom-visit',
  'test-drive-booked',
  'test-drive-completed',
  'licence-check',
  'px-appraisal-completed',
  'quotation-made',
  'finance-proposal-submitted',
  'deposit-taken',
  'pdi-completed',
  'follow-up-scheduled',
  'note',
]

const OUTCOMES: ReadonlyArray<{ value: NonNullable<Activity['outcome']>; label: string }> = [
  { value: 'connected', label: 'Connected' },
  { value: 'no-answer', label: 'No answer' },
  { value: 'voicemail', label: 'Voicemail left' },
  { value: 'attended', label: 'Attended' },
  { value: 'no-show', label: 'No show' },
]

const WANTS_OUTCOME: ReadonlySet<ActivityType> = new Set<ActivityType>([
  'call-outbound',
  'call-inbound',
  'showroom-visit',
  'test-drive-completed',
])

/**
 * Log a follow-up activity.
 *
 * Part A's third requirement. Built on a Radix Dialog, so focus is trapped and
 * restored and Escape works without any of that being hand-rolled.
 */
export function LogActivityDialog({
  leadId,
  trigger,
  defaultType = 'call-outbound',
  onLogged,
}: {
  readonly leadId: string
  readonly trigger: React.ReactNode
  readonly defaultType?: ActivityType
  readonly onLogged?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<ActivityType>(defaultType)
  const [note, setNote] = useState('')
  const [outcome, setOutcome] = useState<Activity['outcome'] | ''>('')
  const mutation = useLogActivity(leadId)
  const typeId = useId()
  const noteId = useId()
  const outcomeId = useId()

  const reset = () => {
    setType(defaultType)
    setNote('')
    setOutcome('')
    mutation.reset()
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    mutation.mutate(
      {
        type,
        ...(note.trim().length > 0 ? { note: note.trim() } : {}),
        ...(outcome !== '' ? { outcome } : {}),
      },
      {
        onSuccess: () => {
          setOpen(false)
          reset()
          onLogged?.()
        },
      },
    )
  }

  const error = mutation.error instanceof ApiError ? mutation.error.detail : undefined

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          data-testid="log-activity-dialog"
          className="fixed top-1/2 left-1/2 z-50 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-surface p-5 shadow-float"
        >
          <Dialog.Title className="text-base font-semibold text-ink">
            Log a follow-up activity
          </Dialog.Title>
          <Dialog.Description className="mt-0.5 text-xs text-subtle">
            Recorded against this enquiry and added to the timeline.
          </Dialog.Description>

          <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
            <Field label="Activity" htmlFor={typeId}>
              <select
                id={typeId}
                data-testid="activity-type"
                value={type}
                onChange={(event) => setType(event.target.value as ActivityType)}
                className="w-full rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-sm text-ink"
              >
                {LOGGABLE.map((value) => (
                  <option key={value} value={value}>
                    {ACTIVITY_TYPE_LABELS[value]}
                  </option>
                ))}
              </select>
            </Field>

            {WANTS_OUTCOME.has(type) && (
              <Field label="Outcome" htmlFor={outcomeId} hint="Optional">
                <select
                  id={outcomeId}
                  data-testid="activity-outcome"
                  value={outcome}
                  onChange={(event) => setOutcome(event.target.value as Activity['outcome'])}
                  className="w-full rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-sm text-ink"
                >
                  <option value="">Not recorded</option>
                  {OUTCOMES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <Field label="Notes" htmlFor={noteId} hint="What was said, and what happens next">
              <TextArea
                id={noteId}
                data-testid="activity-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Called the customer to confirm Saturday's appointment…"
              />
            </Field>

            {error !== undefined && (
              <div
                role="alert"
                data-testid="activity-error"
                className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-xs text-danger"
              >
                <p className="font-medium">{error.message}</p>
                <p className="mt-0.5">{error.remedy}</p>
              </div>
            )}

            <div className="mt-1 flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button variant="ghost" size="sm" type="button">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                variant="primary"
                size="sm"
                type="submit"
                data-testid="activity-submit"
                disabled={mutation.isPending}
                className={cx(mutation.isPending && 'opacity-70')}
              >
                {mutation.isPending ? 'Saving…' : 'Log activity'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
