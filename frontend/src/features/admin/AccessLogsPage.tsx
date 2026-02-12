import React, { useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuditLogs, type AuditLogWithUser } from '@/api/audit-logs'
import { useUsers } from '@/api/users'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { PageSpinner } from '@/components/ui/spinner'
import {
  ChevronLeft,
  ChevronRight,
  Shield,
} from 'lucide-react'

const PER_PAGE = 50

const ACCESS_ACTION_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'success' | 'warning'> = {
  create: 'success',
  update: 'warning',
  delete: 'destructive',
  view: 'secondary',
}

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function getAccessEventLabel(log: AuditLogWithUser): string {
  // Check additional_context for login/logout/password_change indicators
  const context = log.additional_context as Record<string, unknown> | undefined
  if (context?.event_type) {
    const eventType = String(context.event_type).toUpperCase()
    if (eventType === 'LOGIN') return 'LOGIN'
    if (eventType === 'LOGOUT') return 'LOGOUT'
    if (eventType === 'PASSWORD_CHANGE') return 'PASSWORD CHANGE'
  }

  // Fallback: infer from action and entity_type
  if (log.entity_type === 'user_session' && log.action === 'create') {
    return 'LOGIN'
  }
  if (log.entity_type === 'user_session' && log.action === 'delete') {
    return 'LOGOUT'
  }
  if (log.entity_type === 'user' && log.action === 'update') {
    return 'PASSWORD CHANGE'
  }

  return log.action.toUpperCase()
}

function getStatusBadge(log: AuditLogWithUser): React.ReactElement {
  const context = log.additional_context as Record<string, unknown> | undefined
  const success = context?.success !== false

  return (
    <Badge variant={success ? 'success' : 'destructive'}>
      {success ? 'SUCCESS' : 'FAILED'}
    </Badge>
  )
}

export function AccessLogsPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  // Parse URL search params
  const page = parseInt(searchParams.get('page') ?? '1', 10)
  const userIdFilter = searchParams.get('user_id') ?? ''
  const dateFromFilter = searchParams.get('date_from') ?? ''
  const dateToFilter = searchParams.get('date_to') ?? ''

  // Build query params - filter to access-related events
  const queryParams = useMemo(
    () => ({
      page,
      per_page: PER_PAGE,
      user_id: userIdFilter || undefined,
      date_from: dateFromFilter || undefined,
      date_to: dateToFilter || undefined,
      // We'll filter for user_session and user entities with specific actions
      entity_type: undefined, // We'll fetch all and filter in UI for flexibility
    }),
    [page, userIdFilter, dateFromFilter, dateToFilter]
  )

  const { data, isLoading, isError } = useAuditLogs(queryParams)
  const { data: usersData } = useUsers({ per_page: 100 })

  // Filter to access-related logs
  const accessLogs = useMemo(() => {
    if (!data?.data) return []
    return data.data.filter((log: AuditLogWithUser) => {
      // Include user_session create/delete (login/logout)
      if (log.entity_type === 'user_session' && (log.action === 'create' || log.action === 'delete')) {
        return true
      }
      // Include user updates that might be password changes
      if (log.entity_type === 'user' && log.action === 'update') {
        const context = log.additional_context as Record<string, unknown> | undefined
        if (context?.event_type === 'password_change') {
          return true
        }
        // Also check if old/new values contain password-related fields
        if (log.new_values && 'password_hash' in log.new_values) {
          return true
        }
      }
      return false
    })
  }, [data?.data])

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
      // Reset to page 1 when filters change
      if (!updates.page) {
        newParams.set('page', '1')
      }
      setSearchParams(newParams)
    },
    [searchParams, setSearchParams]
  )

  function handleClearFilters() {
    setSearchParams({})
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Access Logs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            User login, logout, and authentication events
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-muted-foreground" />
          {accessLogs && (
            <span className="text-sm text-muted-foreground">
              {accessLogs.length} access events
            </span>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* User filter */}
          <Select
            value={userIdFilter}
            onChange={(e) => updateParams({ user_id: e.target.value })}
            options={[
              { value: '', label: 'All Users' },
              ...(usersData?.data || []).map((user) => ({
                value: user.id,
                label: `${user.full_name} (${user.email})`,
              })),
            ]}
          />

          {/* Date from */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">From Date</label>
            <Input
              type="datetime-local"
              value={dateFromFilter}
              onChange={(e) => updateParams({ date_from: e.target.value })}
            />
          </div>

          {/* Date to */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">To Date</label>
            <Input
              type="datetime-local"
              value={dateToFilter}
              onChange={(e) => updateParams({ date_to: e.target.value })}
            />
          </div>
        </div>

        {/* Clear filters */}
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearFilters}
            disabled={!userIdFilter && !dateFromFilter && !dateToFilter}
          >
            Clear Filters
          </Button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <PageSpinner />
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-6 text-center">
          <p className="text-sm text-destructive">Failed to load access logs.</p>
        </div>
      ) : !accessLogs.length ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Shield className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-sm text-muted-foreground">No access logs found.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accessLogs.map((log: AuditLogWithUser) => (
                <TableRow key={log.id}>
                  <TableCell className="text-sm">
                    {formatTimestamp(log.timestamp)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">
                        {log.user_full_name || 'System'}
                      </span>
                      {log.user_email && (
                        <span className="text-xs text-muted-foreground">
                          {log.user_email}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={ACCESS_ACTION_VARIANTS[log.action] || 'default'}>
                      {getAccessEventLabel(log)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {log.ip_address || 'N/A'}
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(log)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {data && accessLogs.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {((page - 1) * PER_PAGE) + 1} to {Math.min(page * PER_PAGE, data.meta.total)} of{' '}
            {data.meta.total.toLocaleString()} logs
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateParams({ page: String(page - 1) })}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateParams({ page: String(page + 1) })}
              disabled={page >= totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
