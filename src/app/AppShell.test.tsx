import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupServer } from 'msw/node'
import { createStore } from '@/data/store'
import { memoryDb } from '@/data/db'
import { createHandlers } from '@/mocks/handlers'
import { DEMO_NOW } from '@/mocks/seed/generate'
import { renderWithProviders } from '@/test/renderWithProviders'
import { AppShell } from './AppShell'

const store = createStore(memoryDb())
const server = setupServer(...createHandlers(store))

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())
beforeEach(() => {
  server.resetHandlers()
  store.reset({ scenario: 'default', now: DEMO_NOW })
  document.documentElement.removeAttribute('data-theme')
  // jsdom's localStorage in this environment has no clear(); remove the one key
  // this suite touches rather than assuming the whole API is present.
  localStorage.removeItem('sc.theme')
})

const renderShell = () => renderWithProviders(<AppShell />, { route: '/inbox' })

describe('AppShell', () => {
  it('renders the product chrome and the main navigation', () => {
    renderShell()
    expect(screen.getByTestId('app-shell')).toBeInTheDocument()
    expect(screen.getByText('Sales Center')).toBeInTheDocument()
    expect(screen.getByTestId('nav-inbox')).toBeInTheDocument()
    expect(screen.getByTestId('nav-pipeline')).toBeInTheDocument()
  })

  it('shows the application clock', () => {
    renderShell()
    // Saturday 19 September 2026, 09:15 BST — the frozen demo clock.
    expect(screen.getByTestId('app-clock')).toHaveTextContent('Sat 19 Sep, 09:15')
  })

  it('publishes a quiescence signal that E2E waits on', () => {
    renderShell()
    // data-app-busy is what cy.settled() reads instead of a fixed sleep.
    expect(screen.getByTestId('app-shell')).toHaveAttribute('data-app-busy')
  })

  it('defaults to the dark theme when nothing has been chosen', async () => {
    // The product default, not an echo of the OS: the jsdom matchMedia stub
    // reports no preference for anything, so a media-query-driven default
    // would land on light here. Dark is asserted because it is a decision.
    renderShell()
    await waitFor(() => expect(document.documentElement.dataset['theme']).toBe('dark'))
  })

  it('honours a stored preference over the default', async () => {
    localStorage.setItem('sc.theme', 'light')
    renderShell()
    await waitFor(() => expect(document.documentElement.dataset['theme']).toBe('light'))
  })

  it('toggles the theme and remembers the choice', async () => {
    renderShell()
    const toggle = screen.getByTestId('theme-toggle')

    await userEvent.click(toggle)
    await waitFor(() => expect(document.documentElement.dataset['theme']).toBeDefined())
    const chosen = document.documentElement.dataset['theme']
    expect(localStorage.getItem('sc.theme')).toBe(chosen)

    await userEvent.click(toggle)
    await waitFor(() => expect(document.documentElement.dataset['theme']).not.toBe(chosen))
  })

  it('labels the theme toggle for assistive technology', () => {
    renderShell()
    expect(screen.getByTestId('theme-toggle')).toHaveAccessibleName(/Switch to (light|dark) theme/)
  })

  it('mounts the telemetry panel toggle', () => {
    renderShell()
    expect(screen.getByTestId('debug-toggle')).toBeInTheDocument()
  })

  it('marks the current route for assistive technology', () => {
    renderShell()
    expect(screen.getByTestId('nav-inbox').closest('a')).toHaveAttribute('aria-current', 'page')
  })
})
