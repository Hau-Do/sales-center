import type { ReactElement, ReactNode } from 'react'
import { render, type RenderOptions, type RenderResult } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { ClockProvider } from '@/app/ClockProvider'
import type { Instant } from '@/domain/instant'
import { DEMO_NOW } from '@/mocks/seed/generate'

export interface ProviderOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Instant the app clock is pinned to. Defaults to the seeded demo clock. */
  readonly now?: Instant
  /** Initial router entry, e.g. '/leads/lead_0001'. */
  readonly route?: string
  /** Route pattern to match, when the component reads params. */
  readonly path?: string
}

/**
 * Render a component with the same providers the real app gives it.
 *
 * A fresh QueryClient per render keeps tests isolated, and retries are off so a
 * deliberate error surfaces immediately instead of after three attempts.
 */
export function renderWithProviders(ui: ReactElement, options: ProviderOptions = {}): RenderResult {
  const { now = DEMO_NOW, route = '/', path, ...rest } = options

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  })

  function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ClockProvider base={now}>
          <MemoryRouter initialEntries={[route]}>
            {path === undefined ? (
              children
            ) : (
              <Routes>
                <Route path={path} element={children} />
              </Routes>
            )}
          </MemoryRouter>
        </ClockProvider>
      </QueryClientProvider>
    )
  }

  return render(ui, { wrapper: Wrapper, ...rest })
}
