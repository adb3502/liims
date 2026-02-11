import { useState, useMemo, Fragment } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  useBoxDetail,
  useAssignSample,
  useUnassignSample,
  type PositionRead,
} from '@/api/storage'
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
import type { SampleType } from '@/types'
import {
  ArrowLeft,
  Grid3X3,
  ExternalLink,
} from 'lucide-react'

const BOX_TYPE_LABELS: Record<string, string> = {
  cryo_81: 'Cryo 81',
  cryo_100: 'Cryo 100',
  abdos_81: 'Abdos 81',
  custom: 'Custom',
}

// Color palette for sample types shown in grid cells.
// We parse the sample_code prefix to infer the type.
const SAMPLE_TYPE_FROM_CODE: Record<string, SampleType> = {
  PLM: 'plasma',
  EPI: 'epigenetics',
  EXT: 'extra_blood',
  RBC: 'rbc_smear',
  CHK: 'cheek_swab',
  HAR: 'hair',
  URN: 'urine',
  STL: 'stool_kit',
}

const SAMPLE_TYPE_CELL_COLORS: Record<SampleType, { bg: string; border: string; text: string }> = {
  plasma: { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700' },
  epigenetics: { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700' },
  extra_blood: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' },
  rbc_smear: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700' },
  cheek_swab: { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700' },
  hair: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
  urine: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700' },
  stool_kit: { bg: 'bg-lime-50', border: 'border-lime-200', text: 'text-lime-700' },
}

const SAMPLE_TYPE_LABELS: Record<SampleType, string> = {
  plasma: 'Plasma',
  epigenetics: 'Epigenetics',
  extra_blood: 'Extra Blood',
  rbc_smear: 'RBC Smear',
  cheek_swab: 'Cheek Swab',
  hair: 'Hair',
  urine: 'Urine',
  stool_kit: 'Stool Kit',
}

function inferSampleType(code: string | null): SampleType | null {
  if (!code) return null
  // Sample codes typically have format like GRP-PLM-001-01
  const parts = code.split('-')
  for (const part of parts) {
    const match = SAMPLE_TYPE_FROM_CODE[part.toUpperCase()]
    if (match) return match
  }
  return null
}

function getCellColors(code: string | null): { bg: string; border: string; text: string } {
  const type = inferSampleType(code)
  if (type && SAMPLE_TYPE_CELL_COLORS[type]) {
    return SAMPLE_TYPE_CELL_COLORS[type]
  }
  // Default occupied color
  return { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' }
}

export function BoxDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { hasRole } = useAuth()
  const [selectedPosition, setSelectedPosition] = useState<PositionRead | null>(null)
  const [showAssignDialog, setShowAssignDialog] = useState(false)
  const [showUnassignDialog, setShowUnassignDialog] = useState(false)

  const { data: box, isLoading, isError } = useBoxDetail(id ?? '')
  const canWrite = hasRole('super_admin', 'lab_manager', 'lab_technician')

  // Build the grid map: [row][col] -> position
  const grid = useMemo(() => {
    if (!box) return []
    const g: (PositionRead | null)[][] = Array.from({ length: box.rows }, () =>
      Array.from({ length: box.columns }, () => null)
    )
    for (const pos of box.positions) {
      if (pos.row >= 1 && pos.row <= box.rows && pos.column >= 1 && pos.column <= box.columns) {
        g[pos.row - 1][pos.column - 1] = pos
      }
    }
    return g
  }, [box])

  // Collect unique sample types present in the box for the legend
  const presentTypes = useMemo(() => {
    if (!box) return new Map<SampleType, number>()
    const counts = new Map<SampleType, number>()
    for (const pos of box.positions) {
      if (pos.sample_id) {
        const type = inferSampleType(pos.sample_code)
        if (type) {
          counts.set(type, (counts.get(type) ?? 0) + 1)
        }
      }
    }
    return counts
  }, [box])

  if (isLoading) return <PageSpinner />

  if (isError || !box) {
    return (
      <div className="rounded-lg border border-danger/20 bg-danger/5 p-8 text-center">
        <p className="text-sm text-danger">Failed to load box details.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/storage/freezers')}>
          Back to Freezers
        </Button>
      </div>
    )
  }

  const occupiedCount = box.positions.filter((p) => p.sample_id).length
  const totalSlots = box.rows * box.columns
  const pct = totalSlots > 0 ? Math.round((occupiedCount / totalSlots) * 100) : 0

  function handleCellClick(pos: PositionRead | null, row: number, col: number) {
    if (!pos) return
    if (pos.sample_id) {
      // Occupied -- show options (navigate to sample or unassign)
      setSelectedPosition(pos)
      setShowUnassignDialog(true)
    } else if (canWrite) {
      // Empty -- open assign dialog
      setSelectedPosition(pos)
      setShowAssignDialog(true)
    }
  }

  // Column headers: A, B, C, ...
  const colHeaders = Array.from({ length: box.columns }, (_, i) =>
    String.fromCharCode(65 + i)
  )

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
              <h1 className="text-2xl font-bold text-foreground">{box.box_name}</h1>
              <Badge variant="secondary" className="text-[10px] font-bold uppercase tracking-wider">
                {BOX_TYPE_LABELS[box.box_type] ?? box.box_type}
              </Badge>
              {box.group_code && (
                <span className="font-mono text-xs font-medium text-primary bg-primary/5 px-2 py-0.5 rounded-md">
                  {box.group_code}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {box.rows} &times; {box.columns} grid &middot; {occupiedCount}/{totalSlots} occupied ({pct}%)
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="rounded-lg border border-border bg-card p-4 text-center">
          <div className="text-2xl font-bold text-foreground tabular-nums">{totalSlots}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Total Slots</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 text-center">
          <div className="text-2xl font-bold text-primary tabular-nums">{occupiedCount}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Occupied</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 text-center">
          <div className="text-2xl font-bold text-emerald-600 tabular-nums">{totalSlots - occupiedCount}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Available</div>
        </div>
      </div>

      {/* Grid View */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="bg-muted/30 px-5 py-3 border-b border-border/60 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Grid3X3 className="h-4 w-4 text-muted-foreground" />
            Box Grid
          </div>
          <div className="text-xs text-muted-foreground">
            Click a cell to {canWrite ? 'assign/view' : 'view'} samples
          </div>
        </div>

        <div className="p-5 overflow-x-auto">
          <div
            className="inline-grid gap-0"
            style={{
              gridTemplateColumns: `2.5rem repeat(${box.columns}, minmax(0, 1fr))`,
              gridTemplateRows: `2rem repeat(${box.rows}, minmax(0, 1fr))`,
              minWidth: `${2.5 + box.columns * 4}rem`,
            }}
          >
            {/* Top-left corner */}
            <div />

            {/* Column headers */}
            {colHeaders.map((letter, ci) => (
              <div
                key={`ch-${ci}`}
                className="flex items-center justify-center text-[10px] font-bold text-muted-foreground uppercase tracking-wider"
              >
                {letter}
              </div>
            ))}

            {/* Rows */}
            {grid.map((row, ri) => (
              <Fragment key={`row-${ri}`}>
                {/* Row header */}
                <div
                  className="flex items-center justify-center text-[10px] font-bold text-muted-foreground tabular-nums"
                >
                  {ri + 1}
                </div>

                {/* Cells */}
                {row.map((pos, ci) => {
                  const isOccupied = pos?.sample_id != null
                  const cellColors = isOccupied ? getCellColors(pos?.sample_code ?? null) : null

                  return (
                    <button
                      key={`cell-${ri}-${ci}`}
                      onClick={() => handleCellClick(pos, ri, ci)}
                      disabled={!pos}
                      title={
                        isOccupied
                          ? `${pos!.sample_code ?? 'Sample'} at ${String.fromCharCode(65 + ci)}${ri + 1}`
                          : pos
                            ? `Empty: ${String.fromCharCode(65 + ci)}${ri + 1}`
                            : undefined
                      }
                      className={cn(
                        'relative m-[1px] flex items-center justify-center rounded-[3px] transition-all duration-100',
                        'h-10 w-16 min-w-[3rem]',
                        !pos && 'bg-muted/20 cursor-default',
                        pos && !isOccupied && 'bg-muted/40 border border-dashed border-border/60 hover:bg-muted hover:border-primary/30 cursor-pointer',
                        pos && isOccupied && cn(
                          'border cursor-pointer',
                          cellColors!.bg,
                          cellColors!.border,
                          'hover:shadow-sm hover:scale-[1.03]',
                        ),
                      )}
                    >
                      {isOccupied && pos?.sample_code && (
                        <span className={cn(
                          'font-mono text-[9px] leading-none font-semibold truncate px-0.5',
                          cellColors!.text,
                        )}>
                          {pos.sample_code.length > 10
                            ? pos.sample_code.slice(-8)
                            : pos.sample_code}
                        </span>
                      )}
                    </button>
                  )
                })}
              </Fragment>
            ))}
          </div>
        </div>

        {/* Legend */}
        {presentTypes.size > 0 && (
          <div className="px-5 py-3 border-t border-border/60 bg-muted/20">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-xs text-muted-foreground font-medium">Legend:</span>
              {Array.from(presentTypes.entries()).map(([type, count]) => {
                const colors = SAMPLE_TYPE_CELL_COLORS[type]
                return (
                  <div key={type} className="flex items-center gap-1.5">
                    <div className={cn('h-3 w-3 rounded-sm border', colors.bg, colors.border)} />
                    <span className="text-xs text-muted-foreground">
                      {SAMPLE_TYPE_LABELS[type]} ({count})
                    </span>
                  </div>
                )
              })}
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-sm border border-dashed border-border bg-muted/40" />
                <span className="text-xs text-muted-foreground">Empty</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Assign sample dialog */}
      {showAssignDialog && selectedPosition && (
        <AssignSampleDialog
          position={selectedPosition}
          boxName={box.box_name}
          open={showAssignDialog}
          onClose={() => {
            setShowAssignDialog(false)
            setSelectedPosition(null)
          }}
        />
      )}

      {/* Occupied cell dialog */}
      {showUnassignDialog && selectedPosition && (
        <OccupiedCellDialog
          position={selectedPosition}
          boxName={box.box_name}
          canUnassign={canWrite}
          open={showUnassignDialog}
          onClose={() => {
            setShowUnassignDialog(false)
            setSelectedPosition(null)
          }}
        />
      )}
    </div>
  )
}

// --- Assign Sample Dialog ---

function AssignSampleDialog({
  position,
  boxName,
  open,
  onClose,
}: {
  position: PositionRead
  boxName: string
  open: boolean
  onClose: () => void
}) {
  const assignMutation = useAssignSample(position.id)
  const [sampleId, setSampleId] = useState('')

  const posLabel = `${String.fromCharCode(65 + position.column - 1)}${position.row}`

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!sampleId.trim()) return
    await assignMutation.mutateAsync(sampleId.trim())
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent onClose={onClose} className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Assign Sample</DialogTitle>
          <DialogDescription>
            Position {posLabel} in {boxName}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="sample-id">Sample ID</Label>
            <Input
              id="sample-id"
              value={sampleId}
              onChange={(e) => setSampleId(e.target.value)}
              placeholder="Paste sample UUID"
              className="font-mono text-sm"
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={assignMutation.isPending || !sampleId.trim()}>
              {assignMutation.isPending ? 'Assigning...' : 'Assign'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// --- Occupied Cell Dialog ---

function OccupiedCellDialog({
  position,
  boxName,
  canUnassign,
  open,
  onClose,
}: {
  position: PositionRead
  boxName: string
  canUnassign: boolean
  open: boolean
  onClose: () => void
}) {
  const navigate = useNavigate()
  const unassignMutation = useUnassignSample(position.id)
  const posLabel = `${String.fromCharCode(65 + position.column - 1)}${position.row}`

  async function handleUnassign() {
    await unassignMutation.mutateAsync()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent onClose={onClose} className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Position {posLabel}</DialogTitle>
          <DialogDescription>{boxName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="text-xs text-muted-foreground mb-1">Sample Code</div>
            <div className="font-mono font-semibold text-foreground text-sm">
              {position.sample_code ?? position.sample_id?.slice(0, 12) ?? 'Unknown'}
            </div>
          </div>
          {position.occupied_at && (
            <div className="text-xs text-muted-foreground">
              Stored: {new Date(position.occupied_at).toLocaleString()}
            </div>
          )}
        </div>
        <DialogFooter className="mt-4">
          {position.sample_id && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigate(`/samples/${position.sample_id}`)
                onClose()
              }}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View Sample
            </Button>
          )}
          {canUnassign && (
            <Button
              variant="destructive"
              size="sm"
              disabled={unassignMutation.isPending}
              onClick={handleUnassign}
            >
              {unassignMutation.isPending ? 'Removing...' : 'Remove Sample'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
