import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { useIsFetching, useIsMutating } from '@tanstack/react-query'
import { cx } from '@/components/classNames'
import { formatDateTime } from '@/components/format'
import { DebugPanel } from '@/observability/DebugPanel'
import { ErrorBoundary } from '@/observability/ErrorBoundary'
import { useClock } from './clockContext'

const NAV = [
  { to: '/inbox', label: 'Inbox' },
  { to: '/pipeline', label: 'Pipeline' },
]

type Theme = 'light' | 'dark'

/** The theme a first-time visitor gets. See the note in `index.html`. */
const DEFAULT_THEME: Theme = 'dark'

/**
 * Dark is the product default, and `prefers-color-scheme` is deliberately not
 * consulted: a showroom floor is dim and this tool is on screen all day, so the
 * theme is a product decision rather than an echo of the operating system. The
 * toggle still switches freely and the choice is remembered.
 *
 * The pre-paint script in `index.html` implements the identical rule. The two
 * must agree — if they drift, the page paints one theme and React repaints the
 * other, which is the flash that script exists to prevent.
 */
function readTheme(): Theme {
  try {
    const stored = localStorage.getItem('sc.theme')
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Storage can throw in a private window; fall through to the default.
  }
  return DEFAULT_THEME
}

export function AppShell() {
  const { now, frozen } = useClock()
  const [theme, setTheme] = useState<Theme>(readTheme)

  /**
   * `data-app-busy` is the application's own quiescence signal, driven by
   * TanStack Query's in-flight counts. Cypress waits on THIS rather than on a
   * fixed sleep — which is why the E2E suite has no cy.wait() in it at all.
   */
  const busy = useIsFetching() + useIsMutating() > 0

  useEffect(() => {
    document.documentElement.dataset['theme'] = theme
    // Kept in step with the attribute so scrollbars and native controls follow
    // the toggle, not just the app's own surfaces. `index.html` sets this for
    // the first frame; this keeps it right for every frame after.
    document.documentElement.style.colorScheme = theme
    try {
      localStorage.setItem('sc.theme', theme)
    } catch {
      // Persisting the preference is a nicety, not a requirement.
    }
  }, [theme])

  return (
    <div
      className="flex h-dvh flex-col bg-canvas text-ink"
      data-app-busy={busy ? 'true' : 'false'}
      data-testid="app-shell"
    >
      <header className="flex items-center gap-4 border-b border-line bg-surface px-4 py-2">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] font-semibold tracking-[0.16em] text-brand uppercase">
            Keyloop
          </span>
          <span className="text-sm font-semibold text-ink">Sales Center</span>
        </div>

        <nav className="flex gap-0.5" aria-label="Main">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              data-testid={`nav-${item.label.toLowerCase()}`}
              className={({ isActive }) =>
                cx(
                  'rounded-md px-2.5 py-1 text-sm transition-colors',
                  isActive ? 'bg-brand-subtle font-medium text-brand' : 'text-muted hover:text-ink',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3 text-xs text-subtle">
          <span data-testid="app-clock" title={frozen ? 'Clock frozen for testing' : undefined}>
            {formatDateTime(now)}
            {frozen && ' · frozen'}
          </span>
          <button
            type="button"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            data-testid="theme-toggle"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            className="rounded-md border border-line-strong px-2 py-1 hover:text-ink"
          >
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>

      <DebugPanel />
    </div>
  )
}
