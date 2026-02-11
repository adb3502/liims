import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<div className="p-8"><h1 className="text-2xl font-bold text-primary">LIIMS</h1><p className="mt-2 text-muted-foreground">Longevity India Information Management System</p></div>} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
