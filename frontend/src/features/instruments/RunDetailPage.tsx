import { useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  useRunDetail,
  useStartRun,
  useCompleteRun,
  useUploadRunResults,
} from '@/api/instruments'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
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
import type { RunStatus, QCStatus } from '@/types'
import {
  RUN_TYPE_LABELS,
  RUN_STATUS_LABELS,
  QC_STATUS_LABELS,
} from '@/types'
import {
  ArrowLeft,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  FileText,
  Upload,
  AlertTriangle,
  Grid3X3,
  ExternalLink,
  Cpu,
} from 'lucide-react'

const STATUS_BADGE_VARIANT: Record<RunStatus, 'default' | 'success' | 'warning' | 'destructive' | 'secondary'> = {
  planned: 'secondary',
  in_progress: 'warning',
  completed: 'success',
  failed: 'destructive',
}

const QC_BADGE_VARIANT: Record<QCStatus, 'default' | 'success' | 'warning' | 'destructive' | 'secondary'> = {
  pending: 'secondary',
  passed: 'success',
  failed: 'destructive',
}

function formatDatetime(dateStr: string | null): string {
  if (!dateStr) return '---'
  return new Date(dateStr).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function RunDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { hasRole } = useAuth()

  const runId = id ?? ''
  const { data: run, isLoading, isError } = useRunDetail(runId)
  const startMutation = useStartRun(runId)
  const completeMutation = useCompleteRun(runId)
  const uploadMutation = useUploadRunResults(runId)

  const [showCompleteDialog, setShowCompleteDialog] = useState(false)
  const [showFailDialog, setShowFailDialog] = useState(false)
  const [showUploadDialog, setShowUploadDialog] = useState(false)

  const canManage = hasRole('super_admin', 'lab_manager', 'lab_technician')

  if (!id) {
    return (
      <div className="rounded-lg border border-danger/20 bg-danger/5 p-8 text-center">
        <p className="text-sm text-danger">No run ID provided.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/instruments/runs')}>
          Back to Runs
        </Button>
      </div>
    )
  }

  if (isLoading) return <PageSpinner />

  if (isError || !run) {
    return (
      <div className="rounded-lg border border-danger/20 bg-danger/5 p-8 text-center">
        <p className="text-sm text-danger">Failed to load run details.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/instruments/runs')}>
          Back to Runs
        </Button>
      </div>
    )
  }

  async function handleStart() {
    await startMutation.mutateAsync()
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
            <Cpu className="h-7 w-7 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-foreground">
                {run.run_name || `Run ${run.id.slice(0, 8)}`}
              </h1>
              <Badge variant={STATUS_BADGE_VARIANT[run.status]}>
                {RUN_STATUS_LABELS[run.status]}
              </Badge>
              {run.qc_status && (
                <Badge variant={QC_BADGE_VARIANT[run.qc_status]}>
                  QC: {QC_STATUS_LABELS[run.qc_status]}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {run.instrument_name ?? run.instrument_id.slice(0, 8)}
              {run.run_type && ` \u00b7 ${RUN_TYPE_LABELS[run.run_type]}`}
              {run.batch_id && ` \u00b7 Batch ${run.batch_id}`}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        {canManage && (
          <div className="flex items-center gap-2 flex-wrap">
            {run.status === 'planned' && (
              <Button
                onClick={handleStart}
                disabled={startMutation.isPending}
              >
                <Play className="h-4 w-4" />
                {startMutation.isPending ? 'Starting...' : 'Start Run'}
              </Button>
            )}
            {run.status === 'in_progress' && (
              <>
                <Button
                  onClick={() => setShowCompleteDialog(true)}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Complete Run
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setShowFailDialog(true)}
                >
                  <XCircle className="h-4 w-4" />
                  Mark Failed
                </Button>
              </>
            )}
            {(run.status === 'completed' || run.status === 'in_progress') && (
              <Button variant="outline" onClick={() => setShowUploadDialog(true)}>
                <Upload className="h-4 w-4" />
                Upload Results
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <InfoCard
          icon={Clock}
          label="Started"
          value={formatDatetime(run.started_at)}
        />
        <InfoCard
          icon={CheckCircle2}
          label="Completed"
          value={formatDatetime(run.completed_at)}
        />
        <InfoCard
          icon={User}
          label="Operator"
          value={run.operator_id?.slice(0, 8) ?? '---'}
          mono
        />
        <InfoCard
          icon={FileText}
          label="Method"
          value={run.method_name ?? '---'}
        />
      </div>

      {/* Notes */}
      {run.notes && (
        <div className="rounded-lg border border-border bg-card p-4 mb-6">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Notes</div>
          <p className="text-sm text-foreground whitespace-pre-wrap">{run.notes}</p>
        </div>
      )}

      {/* Raw data info */}
      {run.raw_data_path && (
        <div className="rounded-lg border border-border bg-card p-4 mb-6">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Raw Data</div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm text-foreground">{run.raw_data_path}</span>
            {run.raw_data_size_bytes != null && (
              <Badge variant="secondary">
                {(run.raw_data_size_bytes / 1024 / 1024).toFixed(1)} MB
              </Badge>
            )}
            {run.raw_data_verified ? (
              <Badge variant="success">Verified</Badge>
            ) : (
              <Badge variant="warning">Unverified</Badge>
            )}
          </div>
        </div>
      )}

      {/* Plates section */}
      <div className="rounded-xl border border-border bg-card overflow-hidden mb-6">
        <div className="bg-muted/30 px-5 py-3 border-b border-border/60 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Grid3X3 className="h-4 w-4 text-muted-foreground" />
            Plates ({run.plates?.length ?? 0})
          </div>
        </div>

        {run.plates && run.plates.length > 0 ? (
          <div className="divide-y divide-border/60">
            {run.plates.map((plate) => (
              <button
                key={plate.id}
                onClick={() => navigate(`/instruments/plates/${plate.id}`)}
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-colors cursor-pointer text-left"
              >
                <div>
                  <span className="font-medium text-foreground text-sm">
                    {plate.plate_name}
                  </span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {plate.rows} x {plate.columns}
                  </span>
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            ))}
          </div>
        ) : (
          <div className="px-5 py-8 text-center">
            <Grid3X3 className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No plates linked to this run</p>
          </div>
        )}
      </div>

      {/* Run Samples section */}
      {run.run_samples && run.run_samples.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="bg-muted/30 px-5 py-3 border-b border-border/60">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Run Samples ({run.run_samples.length})
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Sample</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Well</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Plate #</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">QC</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Volume (uL)</th>
                </tr>
              </thead>
              <tbody>
                {run.run_samples.map((sample) => (
                  <tr
                    key={sample.id}
                    className="border-b border-border/40 hover:bg-muted/20 cursor-pointer"
                    onClick={() => navigate(`/samples/${sample.sample_id}`)}
                  >
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-xs font-medium text-primary">
                        {sample.sample_code ?? sample.sample_id.slice(0, 10)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                      {sample.well_position ?? '---'}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                      {sample.plate_number}
                    </td>
                    <td className="px-4 py-2.5">
                      {sample.is_qc_sample ? (
                        <Badge variant="warning" className="text-[10px]">
                          {sample.qc_type ?? 'QC'}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">---</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                      {sample.injection_volume_ul ?? '---'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Complete Run Dialog */}
      {showCompleteDialog && (
        <CompleteRunDialog
          open={showCompleteDialog}
          onClose={() => setShowCompleteDialog(false)}
          runId={id}
        />
      )}

      {/* Fail Run Dialog */}
      {showFailDialog && (
        <FailRunDialog
          open={showFailDialog}
          onClose={() => setShowFailDialog(false)}
          runId={id}
        />
      )}

      {/* Upload Results Dialog */}
      {showUploadDialog && (
        <UploadResultsDialog
          open={showUploadDialog}
          onClose={() => setShowUploadDialog(false)}
          runId={id}
        />
      )}
    </div>
  )
}

// --- Info Card ---

function InfoCard({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: typeof Clock
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>
      <div className={cn('text-sm font-medium text-foreground', mono && 'font-mono')}>
        {value}
      </div>
    </div>
  )
}

// --- Complete Run Dialog ---

function CompleteRunDialog({
  open,
  onClose,
  runId,
}: {
  open: boolean
  onClose: () => void
  runId: string
}) {
  const completeMutation = useCompleteRun(runId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await completeMutation.mutateAsync({ failed: false })
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent onClose={onClose} className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Complete Run</DialogTitle>
          <DialogDescription>Mark this run as successfully completed.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <p className="text-sm text-muted-foreground">
            This will mark the run as completed. You can update QC status and notes separately after completion.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              type="submit"
              disabled={completeMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {completeMutation.isPending ? 'Completing...' : 'Complete'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// --- Fail Run Dialog ---

function FailRunDialog({
  open,
  onClose,
  runId,
}: {
  open: boolean
  onClose: () => void
  runId: string
}) {
  const completeMutation = useCompleteRun(runId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await completeMutation.mutateAsync({ failed: true })
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent onClose={onClose} className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Mark Run as Failed
          </DialogTitle>
          <DialogDescription>This action cannot be undone.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <p className="text-sm text-muted-foreground">
            This will mark the run as failed. Are you sure you want to proceed?
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={completeMutation.isPending}
            >
              {completeMutation.isPending ? 'Saving...' : 'Mark Failed'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// --- Upload Results Dialog ---

function UploadResultsDialog({
  open,
  onClose,
  runId,
}: {
  open: boolean
  onClose: () => void
  runId: string
}) {
  const uploadMutation = useUploadRunResults(runId)
  const [fileContent, setFileContent] = useState('')
  const [fileName, setFileName] = useState('')
  const [resultType, setResultType] = useState<'proteomics' | 'metabolomics'>('proteomics')
  const [dragOver, setDragOver] = useState(false)
  const [parseError, setParseError] = useState('')

  const handleFile = useCallback((file: File) => {
    setFileName(file.name)
    setParseError('')
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      setFileContent(text)
    }
    reader.readAsText(file)
  }, [])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!fileContent.trim()) return

    try {
      const parsed = JSON.parse(fileContent)
      const results = Array.isArray(parsed) ? parsed : parsed.results ?? parsed.data
      if (!Array.isArray(results)) {
        setParseError('Expected a JSON array of results or an object with a "results" key.')
        return
      }
      // Validate that results have required fields
      for (const item of results) {
        if (!item.sample_id || !item.feature_id) {
          setParseError('Each result must have "sample_id" and "feature_id" fields.')
          return
        }
      }
      await uploadMutation.mutateAsync({
        result_type: resultType,
        source_file_path: fileName || undefined,
        results,
      })
      onClose()
    } catch {
      setParseError('Invalid JSON. Please check the file format.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent onClose={onClose} className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Run Results</DialogTitle>
          <DialogDescription>
            Upload a JSON file with omics results. Each result item must include
            {' { sample_id, feature_id, quantification_value } '}.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Result type */}
          <div className="space-y-1.5">
            <Label htmlFor="result-type">Result Type</Label>
            <select
              id="result-type"
              value={resultType}
              onChange={(e) => setResultType(e.target.value as 'proteomics' | 'metabolomics')}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="proteomics">Proteomics</option>
              <option value="metabolomics">Metabolomics</option>
            </select>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={cn(
              'relative rounded-lg border-2 border-dashed p-8 text-center transition-colors',
              dragOver
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/40',
            )}
          >
            <Upload className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">
              {fileName
                ? <span className="font-mono font-medium text-foreground">{fileName}</span>
                : 'Drop a JSON file here or click to browse'}
            </p>
            <input
              type="file"
              accept=".json"
              onChange={handleFileInput}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>

          {parseError && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
              <p className="text-xs text-destructive">{parseError}</p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              type="submit"
              disabled={uploadMutation.isPending || !fileContent.trim()}
            >
              {uploadMutation.isPending ? 'Uploading...' : 'Upload Results'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
