import { useState, useMemo } from 'react'
import { useStoolKits, useIssueStoolKit, useUpdateStoolKit } from '@/api/partner'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageSpinner, Spinner } from '@/components/ui/spinner'
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
import { cn } from '@/lib/utils'
import type { StoolKitStatus } from '@/types'
import { STOOL_KIT_STATUS_LABELS } from '@/types'
import {
  Plus,
  Package,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

const PER_PAGE = 20

const ALL_STATUSES: StoolKitStatus[] = [
  'issued',
  'pickup_scheduled',
  'collected_by_decodeage',
  'processing',
  'results_received',
]

const STATUS_BADGE_VARIANT: Record<StoolKitStatus, 'secondary' | 'warning' | 'default' | 'success'> = {
  issued: 'secondary',
  pickup_scheduled: 'warning',
  collected_by_decodeage: 'default',
  processing: 'warning',
  results_received: 'success',
}

export function StoolKitTrackerPage() {
  const { hasRole } = useAuth()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<StoolKitStatus | ''>('')
  const [participantFilter, setParticipantFilter] = useState('')
  const [showIssueDialog, setShowIssueDialog] = useState(false)
  const [editingKit, setEditingKit] = useState<{ id: string; status: StoolKitStatus } | null>(null)

  const queryParams = useMemo(() => ({
    page,
    per_page: PER_PAGE,
    status: statusFilter || undefined,
    participant_id: participantFilter || undefined,
  }), [page, statusFilter, participantFilter])

  const { data, isLoading, isError } = useStoolKits(queryParams)

  const kits = data?.data ?? []
  const totalPages = data?.meta ? Math.ceil(data.meta.total / data.meta.per_page) : 0
  const canWrite = hasRole('super_admin', 'lab_manager', 'field_coordinator', 'data_entry')

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Stool Kit Tracker</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.meta.total != null
              ? `${data.meta.total} kit${data.meta.total !== 1 ? 's' : ''}`
              : 'Loading...'}
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setShowIssueDialog(true)}>
            <Plus className="h-4 w-4" />
            Issue Kit
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as StoolKitStatus | '')
              setPage(1)
            }}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All Statuses</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>{STOOL_KIT_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <PageSpinner />
      ) : isError ? (
        <div className="rounded-lg border border-danger/20 bg-danger/5 p-8 text-center">
          <p className="text-sm text-danger">Failed to load stool kits.</p>
        </div>
      ) : kits.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Package className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-foreground">No stool kits found</p>
          <p className="text-xs text-muted-foreground mt-1">
            {statusFilter ? 'Try changing the filter.' : 'No stool kits have been issued yet.'}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kit Code</TableHead>
                  <TableHead>Participant</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pickup Date</TableHead>
                  <TableHead>Results</TableHead>
                  <TableHead>Notes</TableHead>
                  {canWrite && <TableHead className="w-24">Action</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {kits.map((kit) => (
                  <TableRow key={kit.id}>
                    <TableCell>
                      <span className="font-mono font-medium text-sm">
                        {kit.kit_code ?? kit.id.slice(0, 8)}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {kit.participant_id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {new Date(kit.issued_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE_VARIANT[kit.status]}>
                        {STOOL_KIT_STATUS_LABELS[kit.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {kit.decodeage_pickup_date
                        ? new Date(kit.decodeage_pickup_date).toLocaleDateString()
                        : <span className="text-muted-foreground">---</span>}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {kit.results_received_at
                        ? new Date(kit.results_received_at).toLocaleDateString()
                        : <span className="text-muted-foreground">---</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">
                      {kit.notes ?? '---'}
                    </TableCell>
                    {canWrite && (
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingKit({ id: kit.id, status: kit.status })}
                        >
                          Update
                        </Button>
                      </TableCell>
                    )}
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

      {/* Issue Kit Dialog */}
      {showIssueDialog && (
        <IssueKitDialog
          open={showIssueDialog}
          onClose={() => setShowIssueDialog(false)}
        />
      )}

      {/* Update Status Dialog */}
      {editingKit && (
        <UpdateStatusDialog
          open={!!editingKit}
          kitId={editingKit.id}
          currentStatus={editingKit.status}
          onClose={() => setEditingKit(null)}
        />
      )}
    </div>
  )
}

// --- Issue Kit Dialog ---

function IssueKitDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const issueMutation = useIssueStoolKit()
  const [participantId, setParticipantId] = useState('')
  const [kitCode, setKitCode] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!participantId.trim()) return
    try {
      await issueMutation.mutateAsync({
        participant_id: participantId.trim(),
        kit_code: kitCode.trim() || undefined,
      })
      onClose()
    } catch {
      // handled by mutation
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent onClose={onClose} className="max-w-md">
        <DialogHeader>
          <DialogTitle>Issue Stool Kit</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="kit-participant">Participant ID</Label>
            <Input
              id="kit-participant"
              value={participantId}
              onChange={(e) => setParticipantId(e.target.value)}
              placeholder="Participant UUID"
              className="font-mono"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kit-code">Kit Code (optional)</Label>
            <Input
              id="kit-code"
              value={kitCode}
              onChange={(e) => setKitCode(e.target.value)}
              placeholder="e.g. SK-001"
              className="font-mono"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={issueMutation.isPending || !participantId.trim()}>
              {issueMutation.isPending ? (
                <>
                  <Spinner size="sm" className="text-primary-foreground" />
                  Issuing...
                </>
              ) : (
                'Issue Kit'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// --- Update Status Dialog ---

function UpdateStatusDialog({
  open,
  kitId,
  currentStatus,
  onClose,
}: {
  open: boolean
  kitId: string
  currentStatus: StoolKitStatus
  onClose: () => void
}) {
  const updateMutation = useUpdateStoolKit(kitId)
  const [newStatus, setNewStatus] = useState<StoolKitStatus>(currentStatus)
  const [pickupDate, setPickupDate] = useState('')
  const [notes, setNotes] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await updateMutation.mutateAsync({
        status: newStatus,
        decodeage_pickup_date: pickupDate || undefined,
        notes: notes || undefined,
      })
      onClose()
    } catch {
      // handled by mutation
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent onClose={onClose} className="max-w-md">
        <DialogHeader>
          <DialogTitle>Update Kit Status</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="kit-status">Status</Label>
            <select
              id="kit-status"
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value as StoolKitStatus)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>{STOOL_KIT_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kit-pickup-date">Pickup Date (optional)</Label>
            <Input
              id="kit-pickup-date"
              type="date"
              value={pickupDate}
              onChange={(e) => setPickupDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kit-notes">Notes (optional)</Label>
            <Input
              id="kit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes..."
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? (
                <>
                  <Spinner size="sm" className="text-primary-foreground" />
                  Updating...
                </>
              ) : (
                'Update Status'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
