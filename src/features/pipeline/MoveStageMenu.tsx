import { DropdownMenu } from 'radix-ui'
import { Button } from '@/components/Primitives'
import { cx } from '@/components/classNames'
import { useNow } from '@/app/clockContext'
import { blockingGuard, legalTargets, stageIndex } from '@/domain/pipeline'
import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  type Lead,
  type PipelineStage,
} from '@/domain/types'

/**
 * Move a lead between stages, from the keyboard.
 *
 * Deliberately a menu rather than drag-and-drop. There is no DnD library in the
 * dependency set, a hand-rolled pointer implementation is a poor use of the
 * budget, and — more to the point — a menu is operable by keyboard and screen
 * reader, which a drag target is not without considerable extra work.
 *
 * Illegal targets stay in the list but are disabled and carry the reason, so
 * the board teaches the rules rather than silently hiding options.
 */
export function MoveStageMenu({
  lead,
  onMove,
  onLose,
  disabled = false,
}: {
  readonly lead: Lead
  readonly onMove: (stage: PipelineStage) => void
  readonly onLose: () => void
  readonly disabled?: boolean
}) {
  const now = useNow()
  const allowed = new Set(legalTargets(lead, now))

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button size="sm" variant="ghost" data-testid="move-stage-trigger" disabled={disabled}>
          Move ▾
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          data-testid="move-stage-menu"
          className="z-50 min-w-56 rounded-md border border-line bg-surface p-1 shadow-float"
        >
          <DropdownMenu.Label className="px-2 py-1 text-[11px] font-semibold tracking-wide text-subtle uppercase">
            Move to
          </DropdownMenu.Label>

          {PIPELINE_STAGES.filter((stage) => stage !== lead.stage).map((stage) => {
            const canMove = allowed.has(stage)
            const guard = blockingGuard(lead, stage, now)
            const backwards = stageIndex(stage) < stageIndex(lead.stage)
            return (
              <DropdownMenu.Item
                key={stage}
                disabled={!canMove}
                data-testid={`move-to-${stage}`}
                onSelect={() => onMove(stage)}
                className={cx(
                  'flex cursor-pointer items-center justify-between gap-3 rounded px-2 py-1.5 text-sm outline-none',
                  canMove
                    ? 'text-ink data-[highlighted]:bg-brand-subtle data-[highlighted]:text-brand'
                    : 'cursor-not-allowed text-subtle',
                )}
              >
                <span>{PIPELINE_STAGE_LABELS[stage]}</span>
                {!canMove && guard !== undefined && (
                  <span className="text-[10px] text-warn">{guard.remedy}</span>
                )}
                {!canMove && guard === undefined && backwards && (
                  <span className="text-[10px] text-subtle">too far back</span>
                )}
              </DropdownMenu.Item>
            )
          })}

          <DropdownMenu.Separator className="my-1 h-px bg-[var(--sc-border)]" />
          <DropdownMenu.Item
            data-testid="move-to-lost"
            onSelect={onLose}
            className="cursor-pointer rounded px-2 py-1.5 text-sm text-danger outline-none data-[highlighted]:bg-danger-subtle"
          >
            Mark as lost…
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
