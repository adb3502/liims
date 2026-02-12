import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFieldEvents } from '@/api/field-events'
import { useCollectionSites } from '@/api/participants'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageSpinner } from '@/components/ui/spinner'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import type { FieldEventStatus } from '@/types'
import {
  FIELD_EVENT_STATUS_LABELS,
  FIELD_EVENT_TYPE_LABELS,
  PARTNER_LABELS,
} from '@/types'
import {
  Plus,
  Calendar,
  MapPin,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ClipboardList,
} from 'lucide-react'
import { FieldEventCreateDialog } from './FieldEventCreateDialog'

const PER_PAGE = 20

const STATUS_BADGE_VARIANT: Record<FieldEventStatus, 'secondary' | 'warning' | 'success' | 'destructive'> = {
  planned: 'secondary',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'destructive',
}

const ALL_STATUSES: FieldEventStatus[] = ['planned', 'in_progress', 'completed', 'cancelled']

export function FieldEventListPage() {
  const navigate = useNavigate()
  const { hasRole } = useAuth()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<FieldEventStatus | ''>('')
  const [siteFilter, setSiteFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  const { data: sites } = useCollectionSites(true)

  const queryParams = useMemo(() => ({
    page,
    per_page: PER_PAGE,
    status: statusFilter || undefined,
    collection_site_id: siteFilter || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    sort: 'event_date',
    order: sortOrder,
  }), [page, statusFilter, siteFilter, dateFrom, dateTo, sortOrder])

  const { data, isLoading, isError } = useFieldEvents(queryParams)

  const totalPages = data?.meta
    ? Math.ceil(data.meta.total / data.meta.per_page)
    : 0

  const events = data?.data ?? []
  const canCreate = hasRole('super_admin', 'lab_manager', 'field_coordinator')

  const siteMap = useMemo(() => {
    const map = new Map<string, string>()
    sites?.forEach((s) => map.set(s.id, s.name))
    return map
  }, [sites])

  function toggleSort() {
    setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    setPage(1)
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Field Events</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.meta.total != null
              ? `${data.meta.total} event${data.meta.total !== 1 ? 's' : ''}`
              : 'Loading...'}
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4" />
            Create Event
          </Button>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as FieldEventStatus | '')
              setPage(1)
            }}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All Statuses</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {FIELD_EVENT_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Site</label>
          <select
            value={siteFilter}
            onChange={(e) => {
              setSiteFilter(e.target.value)
              setPage(1)
            }}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All Sites</option>
            {sites?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value)
              setPage(1)
            }}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value)
              setPage(1)
            }}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <PageSpinner />
      ) : isError ? (
        <div className="rounded-lg border border-danger/20 bg-danger/5 p-8 text-center">
          <p className="text-sm text-danger">Failed to load field events. Please try again.</p>
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <ClipboardList className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-foreground">No field events found</p>
          <p className="text-xs text-muted-foreground mt-1">
            {statusFilter || siteFilter || dateFrom || dateTo
              ? 'Try adjusting the filters.'
              : 'No field events have been created yet.'}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event Name</TableHead>
                  <TableHead>
                    <button
                      onClick={toggleSort}
                      className="flex items-center gap-1 cursor-pointer hover:text-foreground"
                    >
                      <Calendar className="h-3.5 w-3.5" />
                      Date
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      Site
                    </div>
                  </TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Expected</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                  <TableHead>Partner Lab</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow
                    key={event.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/field-ops/events/${event.id}`)}
                  >
                    <TableCell>
                      <span className="font-medium text-foreground">
                        {event.event_name}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {new Date(event.event_date).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {siteMap.get(event.collection_site_id) ?? event.collection_site_id.slice(0, 8)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {FIELD_EVENT_TYPE_LABELS[event.event_type]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE_VARIANT[event.status ?? 'planned']}>
                        {FIELD_EVENT_STATUS_LABELS[event.status ?? 'planned']}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {event.expected_participants ?? '---'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {event.actual_participants ?? '---'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {event.partner_lab
                        ? PARTNER_LABELS[event.partner_lab]
                        : <span className="text-muted-foreground">---</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create Event Dialog */}
      {showCreateDialog && (
        <FieldEventCreateDialog
          open={showCreateDialog}
          onClose={() => setShowCreateDialog(false)}
        />
      )}
    </div>
  )
}
