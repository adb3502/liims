import { useState, useMemo, useCallback, useEffect } from 'react'
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
import { cn } from '@/lib/utils'
import {
  Search,
  ChevronLeft,
  ChevronRight,
  FileText,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
} from 'lucide-react'

const PER_PAGE = 50

function useDebounce(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

const ACTION_BADGE_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'success' | 'warning'> = {
  create: 'success',
  update: 'warning',
  delete: 'destructive',
  view: 'secondary',
  export: 'default',
}

const ACTION_LABELS: Record<string, string> = {
  create: 'CREATE',
  update: 'UPDATE',
  delete: 'DELETE',
  view: 'VIEW',
  export: 'EXPORT',
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

function DiffView({ oldValues, newValues }: { oldValues: Record<string, unknown> | null; newValues: Record<string, unknown> | null }) {
  if (!oldValues && !newValues) {
    return <p className="text-sm text-muted-foreground">No change details available.</p>
  }

  const allKeys = new Set([
    ...Object.keys(oldValues || {}),
    ...Object.keys(newValues || {}),
  ])

  return (
    <div className="space-y-2">
      {Array.from(allKeys).map((key) => {
        const oldVal = oldValues?.[key]
        const newVal = newValues?.[key]
        const hasChanged = JSON.stringify(oldVal) !== JSON.stringify(newVal)

        return (
          <div key={key} className="flex gap-4 text-sm">
            <span className="font-mono text-muted-foreground min-w-[120px]">{key}:</span>
            {hasChanged ? (
              <div className="flex-1 space-y-1">
                {oldVal !== undefined && (
                  <div className="text-destructive">
                    <span className="font-semibold">- </span>
                    <span className="font-mono">{JSON.stringify(oldVal)}</span>
                  </div>
                )}
                {newVal !== undefined && (
                  <div className="text-success">
                    <span className="font-semibold">+ </span>
                    <span className="font-mono">{JSON.stringify(newVal)}</span>
                  </div>
                )}
              </div>
            ) : (
              <span className="flex-1 font-mono text-muted-foreground">{JSON.stringify(newVal)}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function AuditLogsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)

  // Parse URL search params
  const page = parseInt(searchParams.get('page') ?? '1', 10)
  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '')
  const debouncedSearch = useDebounce(searchInput, 400)

  const userIdFilter = searchParams.get('user_id') ?? ''
  const actionFilter = searchParams.get('action') ?? ''
  const entityTypeFilter = searchParams.get('entity_type') ?? ''
  const dateFromFilter = searchParams.get('date_from') ?? ''
  const dateToFilter = searchParams.get('date_to') ?? ''

  // Build query params
  const queryParams = useMemo(
    () => ({
      page,
      per_page: PER_PAGE,
      search: debouncedSearch || undefined,
      user_id: userIdFilter || undefined,
      action: actionFilter || undefined,
      entity_type: entityTypeFilter || undefined,
      date_from: dateFromFilter || undefined,
      date_to: dateToFilter || undefined,
    }),
    [page, debouncedSearch, userIdFilter, actionFilter, entityTypeFilter, dateFromFilter, dateToFilter]
  )

  const { data, isLoading, isError } = useAuditLogs(queryParams)
  const { data: usersData } = useUsers({ per_page: 100 })

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
    setSearchInput('')
    setSearchParams({})
  }

  const entityTypes = useMemo(() => {
    if (!data?.data) return []
    const types = new Set(data.data.map((log) => log.entity_type))
    return Array.from(types).sort()
  }, [data?.data])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Audit Logs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            System-wide activity audit trail
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-muted-foreground" />
          {data?.meta && (
            <span className="text-sm text-muted-foreground">
              {data.meta.total.toLocaleString()} total logs
            </span>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search entity, ID, or IP..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
            />
          </div>

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

          {/* Action filter */}
          <Select
            value={actionFilter}
            onChange={(e) => updateParams({ action: e.target.value })}
            options={[
              { value: '', label: 'All Actions' },
              { value: 'create', label: 'Create' },
              { value: 'update', label: 'Update' },
              { value: 'delete', label: 'Delete' },
              { value: 'view', label: 'View' },
              { value: 'export', label: 'Export' },
            ]}
          />

          {/* Entity Type filter */}
          <Select
            value={entityTypeFilter}
            onChange={(e) => updateParams({ entity_type: e.target.value })}
            options={[
              { value: '', label: 'All Entity Types' },
              ...entityTypes.map((type) => ({
                value: type,
                label: type.charAt(0).toUpperCase() + type.slice(1),
              })),
            ]}
          />
        </div>

        {/* Date filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">From Date</label>
            <Input
              type="datetime-local"
              value={dateFromFilter}
              onChange={(e) => updateParams({ date_from: e.target.value })}
            />
          </div>
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
            disabled={!searchInput && !userIdFilter && !actionFilter && !entityTypeFilter && !dateFromFilter && !dateToFilter}
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
          <p className="text-sm text-destructive">Failed to load audit logs.</p>
        </div>
      ) : !data?.data.length ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-sm text-muted-foreground">No audit logs found.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>Timestamp</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity Type</TableHead>
                <TableHead>Entity ID</TableHead>
                <TableHead>IP Address</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((log: AuditLogWithUser) => (
                <>
                  <TableRow
                    key={log.id}
                    className={cn(
                      'cursor-pointer hover:bg-muted/50 transition-colors',
                      expandedRowId === log.id && 'bg-muted/30'
                    )}
                    onClick={() => setExpandedRowId(expandedRowId === log.id ? null : log.id)}
                  >
                    <TableCell>
                      {expandedRowId === log.id ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
                      )}
                    </TableCell>
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
                      <Badge variant={ACTION_BADGE_VARIANTS[log.action] || 'default'}>
                        {ACTION_LABELS[log.action] || log.action.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{log.entity_type}</TableCell>
                    <TableCell>
                      {log.entity_id ? (
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                          {log.entity_id.slice(0, 8)}...
                        </code>
                      ) : (
                        <span className="text-muted-foreground text-xs">N/A</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {log.ip_address || 'N/A'}
                    </TableCell>
                  </TableRow>
                  {expandedRowId === log.id && (
                    <TableRow>
                      <TableCell colSpan={7} className="bg-muted/20 p-6">
                        <div className="space-y-4">
                          <h4 className="font-semibold text-sm">Change Details</h4>
                          <DiffView oldValues={log.old_values} newValues={log.new_values} />
                          {log.additional_context && (
                            <div className="mt-4 pt-4 border-t border-border">
                              <h4 className="font-semibold text-sm mb-2">Additional Context</h4>
                              <pre className="text-xs bg-muted p-3 rounded overflow-auto">
                                {JSON.stringify(log.additional_context, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {data && data.data.length > 0 && (
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
