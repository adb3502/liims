import { useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useRuns, useCreateRun, useInstruments } from '@/api/instruments'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { RunType, RunStatus, QCStatus } from '@/types'
import {
  RUN_TYPE_LABELS,
  RUN_STATUS_LABELS,
  QC_STATUS_LABELS,
} from '@/types'
import {
  Plus,
  Search,
  Play,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  FlaskConical,
} from 'lucide-react'

const PER_PAGE = 25

const ALL_RUN_TYPES: RunType[] = ['proteomics', 'metabolomics', 'plate_prep', 'other']
const ALL_RUN_STATUSES: RunStatus[] = ['planned', 'in_progress', 'completed', 'failed']

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

function useDebounce(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function InstrumentRunsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { hasRole } = useAuth()

  const page = parseInt(searchParams.get('page') ?? '1', 10)
  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '')
  const debouncedSearch = useDebounce(searchInput, 300)

  const instrumentFilter = searchParams.get('instrument_id') ?? ''
  const typeFilter = searchParams.get('run_type') ?? ''
  const statusFilter = searchParams.get('status') ?? ''

  const queryParams = useMemo(
    () => ({
      page,
      per_page: PER_PAGE,
      instrument_id: instrumentFilter || undefined,
      run_type: (typeFilter || undefined) as RunType | undefined,
      status: (statusFilter || undefined) as RunStatus | undefined,
    }),
    [page, instrumentFilter, typeFilter, statusFilter]
  )

  const { data, isLoading, isError } = useRuns(queryParams)
  const { data: instrumentsData } = useInstruments({ per_page: 100 })

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
      setSearchParams(newParams)
    },
    [searchParams, setSearchParams]
  )

  const canCreate = hasRole('super_admin', 'lab_manager', 'lab_technician')
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  // Client-side name search
  const runs = useMemo(() => {
    const items = data?.data ?? []
    if (!debouncedSearch.trim()) return items
    const q = debouncedSearch.toLowerCase()
    return items.filter(
      (r) =>
        r.run_name?.toLowerCase().includes(q) ||
        r.instrument_name?.toLowerCase().includes(q) ||
        r.batch_id?.toLowerCase().includes(q)
    )
  }, [data?.data, debouncedSearch])

  // Instrument lookup
  const instrumentMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const inst of instrumentsData?.data ?? []) {
      m.set(inst.id, inst.name)
    }
    return m
  }, [instrumentsData?.data])

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '---'
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Instrument Runs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.meta.total != null
              ? `${data.meta.total.toLocaleString()} run${data.meta.total !== 1 ? 's' : ''}`
              : 'Loading...'}
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4" />
            New Run
          </Button>
        )}
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by run name, batch ID..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Instrument filter */}
        <select
          value={instrumentFilter}
          onChange={(e) => updateParams({ instrument_id: e.target.value, page: '1' })}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All Instruments</option>
          {(instrumentsData?.data ?? []).map((inst) => (
            <option key={inst.id} value={inst.id}>
              {inst.name}
            </option>
          ))}
        </select>

        {/* Run type filter */}
        <select
          value={typeFilter}
          onChange={(e) => updateParams({ run_type: e.target.value, page: '1' })}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All Types</option>
          {ALL_RUN_TYPES.map((t) => (
            <option key={t} value={t}>
              {RUN_TYPE_LABELS[t]}
            </option>
          ))}
        </select>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => updateParams({ status: e.target.value, page: '1' })}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All Statuses</option>
          {ALL_RUN_STATUSES.map((s) => (
            <option key={s} value={s}>
              {RUN_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <PageSpinner />
      ) : isError ? (
        <div className="rounded-lg border border-danger/20 bg-danger/5 p-8 text-center">
          <p className="text-sm text-danger">Failed to load runs. Please try again.</p>
        </div>
      ) : runs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Play className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-foreground">No runs found</p>
          <p className="text-xs text-muted-foreground mt-1">
            {debouncedSearch || instrumentFilter || typeFilter || statusFilter
              ? 'Try adjusting your search or filters.'
              : 'No instrument runs have been created yet.'}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run Name</TableHead>
                  <TableHead>Instrument</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>QC</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead className="text-right">Samples</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow
                    key={run.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/instruments/runs/${run.id}`)}
                  >
                    <TableCell>
                      <span className="font-medium text-foreground">
                        {run.run_name || run.id.slice(0, 8)}
                      </span>
                      {run.batch_id && (
                        <div className="text-xs text-muted-foreground font-mono mt-0.5">
                          Batch: {run.batch_id}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {run.instrument_name ?? instrumentMap.get(run.instrument_id) ?? run.instrument_id.slice(0, 8)}
                    </TableCell>
                    <TableCell>
                      {run.run_type ? (
                        <Badge variant="secondary">
                          {RUN_TYPE_LABELS[run.run_type] ?? run.run_type}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">---</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE_VARIANT[run.status] ?? 'default'}>
                        {RUN_STATUS_LABELS[run.status] ?? run.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {run.qc_status ? (
                        <Badge variant={QC_BADGE_VARIANT[run.qc_status] ?? 'secondary'}>
                          {QC_STATUS_LABELS[run.qc_status] ?? run.qc_status}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">---</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(run.started_at)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(run.completed_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="tabular-nums font-medium text-foreground">
                        {run.sample_count ?? '---'}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => updateParams({ page: String(page - 1) })}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => updateParams({ page: String(page + 1) })}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create Run Dialog */}
      {showCreateDialog && (
        <CreateRunDialog
          open={showCreateDialog}
          onClose={() => setShowCreateDialog(false)}
          instruments={instrumentsData?.data ?? []}
          defaultInstrumentId={instrumentFilter}
        />
      )}
    </div>
  )
}

// --- Create Run Dialog ---

function CreateRunDialog({
  open,
  onClose,
  instruments,
  defaultInstrumentId,
}: {
  open: boolean
  onClose: () => void
  instruments: Array<{ id: string; name: string }>
  defaultInstrumentId: string
}) {
  const createRun = useCreateRun()
  const [instrumentId, setInstrumentId] = useState(defaultInstrumentId || '')
  const [runName, setRunName] = useState('')
  const [runType, setRunType] = useState<RunType | ''>('')
  const [methodName, setMethodName] = useState('')
  const [batchId, setBatchId] = useState('')
  const [notes, setNotes] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!instrumentId) return

    await createRun.mutateAsync({
      instrument_id: instrumentId,
      run_name: runName.trim() || undefined,
      run_type: runType || undefined,
      method_name: methodName.trim() || undefined,
      batch_id: batchId.trim() || undefined,
      notes: notes.trim() || undefined,
    })
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent onClose={onClose} className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Instrument Run</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="run-instrument">Instrument</Label>
            <select
              id="run-instrument"
              value={instrumentId}
              onChange={(e) => setInstrumentId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              required
            >
              <option value="">Select instrument...</option>
              {instruments.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="run-name">Run Name</Label>
            <Input
              id="run-name"
              value={runName}
              onChange={(e) => setRunName(e.target.value)}
              placeholder="e.g. Proteomics Batch 42"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="run-type">Run Type</Label>
              <select
                id="run-type"
                value={runType}
                onChange={(e) => setRunType(e.target.value as RunType | '')}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">None</option>
                {ALL_RUN_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {RUN_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="run-batch">Batch ID</Label>
              <Input
                id="run-batch"
                value={batchId}
                onChange={(e) => setBatchId(e.target.value)}
                placeholder="Optional"
                className="font-mono"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="run-method">Method Name</Label>
            <Input
              id="run-method"
              value={methodName}
              onChange={(e) => setMethodName(e.target.value)}
              placeholder="e.g. DIA 60min gradient"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="run-notes">Notes</Label>
            <Input
              id="run-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes..."
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createRun.isPending || !instrumentId}>
              {createRun.isPending ? 'Creating...' : 'Create Run'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
