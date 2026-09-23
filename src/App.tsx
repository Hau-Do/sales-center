import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AppShell } from '@/app/AppShell'
import { ClockProvider } from '@/app/ClockProvider'
import { createQueryClient } from '@/app/queryClient'
import { InboxPage } from '@/features/inbox/InboxPage'
import { LeadDetailPage } from '@/features/lead-detail/LeadDetailPage'
import { PipelinePage } from '@/features/pipeline/PipelinePage'
import type { Instant } from '@/domain/instant'

const queryClient = createQueryClient()

export function App({ clockBase }: { readonly clockBase: Instant }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ClockProvider base={clockBase}>
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Navigate to="/inbox" replace />} />
              <Route path="/inbox" element={<InboxPage />} />
              <Route path="/leads/:leadId" element={<LeadDetailPage />} />
              <Route path="/pipeline" element={<PipelinePage />} />
              <Route path="*" element={<Navigate to="/inbox" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ClockProvider>
    </QueryClientProvider>
  )
}
