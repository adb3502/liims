import { useState, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usePlateDetail, useAssignWells } from '@/api/instruments'
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
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { PlateWell } from '@/types'
import {
  ArrowLeft,
  Grid3X3,
  Info,
  Pipette,
  Plus,
  X,
} from 'lucide-react'

// Well type classification
type WellType = 'empty' | 'sample' | 'qc'

const WELL_STYLE: Record<WellType, { bg: string; border: string; ring: string; label: string }> = {
  empty: {
    bg: 'bg-slate-100 dark:bg-slate-800/50',
    border: 'border-slate-200/80 dark:border-slate-700/60',
    ring: 'ring-slate-300',
    label: 'Empty',
  },
  sample: {
    bg: 'bg-sky-100 dark:bg-sky-900/40',
    border: 'border-sky-300 dark:border-sky-700',
    ring: 'ring-sky-400',
    label: 'Sample',
  },
  qc: {
    bg: 'bg-amber-100 dark:bg-amber-900/40',
    border: 'border-amber-300 dark:border-amber-700',
    ring: 'ring-amber-400',
    label: 'QC',
  },
}

function classifyWell(well: PlateWell | undefined): WellType {
  if (!well) return 'empty'
  if (well.is_qc_sample) return 'qc'
  return 'sample'
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '---'
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function PlateDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { hasRole } = useAuth()

  const { data: plate, isLoading, isError } = usePlateDetail(id!)

  const [selectedWell, setSelectedWell] = useState<string | null>(null)
  const [showAssignDialog, setShowAssignDialog] = useState(false)

  const canManage = hasRole('super_admin', 'lab_manager', 'lab_technician')

  // Build a map: well_position -> PlateWell
  const wellMap = useMemo(() => {
    const m = new Map<string, PlateWell>()
    if (!plate?.wells) return m
    for (const w of plate.wells) {
      if (w.well_position) {
        m.set(w.well_position, w)
      }
    }
    return m
  }, [plate?.wells])

  // Row labels (A-H for 8 rows, extends for larger plates)
  const rowLabels = useMemo(() => {
    if (!plate) return []
    return Array.from({ length: plate.rows }, (_, i) =>
      String.fromCharCode(65 + i)
    )
  }, [plate])

  // Column labels (1-12 for 96-well, etc.)
  const colLabels = useMemo(() => {
    if (!plate) return []
    return Array.from({ length: plate.columns }, (_, i) => i + 1)
  }, [plate])

  // Well statistics
  const stats = useMemo(() => {
    const total = (plate?.rows ?? 0) * (plate?.columns ?? 0)
    let samples = 0
    let qcs = 0
    for (const w of plate?.wells ?? []) {
      if (w.is_qc_sample) qcs++
      else samples++
    }
    return { total, samples, qcs, empty: total - samples - qcs }
  }, [plate])

  // Get the well info for the selected position
  const selectedWellData = selectedWell ? wellMap.get(selectedWell) : undefined
  const selectedWellType = classifyWell(selectedWellData)

  const handleWellClick = useCallback((position: string) => {
    setSelectedWell((prev) => (prev === position ? null : position))
  }, [])

  if (isLoading) return <PageSpinner />

  if (isError || !plate) {
    return (
      <div className="rounded-lg border border-danger/20 bg-danger/5 p-8 text-center">
        <p className="text-sm text-danger">Failed to load plate details.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/instruments/plates')}>
          Back to Plates
        </Button>
      </div>
    )
  }

  return (
    <div>
      {/* Back nav */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-primary/5 p-3">
            <Grid3X3 className="h-7 w-7 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-foreground">
                {plate.plate_name}
              </h1>
              <Badge variant="secondary">
                {plate.rows} x {plate.columns}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {stats.total} wells
              {plate.run_id && ' \u00b7 Linked to run'}
              {' \u00b7 Created '}
              {formatDate(plate.created_at)}
            </p>
          </div>
        </div>

        {canManage && (
          <Button onClick={() => setShowAssignDialog(true)}>
            <Pipette className="h-4 w-4" />
            Assign Wells
          </Button>
        )}
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Wells" value={stats.total} />
        <StatCard label="Samples" value={stats.samples} color="sky" />
        <StatCard label="QC Wells" value={stats.qcs} color="amber" />
        <StatCard label="Empty" value={stats.empty} color="slate" />
      </div>

      {/* Plate grid + well inspector side-by-side */}
      <div className="flex flex-col xl:flex-row gap-6">
        {/* Well plate grid */}
        <div className="flex-1 rounded-xl border border-border bg-card overflow-hidden">
          <div className="bg-muted/30 px-5 py-3 border-b border-border/60 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Grid3X3 className="h-4 w-4 text-muted-foreground" />
              Well Map
            </div>
            {/* Legend */}
            <div className="flex items-center gap-3">
              {(['empty', 'sample', 'qc'] as WellType[]).map((t) => (
                <div key={t} className="flex items-center gap-1.5">
                  <div
                    className={cn(
                      'h-3 w-3 rounded-full border',
                      WELL_STYLE[t].bg,
                      WELL_STYLE[t].border,
                    )}
                  />
                  <span className="text-[10px] text-muted-foreground font-medium">
                    {WELL_STYLE[t].label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 overflow-x-auto">
            <div
              className="inline-grid gap-0"
              style={{
                gridTemplateColumns: `2rem repeat(${colLabels.length}, minmax(0, 1fr))`,
                gridTemplateRows: `1.75rem repeat(${rowLabels.length}, minmax(0, 1fr))`,
                minWidth: `${2 + colLabels.length * 2.25}rem`,
              }}
            >
              {/* Corner cell */}
              <div />

              {/* Column headers */}
              {colLabels.map((n) => (
                <div
                  key={`col-${n}`}
                  className="flex items-center justify-center text-[10px] font-bold text-muted-foreground tabular-nums"
                >
                  {n}
                </div>
              ))}

              {/* Rows */}
              {rowLabels.map((letter, ri) => (
                <WellRow
                  key={`row-${ri}`}
                  rowLabel={letter}
                  colLabels={colLabels}
                  wellMap={wellMap}
                  selectedWell={selectedWell}
                  onWellClick={handleWellClick}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Well Inspector panel */}
        <div className="xl:w-72 flex-shrink-0">
          <div className="rounded-xl border border-border bg-card overflow-hidden sticky top-4">
            <div className="bg-muted/30 px-4 py-3 border-b border-border/60">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Info className="h-4 w-4 text-muted-foreground" />
                Well Inspector
              </div>
            </div>

            {selectedWell ? (
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'h-8 w-8 rounded-full border-2 flex items-center justify-center text-xs font-bold',
                      WELL_STYLE[selectedWellType].bg,
                      WELL_STYLE[selectedWellType].border,
                    )}
                  >
                    {selectedWell}
                  </div>
                  <div>
                    <div className="font-mono text-sm font-semibold text-foreground">
                      {selectedWell}
                    </div>
                    <Badge
                      variant={
                        selectedWellType === 'qc'
                          ? 'warning'
                          : selectedWellType === 'sample'
                            ? 'default'
                            : 'secondary'
                      }
                      className="text-[10px] mt-0.5"
                    >
                      {WELL_STYLE[selectedWellType].label}
                    </Badge>
                  </div>
                </div>

                {selectedWellData ? (
                  <div className="space-y-2 pt-2 border-t border-border/60">
                    <DetailRow label="Sample" value={selectedWellData.sample_code ?? selectedWellData.sample_id.slice(0, 10)} mono />
                    <DetailRow label="Plate #" value={String(selectedWellData.plate_number)} />
                    {selectedWellData.is_qc_sample && (
                      <DetailRow label="QC Type" value={selectedWellData.qc_type ?? 'QC'} />
                    )}
                    {selectedWellData.injection_volume_ul != null && (
                      <DetailRow label="Injection Vol" value={`${selectedWellData.injection_volume_ul} uL`} />
                    )}
                    {selectedWellData.volume_withdrawn_ul != null && (
                      <DetailRow label="Withdrawn" value={`${selectedWellData.volume_withdrawn_ul} uL`} />
                    )}
                    <DetailRow label="Order" value={selectedWellData.sample_order != null ? String(selectedWellData.sample_order) : '---'} />
                  </div>
                ) : (
                  <div className="pt-2 border-t border-border/60">
                    <p className="text-xs text-muted-foreground italic">
                      No sample assigned to this well.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 text-center">
                <Grid3X3 className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-xs text-muted-foreground">
                  Click a well to inspect its contents
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Assign Wells Dialog */}
      {showAssignDialog && (
        <AssignWellsDialog
          open={showAssignDialog}
          onClose={() => setShowAssignDialog(false)}
          plateId={id!}
        />
      )}
    </div>
  )
}

// --- Well Row ---

function WellRow({
  rowLabel,
  colLabels,
  wellMap,
  selectedWell,
  onWellClick,
}: {
  rowLabel: string
  colLabels: number[]
  wellMap: Map<string, PlateWell>
  selectedWell: string | null
  onWellClick: (position: string) => void
}) {
  return (
    <>
      {/* Row label */}
      <div className="flex items-center justify-center text-[10px] font-bold text-muted-foreground">
        {rowLabel}
      </div>

      {/* Wells */}
      {colLabels.map((col) => {
        const position = `${rowLabel}${col}`
        const well = wellMap.get(position)
        const wtype = classifyWell(well)
        const style = WELL_STYLE[wtype]
        const isSelected = selectedWell === position

        return (
          <button
            key={position}
            onClick={() => onWellClick(position)}
            title={
              well
                ? `${position}: ${well.sample_code ?? well.sample_id.slice(0, 8)}${well.is_qc_sample ? ' (QC)' : ''}`
                : `${position}: Empty`
            }
            className={cn(
              'h-6 w-6 m-[2px] rounded-full border transition-all duration-150 cursor-pointer',
              'hover:scale-110 hover:shadow-sm',
              style.bg,
              style.border,
              isSelected && `ring-2 ${style.ring} scale-110 shadow-md`,
              wtype === 'empty' && 'border-dashed',
            )}
          />
        )
      })}
    </>
  )
}

// --- Stat Card ---

function StatCard({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color?: 'sky' | 'amber' | 'slate'
}) {
  const colorClasses = {
    sky: 'text-sky-600 dark:text-sky-400',
    amber: 'text-amber-600 dark:text-amber-400',
    slate: 'text-muted-foreground',
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground font-medium mb-1">{label}</div>
      <div className={cn('text-lg font-bold tabular-nums', color ? colorClasses[color] : 'text-foreground')}>
        {value}
      </div>
    </div>
  )
}

// --- Detail Row ---

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('font-medium text-foreground', mono && 'font-mono text-primary')}>
        {value}
      </span>
    </div>
  )
}

// --- Assign Wells Dialog ---

function AssignWellsDialog({
  open,
  onClose,
  plateId,
}: {
  open: boolean
  onClose: () => void
  plateId: string
}) {
  const assignMutation = useAssignWells(plateId)
  const [assignments, setAssignments] = useState<
    Array<{ sample_id: string; well_position: string; is_qc_sample: boolean; qc_type: string }>
  >([{ sample_id: '', well_position: '', is_qc_sample: false, qc_type: '' }])

  function addRow() {
    setAssignments((prev) => [
      ...prev,
      { sample_id: '', well_position: '', is_qc_sample: false, qc_type: '' },
    ])
  }

  function removeRow(index: number) {
    setAssignments((prev) => prev.filter((_, i) => i !== index))
  }

  function updateRow(index: number, field: string, value: string | boolean) {
    setAssignments((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const valid = assignments.filter((a) => a.sample_id.trim() && a.well_position.trim())
    if (valid.length === 0) return

    await assignMutation.mutateAsync(
      valid.map((a) => ({
        sample_id: a.sample_id.trim(),
        well_position: a.well_position.trim().toUpperCase(),
        is_qc_sample: a.is_qc_sample || undefined,
        qc_type: a.qc_type.trim() || undefined,
      }))
    )
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent onClose={onClose} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign Wells</DialogTitle>
          <DialogDescription>
            Assign samples to well positions. Use format like A1, B3, H12.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {assignments.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  placeholder="Well (e.g. A1)"
                  value={row.well_position}
                  onChange={(e) => updateRow(i, 'well_position', e.target.value)}
                  className="w-24 font-mono text-xs"
                />
                <Input
                  placeholder="Sample ID"
                  value={row.sample_id}
                  onChange={(e) => updateRow(i, 'sample_id', e.target.value)}
                  className="flex-1 font-mono text-xs"
                />
                <label className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={row.is_qc_sample}
                    onChange={(e) => updateRow(i, 'is_qc_sample', e.target.checked)}
                    className="rounded"
                  />
                  QC
                </label>
                {assignments.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="text-muted-foreground hover:text-destructive transition-colors p-1"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <Button type="button" variant="outline" size="sm" onClick={addRow} className="w-full">
            <Plus className="h-3.5 w-3.5" />
            Add Row
          </Button>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                assignMutation.isPending ||
                !assignments.some((a) => a.sample_id.trim() && a.well_position.trim())
              }
            >
              {assignMutation.isPending ? 'Assigning...' : 'Assign Wells'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
