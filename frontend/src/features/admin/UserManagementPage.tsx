import { useState, useMemo, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useUsers, useCreateUser, useUpdateUser, useResetPassword, useToggleActivate } from '@/api/users'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { PageSpinner, Spinner } from '@/components/ui/spinner'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import type { UserRole, User } from '@/types'
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Users,
  ArrowUpDown,
  Edit,
  Key,
  Power,
} from 'lucide-react'

const PER_PAGE = 25

const USER_ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  lab_manager: 'Lab Manager',
  lab_technician: 'Lab Technician',
  field_coordinator: 'Field Coordinator',
  data_entry: 'Data Entry',
  collaborator: 'Collaborator',
  pi_researcher: 'PI Researcher',
}

const ALL_ROLES: UserRole[] = [
  'super_admin',
  'lab_manager',
  'lab_technician',
  'field_coordinator',
  'data_entry',
  'collaborator',
  'pi_researcher',
]

const ROLE_BADGE_COLORS: Record<UserRole, 'default' | 'success' | 'warning' | 'destructive' | 'secondary'> = {
  super_admin: 'destructive',
  lab_manager: 'warning',
  lab_technician: 'default',
  field_coordinator: 'default',
  data_entry: 'secondary',
  collaborator: 'secondary',
  pi_researcher: 'success',
}

function useDebounce(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

const userCreateSchema = z.object({
  email: z.string().email('Invalid email address'),
  full_name: z.string().min(1, 'Name is required').max(200),
  role: z.enum([
    'super_admin',
    'lab_manager',
    'lab_technician',
    'field_coordinator',
    'data_entry',
    'collaborator',
    'pi_researcher',
  ]),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

const userUpdateSchema = z.object({
  email: z.string().email('Invalid email address').optional(),
  full_name: z.string().min(1, 'Name is required').max(200).optional(),
  role: z.enum([
    'super_admin',
    'lab_manager',
    'lab_technician',
    'field_coordinator',
    'data_entry',
    'collaborator',
    'pi_researcher',
  ]).optional(),
})

type UserCreateFormData = z.infer<typeof userCreateSchema>
type UserUpdateFormData = z.infer<typeof userUpdateSchema>

export function UserManagementPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { hasRole } = useAuth()

  const page = parseInt(searchParams.get('page') ?? '1', 10)
  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '')
  const debouncedSearch = useDebounce(searchInput, 300)

  const roleFilter = searchParams.get('role') ?? ''
  const statusFilter = searchParams.get('is_active') ?? ''

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)

  const queryParams = useMemo(
    () => ({
      page,
      per_page: PER_PAGE,
      search: debouncedSearch || undefined,
      role: (roleFilter || undefined) as UserRole | undefined,
      is_active: statusFilter ? statusFilter === 'true' : undefined,
      sort: searchParams.get('sort') ?? 'created_at',
      order: (searchParams.get('order') ?? 'desc') as 'asc' | 'desc',
    }),
    [page, debouncedSearch, roleFilter, statusFilter, searchParams]
  )

  const { data, isLoading, isError } = useUsers(queryParams)
  const createMutation = useCreateUser()
  const updateMutation = useUpdateUser(selectedUser?.id ?? '')
  const resetPasswordMutation = useResetPassword(selectedUser?.id ?? '')
  const toggleActivateMutation = useToggleActivate(selectedUser?.id ?? '')

  const totalPages = data?.meta
    ? Math.ceil(data.meta.total / data.meta.per_page)
    : 0

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const newParams = new URLSearchParams(searchParams)
      Object.entries(updates).forEach(([k, v]) => {
        if (v) newParams.set(k, v)
        else newParams.delete(k)
      })
      setSearchParams(newParams)
    },
    [searchParams, setSearchParams]
  )

  function handleSort(field: string) {
    const currentSort = searchParams.get('sort')
    const currentOrder = searchParams.get('order') ?? 'desc'
    if (currentSort === field) {
      updateParams({ order: currentOrder === 'asc' ? 'desc' : 'asc' })
    } else {
      updateParams({ sort: field, order: 'asc' })
    }
  }

  const canManage = hasRole('super_admin')
  const canView = hasRole('super_admin', 'lab_manager')

  const {
    register: registerCreate,
    handleSubmit: handleSubmitCreate,
    formState: { errors: errorsCreate },
    reset: resetCreate,
  } = useForm<UserCreateFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(userCreateSchema) as any,
    defaultValues: {
      role: 'data_entry',
    },
  })

  const {
    register: registerUpdate,
    handleSubmit: handleSubmitUpdate,
    formState: { errors: errorsUpdate },
    reset: resetUpdate,
  } = useForm<UserUpdateFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(userUpdateSchema) as any,
  })

  async function onCreateSubmit(data: UserCreateFormData) {
    try {
      await createMutation.mutateAsync(data)
      setCreateDialogOpen(false)
      resetCreate()
    } catch {
      // handled by mutation
    }
  }

  async function onUpdateSubmit(data: UserUpdateFormData) {
    try {
      await updateMutation.mutateAsync(data)
      setEditDialogOpen(false)
      setSelectedUser(null)
      resetUpdate()
    } catch {
      // handled by mutation
    }
  }

  async function handleResetPassword() {
    try {
      await resetPasswordMutation.mutateAsync()
      setResetPasswordDialogOpen(false)
      setSelectedUser(null)
    } catch {
      // handled by mutation
    }
  }

  async function handleToggleActive(user: User) {
    setSelectedUser(user)
    try {
      await toggleActivateMutation.mutateAsync()
      setSelectedUser(null)
    } catch {
      // handled by mutation
    }
  }

  function openEditDialog(user: User) {
    setSelectedUser(user)
    resetUpdate({
      email: user.email,
      full_name: user.full_name,
      role: user.role,
    })
    setEditDialogOpen(true)
  }

  function openResetPasswordDialog(user: User) {
    setSelectedUser(user)
    setResetPasswordDialogOpen(true)
  }

  if (!canView) {
    return (
      <div className="rounded-lg border border-danger/20 bg-danger/5 p-8 text-center">
        <p className="text-sm text-danger">
          You do not have permission to view this page.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">User Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.meta.total != null
              ? `${data.meta.total.toLocaleString()} user${data.meta.total !== 1 ? 's' : ''}`
              : 'Loading...'}
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Create User
          </Button>
        )}
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value)
              updateParams({ page: '1' })
            }}
            className="pl-9"
          />
        </div>

        {/* Role filter */}
        <select
          value={roleFilter}
          onChange={(e) => updateParams({ role: e.target.value, page: '1' })}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All Roles</option>
          {ALL_ROLES.map((r) => (
            <option key={r} value={r}>
              {USER_ROLE_LABELS[r]}
            </option>
          ))}
        </select>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => updateParams({ is_active: e.target.value, page: '1' })}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <PageSpinner />
      ) : isError ? (
        <div className="rounded-lg border border-danger/20 bg-danger/5 p-8 text-center">
          <p className="text-sm text-danger">
            Failed to load users. Please try again.
          </p>
        </div>
      ) : data?.data.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Users className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-foreground">No users found</p>
          <p className="text-xs text-muted-foreground mt-1">
            {debouncedSearch || roleFilter || statusFilter
              ? 'Try adjusting your search or filters.'
              : 'No users have been created yet.'}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <button
                      onClick={() => handleSort('full_name')}
                      className="flex items-center gap-1 cursor-pointer hover:text-foreground"
                    >
                      Name <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <button
                      onClick={() => handleSort('created_at')}
                      className="flex items-center gap-1 cursor-pointer hover:text-foreground"
                    >
                      Created <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>Last Login</TableHead>
                  {canManage && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.data.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <span className="font-medium text-foreground">
                        {user.full_name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {user.email}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={ROLE_BADGE_COLORS[user.role]}>
                        {USER_ROLE_LABELS[user.role]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.is_active ? 'success' : 'secondary'}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(user.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {user.last_login
                        ? new Date(user.last_login).toLocaleDateString()
                        : 'Never'}
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(user)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openResetPasswordDialog(user)}
                          >
                            <Key className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleActive(user)}
                            disabled={toggleActivateMutation.isPending}
                          >
                            <Power className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => updateParams({ page: String(page - 1) })}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => updateParams({ page: String(page + 1) })}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create User Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent onClose={() => setCreateDialogOpen(false)} className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create User</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitCreate(onCreateSubmit as Parameters<typeof handleSubmitCreate>[0])} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="full_name">Full Name</Label>
              <Input
                id="full_name"
                placeholder="e.g. John Doe"
                {...registerCreate('full_name')}
              />
              {errorsCreate.full_name && (
                <p className="text-xs text-danger">{errorsCreate.full_name.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="user@example.com"
                {...registerCreate('email')}
              />
              {errorsCreate.email && (
                <p className="text-xs text-danger">{errorsCreate.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="role">Role</Label>
              <select
                id="role"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                {...registerCreate('role')}
              >
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {USER_ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              {errorsCreate.role && (
                <p className="text-xs text-danger">{errorsCreate.role.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Minimum 8 characters"
                {...registerCreate('password')}
              />
              {errorsCreate.password && (
                <p className="text-xs text-danger">{errorsCreate.password.message}</p>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <>
                    <Spinner size="sm" className="text-primary-foreground" />
                    Creating...
                  </>
                ) : (
                  'Create User'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent onClose={() => setEditDialogOpen(false)} className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitUpdate(onUpdateSubmit as Parameters<typeof handleSubmitUpdate>[0])} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit_full_name">Full Name</Label>
              <Input
                id="edit_full_name"
                placeholder="e.g. John Doe"
                {...registerUpdate('full_name')}
              />
              {errorsUpdate.full_name && (
                <p className="text-xs text-danger">{errorsUpdate.full_name.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit_email">Email</Label>
              <Input
                id="edit_email"
                type="email"
                placeholder="user@example.com"
                {...registerUpdate('email')}
              />
              {errorsUpdate.email && (
                <p className="text-xs text-danger">{errorsUpdate.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit_role">Role</Label>
              <select
                id="edit_role"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                {...registerUpdate('role')}
              >
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {USER_ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              {errorsUpdate.role && (
                <p className="text-xs text-danger">{errorsUpdate.role.message}</p>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? (
                  <>
                    <Spinner size="sm" className="text-primary-foreground" />
                    Updating...
                  </>
                ) : (
                  'Update User'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reset Password Confirmation Dialog */}
      <Dialog open={resetPasswordDialogOpen} onOpenChange={setResetPasswordDialogOpen}>
        <DialogContent onClose={() => setResetPasswordDialogOpen(false)} className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mt-2">
            Are you sure you want to reset the password for{' '}
            <span className="font-medium text-foreground">{selectedUser?.full_name}</span>?
            A password reset email will be sent to their registered email address.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setResetPasswordDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleResetPassword}
              disabled={resetPasswordMutation.isPending}
            >
              {resetPasswordMutation.isPending ? (
                <>
                  <Spinner size="sm" className="text-primary-foreground" />
                  Resetting...
                </>
              ) : (
                'Reset Password'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
