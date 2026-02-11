import { useState, useMemo, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  useOmicsResultSets,
  useOmicsResults,
  type OmicsResultSet,
  type OmicsResult,
  type OmicsResultType,
} from '@/api/instruments'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  Dna,
  ArrowLeft,
  FlaskConical,
  Layers,
  Users,
  CheckCircle2,
  AlertCircle,
  Beaker,
} from 'lucide-react'

const SETS_PER_PAGE = 20
const RESULTS_PER_PAGE = 25

const RESULT_TYPE_LABELS: Record<OmicsResultType, string> = {
  proteomics: 'Proteomics',
  metabolomics: 'Metabolomics',
}

function useDebounce(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function QcBadge({ qcSummary }: { qcSummary: Record<string, unknown> | null }) {
  if (!qcSummary) {
    return <Badge variant="secondary">No QC</Badge>
  }

  const status = (qcSummary.status as string) ?? (qcSummary.qc_status as string)
  if (status === 'passed' || status === 'pass') {
    return <Badge variant="success">QC Passed</Badge>
  }
  if (status === 'failed' || status === 'fail') {
    return <Badge variant="destructive">QC Failed</Badge>
  }
  return <Badge variant="warning">QC Pending</Badge>
}

// ---------------------------------------------------------------------------
// Stats Summary Cards
// ---------------------------------------------------------------------------

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ElementType
  label: string
  value: string | number
  accent?: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
          accent ?? 'bg-primary/10 text-primary'
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground truncate">{label}</p>
        <p className="text-lg font-semibold text-foreground tabular-nums">{value}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Result Set List View
// ---------------------------------------------------------------------------

function ResultSetListView({
  onSelectSet,
}: {
  onSelectSet: (set: OmicsResultSet) => void
}) {
  const [searchParams, setSearchParams] = useSearchParams()

  const page = parseInt(searchParams.get('page') ?? '1', 10)
  const typeFilter = (searchParams.get('result_type') ?? '') as OmicsResultType | ''
  const runFilter = searchParams.get('run_id') ?? ''

  const queryParams = useMemo(
    () => ({
      page,
      per_page: SETS_PER_PAGE,
      result_type: (typeFilter || undefined) as OmicsResultType | undefined,
      run_id: runFilter || undefined,
    }),
    [page, typeFilter, runFilter]
  )

  const { data, isLoading, isError } = useOmicsResultSets(queryParams)

  const totalPages = data?.meta ? Math.ceil(data.meta.total / data.meta.per_page) : 0

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

  // Aggregate stats from current page data
  const stats = useMemo(() => {
    if (!data?.data) return { sets: 0, features: 0, samples: 0 }
    return {
      sets: data.meta.total,
      features: data.data.reduce((sum, s) => sum + (s.total_features ?? 0), 0),
      samples: data.data.reduce((sum, s) => sum + (s.total_samples ?? 0), 0),
    }
  }, [data])

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Omics Results</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse proteomics and metabolomics result sets
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <StatCard
          icon={Layers}
          label="Total Result Sets"
          value={stats.sets.toLocaleString()}
        />
        <StatCard
          icon={Dna}
          label="Features (this page)"
          value={stats.features.toLocaleString()}
          accent="bg-[#03B6D3]/10 text-[#03B6D3]"
        />
        <StatCard
          icon={Users}
          label="Samples (this page)"
          value={stats.samples.toLocaleString()}
          accent="bg-warning/10 text-warning"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center">
        <select
          value={typeFilter}
          onChange={(e) => updateParams({ result_type: e.target.value, page: '1' })}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All Types</option>
          <option value="proteomics">Proteomics</option>
          <option value="metabolomics">Metabolomics</option>
        </select>

        <Input
          placeholder="Filter by Run ID..."
          value={runFilter}
          onChange={(e) => updateParams({ run_id: e.target.value, page: '1' })}
          className="max-w-[260px] font-mono text-sm"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <PageSpinner />
      ) : isError ? (
        <div className="rounded-lg border border-danger/20 bg-danger/5 p-8 text-center">
          <p className="text-sm text-danger">Failed to load omics result sets. Please try again.</p>
        </div>
      ) : data?.data.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Beaker className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-foreground">No result sets found</p>
          <p className="text-xs text-muted-foreground mt-1">
            {typeFilter || runFilter
              ? 'Try adjusting your filters.'
              : 'No omics result sets have been imported yet.'}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Result Type</TableHead>
                  <TableHead>Run Name</TableHead>
                  <TableHead>Analysis Software</TableHead>
                  <TableHead>Import Date</TableHead>
                  <TableHead className="text-right">Features</TableHead>
                  <TableHead className="text-right">Samples</TableHead>
                  <TableHead>QC Summary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.data.map((rs) => (
                  <TableRow
                    key={rs.id}
                    className="cursor-pointer"
                    onClick={() => onSelectSet(rs)}
                  >
                    <TableCell>
                      <Badge
                        variant={rs.result_type === 'proteomics' ? 'default' : 'secondary'}
                        className={cn(
                          rs.result_type === 'metabolomics' &&
                            'bg-[#03B6D3]/15 text-[#03B6D3] border-[#03B6D3]/20'
                        )}
                      >
                        {RESULT_TYPE_LABELS[rs.result_type] ?? rs.result_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium text-foreground">
                        {rs.run_name ?? '---'}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {rs.analysis_software
                        ? `${rs.analysis_software}${rs.software_version ? ` v${rs.software_version}` : ''}`
                        : '---'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(rs.import_date)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {rs.total_features.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {rs.total_samples.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <QcBadge qcSummary={rs.qc_summary} />
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
    </div>
  )
}

// ---------------------------------------------------------------------------
// Result Detail View (individual results for a selected result set)
// ---------------------------------------------------------------------------

function ResultDetailView({
  resultSet,
  onBack,
}: {
  resultSet: OmicsResultSet
  onBack: () => void
}) {
  const [resultPage, setResultPage] = useState(1)
  const [sampleFilter, setSampleFilter] = useState('')
  const [featureSearch, setFeatureSearch] = useState('')
  const debouncedFeature = useDebounce(featureSearch, 300)

  const queryParams = useMemo(
    () => ({
      result_set_id: resultSet.id,
      sample_id: sampleFilter || undefined,
      feature_id: debouncedFeature || undefined,
      page: resultPage,
      per_page: RESULTS_PER_PAGE,
    }),
    [resultSet.id, sampleFilter, debouncedFeature, resultPage]
  )

  const { data, isLoading, isError } = useOmicsResults(queryParams)
  const totalPages = data?.meta ? Math.ceil(data.meta.total / data.meta.per_page) : 0

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3 cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to result sets
        </button>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold text-foreground">
                {resultSet.run_name ?? 'Result Set'}
              </h1>
              <Badge
                variant={resultSet.result_type === 'proteomics' ? 'default' : 'secondary'}
                className={cn(
                  resultSet.result_type === 'metabolomics' &&
                    'bg-[#03B6D3]/15 text-[#03B6D3] border-[#03B6D3]/20'
                )}
              >
                {RESULT_TYPE_LABELS[resultSet.result_type]}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {resultSet.analysis_software
                ? `${resultSet.analysis_software}${resultSet.software_version ? ` v${resultSet.software_version}` : ''}`
                : 'Unknown software'}
              {' \u00B7 '}Imported {formatDate(resultSet.import_date)}
            </p>
          </div>
          <QcBadge qcSummary={resultSet.qc_summary} />
        </div>
      </div>

      {/* Summary stats for this set */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard
          icon={Dna}
          label="Total Features"
          value={resultSet.total_features.toLocaleString()}
        />
        <StatCard
          icon={Users}
          label="Total Samples"
          value={resultSet.total_samples.toLocaleString()}
          accent="bg-[#03B6D3]/10 text-[#03B6D3]"
        />
        <StatCard
          icon={CheckCircle2}
          label="Result Type"
          value={RESULT_TYPE_LABELS[resultSet.result_type]}
          accent="bg-success/10 text-success"
        />
        <StatCard
          icon={FlaskConical}
          label="Results Loaded"
          value={data?.meta.total?.toLocaleString() ?? '---'}
          accent="bg-warning/10 text-warning"
        />
      </div>

      {/* Filters for results */}
      <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by Feature ID..."
            value={featureSearch}
            onChange={(e) => {
              setFeatureSearch(e.target.value)
              setResultPage(1)
            }}
            className="pl-9 font-mono"
          />
        </div>
        <Input
          placeholder="Filter by Sample ID..."
          value={sampleFilter}
          onChange={(e) => {
            setSampleFilter(e.target.value)
            setResultPage(1)
          }}
          className="max-w-[260px] font-mono text-sm"
        />
      </div>

      {/* Results Table */}
      {isLoading ? (
        <PageSpinner />
      ) : isError ? (
        <div className="rounded-lg border border-danger/20 bg-danger/5 p-8 text-center">
          <p className="text-sm text-danger">Failed to load results. Please try again.</p>
        </div>
      ) : data?.data.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-foreground">No results found</p>
          <p className="text-xs text-muted-foreground mt-1">
            {debouncedFeature || sampleFilter
              ? 'Try adjusting your search filters.'
              : 'This result set has no individual results.'}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feature ID</TableHead>
                  <TableHead>Feature Name</TableHead>
                  <TableHead>Sample Code</TableHead>
                  <TableHead className="text-right">Quantification</TableHead>
                  <TableHead className="text-right">Confidence</TableHead>
                  <TableHead>Imputed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.data.map((r: OmicsResult) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <span className="font-mono font-medium text-primary text-sm">
                        {r.feature_id}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-foreground">
                      {r.feature_name ?? '---'}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm text-muted-foreground">
                        {r.sample_code ?? r.sample_id.slice(0, 8)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {r.quantification_value != null
                        ? Number(r.quantification_value).toLocaleString(undefined, {
                            maximumFractionDigits: 4,
                          })
                        : '---'}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.confidence_score != null ? (
                        <span
                          className={cn(
                            'font-mono text-sm',
                            Number(r.confidence_score) >= 0.9
                              ? 'text-success'
                              : Number(r.confidence_score) >= 0.7
                                ? 'text-foreground'
                                : 'text-warning'
                          )}
                        >
                          {Number(r.confidence_score).toFixed(3)}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">---</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.is_imputed ? (
                        <Badge variant="warning">Imputed</Badge>
                      ) : (
                        <Badge variant="secondary">Measured</Badge>
                      )}
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
                Page {resultPage} of {totalPages}
                {data?.meta.total != null && (
                  <span className="ml-2">({data.meta.total.toLocaleString()} total results)</span>
                )}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={resultPage <= 1}
                  onClick={() => setResultPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={resultPage >= totalPages}
                  onClick={() => setResultPage((p) => p + 1)}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function OmicsResultsPage() {
  const [selectedSet, setSelectedSet] = useState<OmicsResultSet | null>(null)

  if (selectedSet) {
    return (
      <ResultDetailView
        resultSet={selectedSet}
        onBack={() => setSelectedSet(null)}
      />
    )
  }

  return <ResultSetListView onSelectSet={setSelectedSet} />
}
