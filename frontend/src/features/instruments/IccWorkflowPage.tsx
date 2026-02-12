import { useState, useMemo, useCallback } from 'react'
import {
  useIccSlides,
  useIccSlide,
  useCreateIccSlide,
  useUpdateIccSlide,
  useAdvanceIccStatus,
} from '@/api/instruments'
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
import type { IccSlide, IccSlideCreate, IccStatus } from '@/types'
import { ICC_STATUS_LABELS } from '@/types'
import {
  Plus,
  Search,
  ChevronRight,
  Microscope,
  Pipette,
  FlaskConical,
  ShieldCheck,
  Syringe,
  Droplets,
  Layers,
  Camera,
  CheckCircle2,
  Clock,
  X,
  TestTubes,
  SlidersHorizontal,
  User,
  FileText,
  Save,
} from 'lucide-react'

// --- ICC Status pipeline order ---

const ICC_STAGES: IccStatus[] = [
  'received',
  'fixation',
  'permeabilization',
  'blocking',
  'primary_antibody',
  'secondary_antibody',
  'dapi_staining',
  'mounted',
  'imaging',
  'analysis_complete',
]

// --- Color system: each stage gets a distinctive color inspired by lab chemistry ---

const STAGE_COLORS: Record<
  IccStatus,
  { bg: string; border: string; text: string; badge: string; icon: string; glow: string }
> = {
  received: {
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    text: 'text-slate-700',
    badge: 'bg-slate-100 text-slate-700 border-slate-300',
    icon: 'text-slate-500',
    glow: 'shadow-slate-200/50',
  },
  fixation: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-800',
    badge: 'bg-amber-100 text-amber-800 border-amber-300',
    icon: 'text-amber-600',
    glow: 'shadow-amber-200/50',
  },
  permeabilization: {
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    text: 'text-orange-800',
    badge: 'bg-orange-100 text-orange-800 border-orange-300',
    icon: 'text-orange-600',
    glow: 'shadow-orange-200/50',
  },
  blocking: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    text: 'text-yellow-800',
    badge: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    icon: 'text-yellow-600',
    glow: 'shadow-yellow-200/50',
  },
  primary_antibody: {
    bg: 'bg-violet-50',
    border: 'border-violet-200',
    text: 'text-violet-800',
    badge: 'bg-violet-100 text-violet-800 border-violet-300',
    icon: 'text-violet-600',
    glow: 'shadow-violet-200/50',
  },
  secondary_antibody: {
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    text: 'text-purple-800',
    badge: 'bg-purple-100 text-purple-800 border-purple-300',
    icon: 'text-purple-600',
    glow: 'shadow-purple-200/50',
  },
  dapi_staining: {
    bg: 'bg-cyan-50',
    border: 'border-cyan-200',
    text: 'text-cyan-800',
    badge: 'bg-cyan-100 text-cyan-800 border-cyan-300',
    icon: 'text-cyan-600',
    glow: 'shadow-cyan-200/50',
  },
  mounted: {
    bg: 'bg-teal-50',
    border: 'border-teal-200',
    text: 'text-teal-800',
    badge: 'bg-teal-100 text-teal-800 border-teal-300',
    icon: 'text-teal-600',
    glow: 'shadow-teal-200/50',
  },
  imaging: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-800',
    badge: 'bg-blue-100 text-blue-800 border-blue-300',
    icon: 'text-blue-600',
    glow: 'shadow-blue-200/50',
  },
  analysis_complete: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-800',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    icon: 'text-emerald-600',
    glow: 'shadow-emerald-200/50',
  },
}

const STAGE_ICONS: Record<IccStatus, React.ReactNode> = {
  received: <FlaskConical className="h-4 w-4" />,
  fixation: <Droplets className="h-4 w-4" />,
  permeabilization: <Pipette className="h-4 w-4" />,
  blocking: <ShieldCheck className="h-4 w-4" />,
  primary_antibody: <Syringe className="h-4 w-4" />,
  secondary_antibody: <Syringe className="h-4 w-4" />,
  dapi_staining: <TestTubes className="h-4 w-4" />,
  mounted: <Layers className="h-4 w-4" />,
  imaging: <Camera className="h-4 w-4" />,
  analysis_complete: <CheckCircle2 className="h-4 w-4" />,
}

// --- Helper: time formatting ---

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '---'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '---'
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ============================================================
// Main Page
// ============================================================

export function IccWorkflowPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<IccStatus | ''>('')
  const [createOpen, setCreateOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  // Fetch all ICC slides (large per_page for kanban view)
  const { data, isLoading, isError } = useIccSlides({ per_page: 200 })

  const slides = data?.data ?? []

  // Group slides by status
  const slidesByStatus = useMemo(() => {
    const map: Record<IccStatus, IccSlide[]> = {} as Record<IccStatus, IccSlide[]>
    for (const stage of ICC_STAGES) {
      map[stage] = []
    }
    for (const slide of slides) {
      const lowerSearch = searchQuery.toLowerCase()
      const matchesSearch =
        !searchQuery ||
        (slide.sample_code ?? '').toLowerCase().includes(lowerSearch) ||
        (slide.antibody_panel ?? '').toLowerCase().includes(lowerSearch) ||
        slide.id.toLowerCase().includes(lowerSearch)
      const matchesStatus = !statusFilter || slide.status === statusFilter
      if (matchesSearch && matchesStatus && map[slide.status]) {
        map[slide.status].push(slide)
      }
    }
    return map
  }, [slides, searchQuery, statusFilter])

  // Summary stats
  const totalSlides = slides.length
  const activeSlides = slides.filter(
    (s) => s.status !== 'analysis_complete'
  ).length

  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="shrink-0 mb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-gradient-primary text-white">
              <Microscope className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">
                ICC Workflow
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Immunocytochemistry processing pipeline
              </p>
            </div>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New ICC Processing
          </Button>
        </div>

        {/* Summary Stats Bar */}
        <div className="mt-4 flex items-center gap-6 text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <FlaskConical className="h-3.5 w-3.5" />
            <span className="font-medium text-foreground">{totalSlides}</span>
            <span>total</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span className="font-medium text-foreground">{activeSlides}</span>
            <span>in progress</span>
          </div>
          <div className="h-4 w-px bg-border" />
          {/* Per-stage counts (compact) */}
          <div className="flex items-center gap-2 overflow-x-auto">
            {ICC_STAGES.map((stage) => {
              const count = slidesByStatus[stage]?.length ?? 0
              if (count === 0) return null
              const colors = STAGE_COLORS[stage]
              return (
                <button
                  key={stage}
                  onClick={() =>
                    setStatusFilter(statusFilter === stage ? '' : stage)
                  }
                  className={cn(
                    'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-all cursor-pointer',
                    colors.badge,
                    statusFilter === stage && 'ring-2 ring-offset-1 ring-primary/30'
                  )}
                >
                  <span className={colors.icon}>{STAGE_ICONS[stage]}</span>
                  <span>{count}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Filter Bar */}
        <div className="mt-4 flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by sample code or panel..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 font-mono text-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as IccStatus | '')}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All Stages</option>
            {ICC_STAGES.map((s) => (
              <option key={s} value={s}>
                {ICC_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          {(searchQuery || statusFilter) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery('')
                setStatusFilter('')
              }}
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Kanban Board */}
      {isLoading ? (
        <PageSpinner />
      ) : isError ? (
        <div className="rounded-lg border border-danger/20 bg-danger/5 p-8 text-center">
          <p className="text-sm text-danger">
            Failed to load ICC records. Please try again.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto pb-4">
          <div className="flex gap-3 min-w-max h-full">
            {ICC_STAGES.map((stage) => (
              <KanbanColumn
                key={stage}
                stage={stage}
                slides={slidesByStatus[stage]}
                onCardClick={(id) => setDetailId(id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Create Dialog */}
      <CreateIccDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      {/* Detail Drawer */}
      {detailId && (
        <IccDetailDrawer
          slideId={detailId}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  )
}

// ============================================================
// Kanban Column
// ============================================================

function KanbanColumn({
  stage,
  slides,
  onCardClick,
}: {
  stage: IccStatus
  slides: IccSlide[]
  onCardClick: (id: string) => void
}) {
  const colors = STAGE_COLORS[stage]
  const count = slides.length
  const isTerminal = stage === 'analysis_complete'

  return (
    <div
      className={cn(
        'flex flex-col w-[260px] shrink-0 rounded-xl border',
        colors.border,
        colors.bg
      )}
    >
      {/* Column Header */}
      <div className="sticky top-0 z-10 p-3 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={cn('flex items-center justify-center h-6 w-6 rounded-md', colors.badge)}>
              <span className={colors.icon}>{STAGE_ICONS[stage]}</span>
            </span>
            <span className={cn('text-xs font-bold uppercase tracking-wider', colors.text)}>
              {ICC_STATUS_LABELS[stage]}
            </span>
          </div>
          <span
            className={cn(
              'text-xs font-bold tabular-nums min-w-[22px] h-[22px] flex items-center justify-center rounded-full',
              count > 0 ? colors.badge : 'bg-transparent text-muted-foreground'
            )}
          >
            {count}
          </span>
        </div>
        {/* Thin accent line under header */}
        <div
          className={cn(
            'h-0.5 rounded-full mt-2',
            isTerminal
              ? 'bg-gradient-to-r from-emerald-300 to-emerald-500'
              : `bg-gradient-to-r from-transparent via-current to-transparent opacity-20`,
            colors.text
          )}
        />
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-2 pt-0 space-y-2 min-h-[120px]">
        {slides.length === 0 ? (
          <div className="flex items-center justify-center h-full min-h-[80px]">
            <p className="text-[10px] text-muted-foreground/50 uppercase tracking-widest">
              Empty
            </p>
          </div>
        ) : (
          slides.map((slide, i) => (
            <SlideCard
              key={slide.id}
              slide={slide}
              onClick={() => onCardClick(slide.id)}
              index={i}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ============================================================
// Slide Card
// ============================================================

function SlideCard({
  slide,
  onClick,
  index,
}: {
  slide: IccSlide
  onClick: () => void
  index: number
}) {
  const advanceMutation = useAdvanceIccStatus(slide.id)
  const isTerminal = slide.status === 'analysis_complete'
  const colors = STAGE_COLORS[slide.status]

  const handleAdvance = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      advanceMutation.mutate()
    },
    [advanceMutation]
  )

  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative rounded-lg border bg-white p-3 cursor-pointer',
        'transition-all duration-200 ease-out',
        'hover:shadow-md hover:-translate-y-0.5',
        colors.border,
        `hover:${colors.glow}`
      )}
      style={{
        animationDelay: `${index * 40}ms`,
        animation: 'fadeIn 0.2s ease-out both',
      }}
    >
      {/* Sample code + panel */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-sm font-bold text-foreground truncate">
            {slide.sample_code ?? slide.sample_id.slice(0, 8)}
          </p>
          {slide.antibody_panel && (
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
              {slide.antibody_panel}
            </p>
          )}
        </div>
        {!isTerminal && (
          <button
            onClick={handleAdvance}
            disabled={advanceMutation.isPending}
            className={cn(
              'shrink-0 flex items-center justify-center h-6 w-6 rounded-md',
              'border transition-all cursor-pointer',
              'opacity-0 group-hover:opacity-100',
              'hover:bg-primary hover:text-white hover:border-primary',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              colors.border,
              colors.text
            )}
            title="Advance to next stage"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
        {slide.fixation_reagent && (
          <span className="flex items-center gap-0.5 truncate">
            <Layers className="h-2.5 w-2.5" />
            {slide.fixation_reagent}
          </span>
        )}
        <span className="flex items-center gap-0.5">
          <Clock className="h-2.5 w-2.5" />
          {timeAgo(slide.updated_at)}
        </span>
      </div>

      {/* Advance loading indicator */}
      {advanceMutation.isPending && (
        <div className="absolute inset-0 rounded-lg bg-white/80 flex items-center justify-center">
          <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}

// ============================================================
// Create ICC Dialog
// ============================================================

function CreateIccDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const createMutation = useCreateIccSlide()
  const [form, setForm] = useState<IccSlideCreate>({
    sample_id: '',
    fixation_reagent: '',
    antibody_panel: '',
    secondary_antibody: '',
    notes: '',
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.sample_id.trim()) return
    createMutation.mutate(form, {
      onSuccess: () => {
        onOpenChange(false)
        setForm({ sample_id: '', fixation_reagent: '', antibody_panel: '', secondary_antibody: '', notes: '' })
      },
    })
  }

  const updateField = (field: keyof IccSlideCreate, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)} className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Microscope className="h-5 w-5 text-primary" />
            New ICC Processing
          </DialogTitle>
          <DialogDescription>
            Start immunocytochemistry processing for a sample. The slide will
            begin at the "Received" stage.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div>
            <Label htmlFor="sample_id">Sample ID *</Label>
            <Input
              id="sample_id"
              value={form.sample_id}
              onChange={(e) => updateField('sample_id', e.target.value)}
              placeholder="Enter sample UUID..."
              className="mt-1 font-mono"
              required
            />
          </div>

          <div>
            <Label htmlFor="fixation_reagent">Fixation Reagent</Label>
            <Input
              id="fixation_reagent"
              value={form.fixation_reagent ?? ''}
              onChange={(e) => updateField('fixation_reagent', e.target.value)}
              placeholder="e.g. 4% PFA"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="antibody_panel">Antibody Panel</Label>
            <Input
              id="antibody_panel"
              value={form.antibody_panel ?? ''}
              onChange={(e) => updateField('antibody_panel', e.target.value)}
              placeholder="e.g. CD45/CD3/DAPI"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="secondary_antibody">Secondary Antibody</Label>
            <Input
              id="secondary_antibody"
              value={form.secondary_antibody ?? ''}
              onChange={(e) => updateField('secondary_antibody', e.target.value)}
              placeholder="e.g. Goat anti-mouse IgG Alexa 488"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <textarea
              id="notes"
              value={form.notes ?? ''}
              onChange={(e) => updateField('notes', e.target.value)}
              placeholder="Optional processing notes..."
              rows={3}
              className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Start Processing'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Detail Drawer (slide-in panel)
// ============================================================

function IccDetailDrawer({
  slideId,
  onClose,
}: {
  slideId: string
  onClose: () => void
}) {
  const { data: slide, isLoading } = useIccSlide(slideId)
  const updateMutation = useUpdateIccSlide(slideId)
  const advanceMutation = useAdvanceIccStatus(slideId)

  const [editNotes, setEditNotes] = useState<string | null>(null)
  const [editAnalysisResults, setEditAnalysisResults] = useState<string | null>(null)

  // When slide data loads, sync edit state
  const notes = editNotes ?? slide?.notes ?? ''
  const analysisResultsStr =
    editAnalysisResults ??
    (slide?.analysis_results ? JSON.stringify(slide.analysis_results, null, 2) : '')

  const isTerminal = slide?.status === 'analysis_complete'
  const currentStageIndex = slide
    ? ICC_STAGES.indexOf(slide.status)
    : -1
  const nextStage =
    currentStageIndex >= 0 && currentStageIndex < ICC_STAGES.length - 1
      ? ICC_STAGES[currentStageIndex + 1]
      : null

  const handleSave = () => {
    const updates: { notes?: string; analysis_results?: Record<string, unknown> } = {}
    if (editNotes !== null) updates.notes = editNotes
    if (editAnalysisResults !== null) {
      try {
        updates.analysis_results = JSON.parse(editAnalysisResults)
      } catch {
        // ignore invalid JSON
      }
    }
    updateMutation.mutate(updates, {
      onSuccess: () => {
        setEditNotes(null)
        setEditAnalysisResults(null)
      },
    })
  }

  const handleAdvance = () => {
    advanceMutation.mutate()
  }

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 animate-[fadeIn_0.15s_ease-out]"
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className="fixed inset-y-0 right-0 w-full max-w-lg bg-background border-l border-border shadow-2xl animate-[slideIn_0.2s_ease-out] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="sticky top-0 z-10 bg-background border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'flex items-center justify-center h-9 w-9 rounded-lg',
                  slide ? STAGE_COLORS[slide.status].badge : 'bg-muted'
                )}
              >
                {slide ? (
                  <span className={STAGE_COLORS[slide.status].icon}>
                    {STAGE_ICONS[slide.status]}
                  </span>
                ) : (
                  <Microscope className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">
                  {slide?.sample_code ?? 'Loading...'}
                </h2>
                {slide && (
                  <Badge
                    className={cn(
                      'mt-0.5 text-[10px] border',
                      STAGE_COLORS[slide.status].badge
                    )}
                  >
                    {ICC_STATUS_LABELS[slide.status]}
                  </Badge>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-muted transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {isLoading || !slide ? (
          <PageSpinner />
        ) : (
          <div className="p-6 space-y-6">
            {/* Progress pipeline visualization */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Pipeline Progress
              </p>
              <div className="flex items-center gap-0.5">
                {ICC_STAGES.map((stage, i) => {
                  const isPast = i < currentStageIndex
                  const isCurrent = i === currentStageIndex
                  return (
                    <div
                      key={stage}
                      className="flex items-center gap-0.5 flex-1"
                      title={ICC_STATUS_LABELS[stage]}
                    >
                      <div
                        className={cn(
                          'h-2 w-full rounded-full transition-all',
                          isPast && 'bg-emerald-400',
                          isCurrent &&
                            `bg-gradient-to-r from-emerald-400 to-primary`,
                          !isPast && !isCurrent && 'bg-muted'
                        )}
                      />
                    </div>
                  )
                })}
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[9px] text-muted-foreground">Received</span>
                <span className="text-[9px] text-muted-foreground">Complete</span>
              </div>
            </div>

            {/* Advance button */}
            {!isTerminal && nextStage && (
              <Button
                onClick={handleAdvance}
                disabled={advanceMutation.isPending}
                className="w-full bg-gradient-primary hover:opacity-90 text-white"
              >
                {advanceMutation.isPending ? (
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                Advance to {ICC_STATUS_LABELS[nextStage]}
              </Button>
            )}

            {isTerminal && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Analysis complete. This slide has finished processing.
              </div>
            )}

            {/* Detail Fields */}
            <div className="space-y-4">
              <DetailSection title="Identifiers" icon={<SlidersHorizontal className="h-3.5 w-3.5" />}>
                <DetailRow label="Slide ID" value={slide.id} mono />
                <DetailRow label="Sample ID" value={slide.sample_id} mono />
              </DetailSection>

              <DetailSection title="Staining" icon={<TestTubes className="h-3.5 w-3.5" />}>
                <DetailRow
                  label="Antibody Panel"
                  value={slide.antibody_panel ?? '---'}
                />
                <DetailRow
                  label="Secondary Antibody"
                  value={slide.secondary_antibody ?? '---'}
                />
                <DetailRow
                  label="Fixation Reagent"
                  value={slide.fixation_reagent ?? '---'}
                />
                <DetailRow
                  label="Fixation Duration"
                  value={slide.fixation_duration_min != null ? `${slide.fixation_duration_min} min` : '---'}
                />
                <DetailRow
                  label="Fixation Date"
                  value={
                    slide.fixation_datetime
                      ? formatDate(slide.fixation_datetime)
                      : '---'
                  }
                />
                <DetailRow
                  label="Analysis Software"
                  value={slide.analysis_software ?? '---'}
                />
              </DetailSection>

              <DetailSection title="Operator" icon={<User className="h-3.5 w-3.5" />}>
                <DetailRow
                  label="Operator ID"
                  value={slide.operator_id ?? '---'}
                  mono
                />
              </DetailSection>

              <DetailSection title="Results" icon={<FileText className="h-3.5 w-3.5" />}>
                {slide.image_file_paths && Object.keys(slide.image_file_paths).length > 0 ? (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      Image File Paths ({Object.keys(slide.image_file_paths).length})
                    </p>
                    <div className="space-y-1">
                      {Object.entries(slide.image_file_paths).map(([key, val]) => (
                        <p
                          key={key}
                          className="text-xs font-mono text-foreground bg-muted px-2 py-1 rounded truncate"
                        >
                          {key}: {String(val)}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No images uploaded yet.
                  </p>
                )}

                {/* Analysis Results (editable) */}
                <div className="mt-3">
                  <Label className="text-xs">
                    Analysis Results (JSON)
                  </Label>
                  <textarea
                    value={analysisResultsStr}
                    onChange={(e) => setEditAnalysisResults(e.target.value)}
                    rows={4}
                    placeholder='{ "CD45+": 120, "CD3+": 85 }'
                    className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
              </DetailSection>

              {/* Notes (editable) */}
              <DetailSection title="Notes" icon={<FileText className="h-3.5 w-3.5" />}>
                <textarea
                  value={notes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={4}
                  placeholder="Processing notes..."
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </DetailSection>

              {/* Timestamps */}
              <DetailSection title="Timestamps" icon={<Clock className="h-3.5 w-3.5" />}>
                <DetailRow
                  label="Created"
                  value={formatDate(slide.created_at)}
                />
                <DetailRow
                  label="Updated"
                  value={formatDate(slide.updated_at)}
                />
              </DetailSection>
            </div>

            {/* Save button */}
            {(editNotes !== null || editAnalysisResults !== null) && (
              <div className="sticky bottom-0 bg-background border-t border-border -mx-6 px-6 py-3">
                <Button
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                  className="w-full"
                >
                  <Save className="h-4 w-4" />
                  {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// Detail helpers
// ============================================================

function DetailSection({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 mb-3">
        <span className="text-muted-foreground">{icon}</span>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {title}
        </h3>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          'text-foreground font-medium truncate max-w-[200px]',
          mono && 'font-mono text-xs'
        )}
      >
        {value}
      </span>
    </div>
  )
}
