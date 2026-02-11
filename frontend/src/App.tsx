import { useEffect } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { routes } from '@/router'
import { useAuthStore } from '@/stores/auth'
import { useNotificationStore } from '@/stores/notifications'
import { getToken } from '@/lib/api'
import { syncTokenToOfflineStore } from '@/lib/offline-store'
import { startSyncManager, stopSyncManager } from '@/lib/sync-manager'
import { ToastContainer } from '@/components/ui/toast'
import { PageSpinner } from '@/components/ui/spinner'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

const router = createBrowserRouter(routes)

function AuthInitializer({ children }: { children: React.ReactNode }) {
  const { checkAuth, isLoading, isAuthenticated } = useAuthStore()
  const { startPolling, stopPolling } = useNotificationStore()

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  useEffect(() => {
    if (isAuthenticated) {
      startPolling()
      // Sync auth token to IndexedDB for service worker background sync
      const token = getToken()
      if (token) {
        syncTokenToOfflineStore(token)
      }
      // Start the offline sync manager
      startSyncManager()
    } else {
      stopPolling()
      stopSyncManager()
    }
    return () => {
      stopPolling()
      stopSyncManager()
    }
  }, [isAuthenticated, startPolling, stopPolling])

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <PageSpinner />
      </div>
    )
  }

  return <>{children}</>
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthInitializer>
        <RouterProvider router={router} />
      </AuthInitializer>
      <ToastContainer />
    </QueryClientProvider>
  )
}

export default App
