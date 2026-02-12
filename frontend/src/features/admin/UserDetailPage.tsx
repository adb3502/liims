import { useParams, useNavigate } from 'react-router-dom'
import { useUser } from '@/api/users'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { PageSpinner } from '@/components/ui/spinner'
import { ArrowLeft } from 'lucide-react'
import type { UserRole } from '@/types'

const USER_ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  lab_manager: 'Lab Manager',
  lab_technician: 'Lab Technician',
  field_coordinator: 'Field Coordinator',
  data_entry: 'Data Entry',
  collaborator: 'Collaborator',
  pi_researcher: 'PI Researcher',
}

export function UserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: user, isLoading, isError } = useUser(id!)

  if (isLoading) {
    return <PageSpinner />
  }

  if (isError || !user) {
    return (
      <div className="rounded-lg border border-danger/20 bg-danger/5 p-8 text-center">
        <p className="text-sm text-danger">
          Failed to load user details. Please try again.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/admin/users')}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Users
        </Button>
        <h1 className="text-2xl font-bold text-foreground">{user.full_name}</h1>
        <p className="text-sm text-muted-foreground mt-1">{user.email}</p>
      </div>

      {/* User Details Card */}
      <Card className="p-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-1">Role</h3>
            <Badge variant="default">{USER_ROLE_LABELS[user.role]}</Badge>
          </div>

          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-1">Status</h3>
            <Badge variant={user.is_active ? 'success' : 'secondary'}>
              {user.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </div>

          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-1">Created At</h3>
            <p className="text-sm text-foreground">
              {new Date(user.created_at).toLocaleString()}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-1">Last Login</h3>
            <p className="text-sm text-foreground">
              {user.last_login
                ? new Date(user.last_login).toLocaleString()
                : 'Never'}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-1">User ID</h3>
            <p className="text-sm font-mono text-foreground">{user.id}</p>
          </div>
        </div>
      </Card>
    </div>
  )
}
