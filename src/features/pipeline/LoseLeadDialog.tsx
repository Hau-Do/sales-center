import { useId, useState } from 'react'
import { Dialog } from 'radix-ui'
import { Button, Field, TextArea } from '@/components/Primitives'
import { ApiError } from '@/api/client'
import { LOST_REASONS, LOST_REASON_LABELS, type LostReason } from '@/domain/types'
import { useCloseLead } from '@/hooks/useLeads'

/**
 * Closing a lead as lost.
 *
 * A reason is required, and it is required by the TYPE — `LeadStatus`'s `lost`
 * variant carries its `LostReason`, so a lost lead without one is
 * unrepresentable rather than merely rejected at runtime. This dialog is the
 * boundary where that constraint meets a human.
 *
 * The reason matters commercially: lost-reason breakdown is one of the KPIs a
 * sales manager actually acts on.
 */
export function LoseLeadDialog({
  leadId,
  open,
  onOpenChange,
}: {
  readonly leadId: string
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}) {
  const [reason, setReason] = useState<LostReason | ''>('')
  const [note, setNote] = useState('')
  const [touched, setTouched] = useState(false)
  const close = useCloseLead(leadId)
  const reasonId = useId()
  const noteId = useId()

  const error = close.error instanceof ApiError ? close.error.detail : undefined
  const missingReason = touched && reason === ''

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (reason === '') return
    close.mutate(
      { outcome: 'lost', reason, ...(note.trim().length > 0 ? { note: note.trim() } : {}) },
      {
        onSuccess: () => {
          onOpenChange(false)
          setReason('')
          setNote('')
          setTouched(false)
          close.reset()
        },
      },
    )
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          data-testid="lose-lead-dialog"
          className="fixed top-1/2 left-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-surface p-5 shadow-float"
        >
          <Dialog.Title className="text-base font-semibold text-ink">
            Mark this lead as lost
          </Dialog.Title>
          <Dialog.Description className="mt-0.5 text-xs text-subtle">
            The reason is recorded against the lead and feeds the lost-reason breakdown.
          </Dialog.Description>

          <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
            <Field
              label="Reason"
              htmlFor={reasonId}
              {...(missingReason ? { error: 'Choose a reason before closing the lead' } : {})}
            >
              <select
                id={reasonId}
                data-testid="lost-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value as LostReason)}
                className="w-full rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-sm text-ink"
              >
                <option value="">Select a reason…</option>
                {LOST_REASONS.map((value) => (
                  <option key={value} value={value}>
                    {LOST_REASON_LABELS[value]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Notes" htmlFor={noteId} hint="Optional — what did they go with instead?">
              <TextArea
                id={noteId}
                data-testid="lost-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>

            {error !== undefined && (
              <div
                role="alert"
                data-testid="lose-error"
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
                variant="danger"
                size="sm"
                type="submit"
                data-testid="confirm-lost"
                disabled={close.isPending}
              >
                {close.isPending ? 'Closing…' : 'Mark as lost'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
