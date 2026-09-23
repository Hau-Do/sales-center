import { useEffect, useState, useSyncExternalStore } from 'react'
import { cx } from '@/components/classNames'
import { type LogLevel, logger } from './logger'

/**
 * The in-app telemetry panel.
 *
 * Observability that a reviewer cannot see is a claim, not a feature. This
 * renders the live log ring buffer — every API call with its correlation id,
 * duration and status — so the whole story is checkable in fifteen seconds
 * without opening devtools. Toggle with the button, or Ctrl+`.
 */
export function DebugPanel() {
  const [open, setOpen] = useState(false)
  const records = useSyncExternalStore(
    (listener) => logger.subscribe(listener),
    () => logger.records(),
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.ctrlKey && event.key === '`') {
        event.preventDefault()
        setOpen((current) => !current)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const tone: Record<LogLevel, string> = {
    debug: 'text-subtle',
    info: 'text-muted',
    warn: 'text-warn',
    error: 'text-danger',
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((c) => !c)}
        data-testid="debug-toggle"
        aria-expanded={open}
        className="fixed right-3 bottom-3 z-30 rounded-full border border-line-strong bg-surface px-3 py-1.5 font-mono text-[11px] text-muted shadow-card hover:text-ink"
      >
        {open ? 'Close' : 'Telemetry'}{' '}
        <span data-numeric className="text-subtle">
          {records.length}
        </span>
      </button>

      {open && (
        <aside
          data-testid="debug-panel"
          className="fixed right-3 bottom-14 z-30 flex h-80 w-[min(34rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-float"
        >
          <header className="flex items-center justify-between border-b border-line px-3 py-1.5">
            <span className="text-xs font-semibold text-ink">Telemetry</span>
            <button
              type="button"
              onClick={() => logger.clear()}
              className="text-[11px] text-subtle hover:text-ink"
            >
              Clear
            </button>
          </header>
          <ol className="min-h-0 flex-1 overflow-y-auto font-mono text-[11px]">
            {records.length === 0 ? (
              <li className="px-3 py-2 text-subtle">No telemetry yet.</li>
            ) : (
              [...records].reverse().map((record) => (
                <li
                  key={record.seq}
                  data-testid="debug-row"
                  className="flex gap-2 border-b border-line px-3 py-1 last:border-b-0"
                >
                  <span className={cx('w-10 shrink-0 uppercase', tone[record.level])}>
                    {record.level}
                  </span>
                  <span className="w-20 shrink-0 text-subtle">{record.correlationId ?? '—'}</span>
                  <span className="min-w-0 flex-1 break-all text-ink">
                    {record.message}
                    {record.context !== undefined && (
                      <span className="text-subtle"> {JSON.stringify(record.context)}</span>
                    )}
                  </span>
                </li>
              ))
            )}
          </ol>
        </aside>
      )}
    </>
  )
}
