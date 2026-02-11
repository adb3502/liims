import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFreezers, useCreateFreezer, type FreezerRead } from '@/api/storage'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { PageSpinner } from '@/components/ui/spinner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { FreezerType } from '@/types'
import {
  Plus,
  Thermometer,
  MapPin,
  Box,
  ChevronLeft,
  ChevronRight,
  Snowflake,
} from 'lucide-react'

const PER_PAGE = 50

const FREEZER_TYPE_LABELS: Record<FreezerType, string> = {
  minus_150: '-150\u00B0C',
  minus_80: '-80\u00B0C',
  plus_4: '+4\u00B0C',
  room_temp: 'Room Temp',
}

const FREEZER_TYPE_COLORS: Record<FreezerType, { bg: string; text: string; border: string }> = {
  minus_150: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  minus_80: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' },
  plus_4: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  room_temp: { bg: 'bg-stone-50', text: 'text-stone-600', border: 'border-stone-200' },
}

const FREEZER_TYPE_ICON_COLORS: Record<FreezerType, string> = {
  minus_150: 'text-blue-500',
  minus_80: 'text-cyan-500',
  plus_4: 'text-amber-500',
  room_temp: 'text-stone-400',
}

const ALL_FREEZER_TYPES: FreezerType[] = ['minus_150', 'minus_80', 'plus_4', 'room_temp']

function getUtilizationColor(pct: number): { bar: string; text: string; bg: string } {
  if (pct > 90) return { bar: 'bg-red-500', text: 'text-red-600', bg: 'bg-red-50' }
  if (pct > 70) return { bar: 'bg-amber-500', text: 'text-amber-600', bg: 'bg-amber-50' }
  return { bar: 'bg-emerald-500', text: 'text-emerald-600', bg: 'bg-emerald-50' }
}

function FreezerCard({ freezer, onClick }: { freezer: FreezerRead; onClick: () => void }) {
  const typeColors = FREEZER_TYPE_COLORS[freezer.freezer_type]
  const iconColor = FREEZER_TYPE_ICON_COLORS[freezer.freezer_type]
  const utilColor = getUtilizationColor(freezer.utilization_pct)
  const pct = Math.round(freezer.utilization_pct)

  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative w-full text-left rounded-xl border bg-card p-0 overflow-hidden',
        'shadow-sm hover:shadow-md transition-all duration-200',
        'hover:border-primary/30 cursor-pointer',
        !freezer.is_active && 'opacity-60',
      )}
    >
      {/* Top accent stripe */}
      <div
        className={cn(
          'h-1.5 w-full',
          freezer.freezer_type === 'minus_150' && 'bg-gradient-to-r from-blue-500 to-blue-400',
          freezer.freezer_type === 'minus_80' && 'bg-gradient-to-r from-cyan-500 to-cyan-400',
          freezer.freezer_type === 'plus_4' && 'bg-gradient-to-r from-amber-500 to-amber-400',
          freezer.freezer_type === 'room_temp' && 'bg-gradient-to-r from-stone-400 to-stone-300',
        )}
      />

      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn('flex-shrink-0 rounded-lg p-2', typeColors.bg)}>
              <Snowflake className={cn('h-5 w-5', iconColor)} />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                {freezer.name}
              </h3>
              {freezer.location && (
                <div className="flex items-center gap-1 mt-0.5">
                  <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs text-muted-foreground truncate">{freezer.location}</span>
                </div>
              )}
            </div>
          </div>

          <Badge
            className={cn(
              'flex-shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border',
              typeColors.bg,
              typeColors.text,
              typeColors.border,
            )}
          >
            {FREEZER_TYPE_LABELS[freezer.freezer_type]}
          </Badge>
        </div>

        {/* Utilization bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-muted-foreground font-medium">Utilization</span>
            <span className={cn('text-xs font-bold tabular-nums', utilColor.text)}>
              {pct}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-500', utilColor.bar)}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-between pt-3 border-t border-border/60">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Box className="h-3.5 w-3.5" />
            <span className="tabular-nums font-medium">
              {freezer.used_positions}
            </span>
            <span>/</span>
            <span className="tabular-nums">
              {freezer.total_positions}
            </span>
            <span>positions</span>
          </div>
          {!freezer.is_active && (
            <Badge variant="secondary" className="text-[10px]">Inactive</Badge>
          )}
        </div>
      </div>
    </button>
  )
}

export function FreezerListPage() {
  const navigate = useNavigate()
  const { hasRole } = useAuth()
  const [typeFilter, setTypeFilter] = useState<FreezerType | ''>('')
  const [page, setPage] = useState(1)
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  const queryParams = useMemo(() => ({
    page,
    per_page: PER_PAGE,
    freezer_type: typeFilter || undefined,
  }), [page, typeFilter])

  const { data, isLoading, isError } = useFreezers(queryParams)

  const totalPages = data?.meta
    ? Math.ceil(data.meta.total / data.meta.per_page)
    : 0

  const canCreate = hasRole('super_admin', 'lab_manager')

  // Summary stats
  const freezers = data?.data ?? []
  const totalUsed = freezers.reduce((sum, f) => sum + f.used_positions, 0)
  const totalPositions = freezers.reduce((sum, f) => sum + f.total_positions, 0)
  const overallUtilization = totalPositions > 0 ? Math.round((totalUsed / totalPositions) * 100) : 0

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Storage Freezers</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.meta.total != null
              ? `${data.meta.total} freezer${data.meta.total !== 1 ? 's' : ''}`
              : 'Loading...'}
            {totalPositions > 0 && (
              <span className="ml-2">
                &middot; {totalUsed.toLocaleString()}/{totalPositions.toLocaleString()} positions used ({overallUtilization}%)
              </span>
            )}
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4" />
            Add Freezer
          </Button>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-6">
        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value as FreezerType | '')
            setPage(1)
          }}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All Types</option>
          {ALL_FREEZER_TYPES.map((t) => (
            <option key={t} value={t}>
              {FREEZER_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      {/* Content */}
      {isLoading ? (
        <PageSpinner />
      ) : isError ? (
        <div className="rounded-lg border border-danger/20 bg-danger/5 p-8 text-center">
          <p className="text-sm text-danger">Failed to load freezers. Please try again.</p>
        </div>
      ) : freezers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Thermometer className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-foreground">No freezers found</p>
          <p className="text-xs text-muted-foreground mt-1">
            {typeFilter
              ? 'Try changing the type filter.'
              : 'No freezers have been added yet.'}
          </p>
        </div>
      ) : (
        <>
          {/* Freezer cards grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {freezers.map((freezer) => (
              <FreezerCard
                key={freezer.id}
                freezer={freezer}
                onClick={() => navigate(`/storage/freezers/${freezer.id}`)}
              />
            ))}
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

      {/* Create Freezer Dialog */}
      {showCreateDialog && (
        <CreateFreezerDialog
          open={showCreateDialog}
          onClose={() => setShowCreateDialog(false)}
        />
      )}
    </div>
  )
}

// --- Create Freezer Dialog ---

function CreateFreezerDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const createFreezer = useCreateFreezer()
  const [name, setName] = useState('')
  const [freezerType, setFreezerType] = useState<FreezerType>('minus_80')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    await createFreezer.mutateAsync({
      name: name.trim(),
      freezer_type: freezerType,
      location: location.trim() || undefined,
      notes: notes.trim() || undefined,
    })
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent onClose={onClose} className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Freezer</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="freezer-name">Name</Label>
            <Input
              id="freezer-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Freezer A-1"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="freezer-type">Type</Label>
            <select
              id="freezer-type"
              value={freezerType}
              onChange={(e) => setFreezerType(e.target.value as FreezerType)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {ALL_FREEZER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {FREEZER_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="freezer-location">Location</Label>
            <Input
              id="freezer-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Lab Room 201"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="freezer-notes">Notes</Label>
            <Input
              id="freezer-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes..."
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createFreezer.isPending || !name.trim()}>
              {createFreezer.isPending ? 'Creating...' : 'Create Freezer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
