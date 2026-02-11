import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ShieldX } from 'lucide-react'

export function ForbiddenPage() {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center px-4">
      <ShieldX className="h-16 w-16 text-muted-foreground/50 mb-4" />
      <h1 className="text-3xl font-bold text-foreground">Access denied</h1>
      <p className="mt-2 text-muted-foreground max-w-md">
        You do not have permission to access this page. If you believe this is
        an error, contact your system administrator.
      </p>
      <div className="mt-6 flex gap-3">
        <Button variant="outline" onClick={() => navigate(-1)}>
          Go back
        </Button>
        <Button onClick={() => navigate('/')}>
          Go to Dashboard
        </Button>
      </div>
    </div>
  )
}
