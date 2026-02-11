import { useState, useMemo, Fragment } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { usePlates, useCreatePlate, useRuns, useQCTemplates } from '@/api/instruments'
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
import type { Plate } from '@/types'
import {
  Plus,
  Grid3X3,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from 'lucide-react'

const PER_PAGE = 20

// Well color logic for the preview grid
const WELL_COLORS = {
  empty: { bg: 'bg-muted/40', border: 'border-border/60 border-dashed', text: '' },
  sample: { bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-700' },
  qc: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
}

function PlatePreviewCard({ plate, onClick }: { plate: Plate; onClick: () => void }) {
  const [expanded, setExpanded] = useState(false)

  const totalWells = plate.rows * plate.columns

  // Build row labels (A, B, C, ...) and column numbers (1, 2, 3, ...)
  const rowLabels = Array.from({ length: Math.min(plate.rows, 16) }, (_, i) =>
    String.fromCharCode(65 + i)
  )
  const colLabels = Array.from({ length: Math.min(plate.columns, 24) }, (_, i) => i + 1)

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      {/* Plate header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/60">
        <div className="flex items-center gap-3 min-w-0">
          <div className="rounded-lg bg-primary/5 p-2">
            <Grid3X3 className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground text-sm truncate">
              {plate.plate_name}
            </h3>
            <p className="text-xs text-muted-foreground">
              {plate.rows} x {plate.columns} ({totalWells} wells)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {plate.run_id && (
            <Badge variant="secondary" className="text-[10px]">Linked</Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(!expanded)
            }}
            className="h-7 w-7 p-0"
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClick}
            className="h-7 w-7 p-0"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Expandable grid preview */}
      {expanded && (
        <div className="p-4 bg-muted/10 overflow-x-auto">
          <div
            className="inline-grid gap-0"
            style={{
              gridTemplateColumns: `1.5rem repeat(${colLabels.length}, minmax(0, 1fr))`,
              gridTemplateRows: `1.5rem repeat(${rowLabels.length}, minmax(0, 1fr))`,
              minWidth: `${1.5 + colLabels.length * 2}rem`,
            }}
          >
            {/* Corner */}
            <div />

            {/* Column headers */}
            {colLabels.map((n) => (
              <div
                key={`col-${n}`}
                className="flex items-center justify-center text-[8px] font-bold text-muted-foreground tabular-nums"
              >
                {n}
              </div>
            ))}

            {/* Rows */}
            {rowLabels.map((letter, ri) => (
              <Fragment key={`row-${ri}`}>
                <div
                  className="flex items-center justify-center text-[8px] font-bold text-muted-foreground"
                >
                  {letter}
                </div>
                {colLabels.map((_, ci) => (
                  <div
                    key={`cell-${ri}-${ci}`}
                    className={cn(
                      'h-5 w-5 m-[1px] rounded-full border',
                      WELL_COLORS.empty.bg,
                      WELL_COLORS.empty.border,
                    )}
                  />
                ))}
              </Fragment>
            ))}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className={cn('h-3 w-3 rounded-full border', WELL_COLORS.empty.bg, WELL_COLORS.empty.border)} />
              <span className="text-[10px] text-muted-foreground">Empty</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className={cn('h-3 w-3 rounded-full border', WELL_COLORS.sample.bg, WELL_COLORS.sample.border)} />
              <span className="text-[10px] text-muted-foreground">Sample</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className={cn('h-3 w-3 rounded-full border', WELL_COLORS.qc.bg, WELL_COLORS.qc.border)} />
              <span className="text-[10px] text-muted-foreground">QC</span>
            </div>
          </div>
        </div>
      )}

      {/* Footer meta */}
      <div className="flex items-center justify-between px-5 py-2.5 bg-muted/20 border-t border-border/40 text-xs text-muted-foreground">
        <span>
          Created {new Date(plate.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
        <button
          onClick={onClick}
          className="text-primary hover:underline font-medium cursor-pointer"
        >
          View Details
        </button>
      </div>
    </div>
  )
}

export function PlateDesignerPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { hasRole } = useAuth()

  const page = parseInt(searchParams.get('page') ?? '1', 10)
  const runFilter = searchParams.get('run_id') ?? ''

  const queryParams = useMemo(() => ({
    page,
    per_page: PER_PAGE,
    run_id: runFilter || undefined,
  }), [page, runFilter])

  const { data, isLoading, isError } = usePlates(queryParams)

  const totalPages = data?.meta
    ? Math.ceil(data.meta.total / data.meta.per_page)
    : 0

  const canCreate = hasRole('super_admin', 'lab_manager', 'lab_technician')
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  const plates = data?.data ?? []

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Plates</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.meta.total != null
              ? `${data.meta.total} plate${data.meta.total !== 1 ? 's' : ''}`
              : 'Loading...'}
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4" />
            Create Plate
          </Button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <PageSpinner />
      ) : isError ? (
        <div className="rounded-lg border border-danger/20 bg-danger/5 p-8 text-center">
          <p className="text-sm text-danger">Failed to load plates. Please try again.</p>
        </div>
      ) : plates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Grid3X3 className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-foreground">No plates found</p>
          <p className="text-xs text-muted-foreground mt-1">
            {runFilter
              ? 'No plates linked to this run.'
              : 'No plates have been created yet.'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {plates.map((plate) => (
              <PlatePreviewCard
                key={plate.id}
                plate={plate}
                onClick={() => navigate(`/instruments/plates/${plate.id}`)}
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
                  onClick={() => setSearchParams({ ...Object.fromEntries(searchParams), page: String(page - 1) })}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setSearchParams({ ...Object.fromEntries(searchParams), page: String(page + 1) })}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create Plate Dialog */}
      {showCreateDialog && (
        <CreatePlateDialog
          open={showCreateDialog}
          onClose={() => setShowCreateDialog(false)}
        />
      )}
    </div>
  )
}

// --- Create Plate Dialog ---

function CreatePlateDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const createPlate = useCreatePlate()
  const { data: runsData } = useRuns({ per_page: 50 })
  const { data: templates } = useQCTemplates()

  const [plateName, setPlateName] = useState('')
  const [runId, setRunId] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [rows, setRows] = useState(8)
  const [columns, setColumns] = useState(12)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!plateName.trim()) return

    await createPlate.mutateAsync({
      plate_name: plateName.trim(),
      run_id: runId || undefined,
      qc_template_id: templateId || undefined,
      rows,
      columns,
    })
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent onClose={onClose} className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Plate</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="plate-name">Plate Name</Label>
            <Input
              id="plate-name"
              value={plateName}
              onChange={(e) => setPlateName(e.target.value)}
              placeholder="e.g. Plate-2026-001"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="plate-rows">Rows</Label>
              <Input
                id="plate-rows"
                type="number"
                min={1}
                max={32}
                value={rows}
                onChange={(e) => setRows(parseInt(e.target.value, 10) || 8)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plate-cols">Columns</Label>
              <Input
                id="plate-cols"
                type="number"
                min={1}
                max={48}
                value={columns}
                onChange={(e) => setColumns(parseInt(e.target.value, 10) || 12)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="plate-run">Link to Run (optional)</Label>
            <select
              id="plate-run"
              value={runId}
              onChange={(e) => setRunId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">None</option>
              {(runsData?.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.run_name || r.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="plate-template">QC Template (optional)</Label>
            <select
              id="plate-template"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">None</option>
              {(templates ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Preview */}
          <div className="rounded-lg bg-muted/30 p-3 text-center">
            <span className="text-xs text-muted-foreground">
              {rows} x {columns} = {rows * columns} wells
            </span>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createPlate.isPending || !plateName.trim()}>
              {createPlate.isPending ? 'Creating...' : 'Create Plate'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
