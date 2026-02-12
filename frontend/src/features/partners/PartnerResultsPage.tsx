import { useState, useMemo } from 'react'
import { usePartnerResultsList } from '@/api/partner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
} from '@/components/ui/dialog'
import type { PartnerLabResult, PartnerName, MatchStatus } from '@/types'
import { PARTNER_LABELS } from '@/types'
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Search,
  AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const PER_PAGE = 20
const ALL_PARTNERS: PartnerName[] = ['healthians', '1mg', 'lalpath', 'decodeage']
const ALL_MATCH_STATUSES: (MatchStatus | '')[] = ['', 'auto_matched', 'manual_matched', 'unmatched']

const MATCH_STATUS_LABELS: Record<MatchStatus | '', string> = {
  '': 'All Statuses',
  auto_matched: 'Matched',
  manual_matched: 'Manual Match',
  unmatched: 'Unmatched',
}

const MATCH_STATUS_VARIANT: Record<MatchStatus, 'success' | 'default' | 'destructive'> = {
  auto_matched: 'success',
  manual_matched: 'default',
  unmatched: 'destructive',
}

export function PartnerResultsPage() {
  const [page, setPage] = useState(1)
  const [partnerFilter, setPartnerFilter] = useState<PartnerName | ''>('')
  const [matchStatusFilter, setMatchStatusFilter] = useState<MatchStatus | ''>('')
  const [testNameSearch, setTestNameSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedResult, setSelectedResult] = useState<PartnerLabResult | null>(null)

  const queryParams = useMemo(() => ({
    page,
    per_page: PER_PAGE,
    partner_name: partnerFilter || undefined,
    match_status: matchStatusFilter || undefined,
    test_name: debouncedSearch || undefined,
  }), [page, partnerFilter, matchStatusFilter, debouncedSearch])

  const { data, isLoading, isError } = usePartnerResultsList(queryParams)

  const results = data?.data ?? []
  const totalPages = data?.meta ? Math.ceil(data.meta.total / data.meta.per_page) : 0

  // Debounce search input
  useMemo(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(testNameSearch)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [testNameSearch])

  function isOutOfRange(result: PartnerLabResult): boolean {
    if (!result.reference_range || !result.test_value) return false

    // Parse reference range (e.g., "10-20", "<5", ">100")
    const value = parseFloat(result.test_value)
    if (isNaN(value)) return false

    const range = result.reference_range.trim()

    // Handle <N format
    if (range.startsWith('<')) {
      const max = parseFloat(range.slice(1))
      return !isNaN(max) && value >= max
    }

    // Handle >N format
    if (range.startsWith('>')) {
      const min = parseFloat(range.slice(1))
      return !isNaN(min) && value <= min
    }

    // Handle N-M format
    const parts = range.split('-')
    if (parts.length === 2) {
      const min = parseFloat(parts[0])
      const max = parseFloat(parts[1])
      if (!isNaN(min) && !isNaN(max)) {
        return value < min || value > max
      }
    }

    return false
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Partner Lab Results</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.meta.total != null
              ? `${data.meta.total} result${data.meta.total !== 1 ? 's' : ''}`
              : 'Loading...'}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-6">
        <select
          value={partnerFilter}
          onChange={(e) => {
            setPartnerFilter(e.target.value as PartnerName | '')
            setPage(1)
          }}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All Partners</option>
          {ALL_PARTNERS.map((p) => (
            <option key={p} value={p}>{PARTNER_LABELS[p]}</option>
          ))}
        </select>

        <select
          value={matchStatusFilter}
          onChange={(e) => {
            setMatchStatusFilter(e.target.value as MatchStatus | '')
            setPage(1)
          }}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          {ALL_MATCH_STATUSES.map((s) => (
            <option key={s} value={s}>{MATCH_STATUS_LABELS[s]}</option>
          ))}
        </select>

        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={testNameSearch}
            onChange={(e) => setTestNameSearch(e.target.value)}
            placeholder="Search test name..."
            className="pl-9"
          />
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <PageSpinner />
      ) : isError ? (
        <div className="rounded-lg border border-danger/20 bg-danger/5 p-8 text-center">
          <p className="text-sm text-danger">Failed to load partner results.</p>
        </div>
      ) : results.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-foreground">No results found</p>
          <p className="text-xs text-muted-foreground mt-1">
            {partnerFilter || matchStatusFilter || debouncedSearch
              ? 'Try changing the filters.'
              : 'No partner lab results have been imported yet.'}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Participant</TableHead>
                  <TableHead>Test Name</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Units</TableHead>
                  <TableHead>Reference Range</TableHead>
                  <TableHead>Partner Lab</TableHead>
                  <TableHead>Import Date</TableHead>
                  <TableHead>Match Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((result) => {
                  const outOfRange = isOutOfRange(result)
                  return (
                    <TableRow
                      key={result.id}
                      className="cursor-pointer"
                      onClick={() => setSelectedResult(result)}
                    >
                      <TableCell className="font-mono text-sm">
                        {result.participant_code_raw ?? <span className="text-muted-foreground">---</span>}
                      </TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">
                        {result.canonical_test_name ?? result.test_name_raw ?? (
                          <span className="text-muted-foreground">---</span>
                        )}
                      </TableCell>
                      <TableCell className={cn(
                        "font-mono text-sm font-medium",
                        outOfRange && "text-danger"
                      )}>
                        {outOfRange && (
                          <AlertCircle className="inline h-3.5 w-3.5 mr-1" />
                        )}
                        {result.test_value ?? <span className="text-muted-foreground">---</span>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {result.test_unit ?? '---'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground font-mono">
                        {result.reference_range ?? '---'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {/* Partner name is in the import, need to fetch it */}
                          Partner Lab
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {new Date(result.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {result.match_status ? (
                          <Badge variant={MATCH_STATUS_VARIANT[result.match_status]} className="text-xs">
                            {MATCH_STATUS_LABELS[result.match_status]}
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs">
                            Unmatched
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
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

      {/* Result Detail Dialog */}
      {selectedResult && (
        <Dialog open={!!selectedResult} onOpenChange={() => setSelectedResult(null)}>
          <DialogContent onClose={() => setSelectedResult(null)} className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Result Details</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Participant Code</p>
                  <p className="font-medium font-mono">
                    {selectedResult.participant_code_raw ?? '---'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Match Status</p>
                  {selectedResult.match_status ? (
                    <Badge variant={MATCH_STATUS_VARIANT[selectedResult.match_status]} className="text-xs mt-1">
                      {MATCH_STATUS_LABELS[selectedResult.match_status]}
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="text-xs mt-1">Unmatched</Badge>
                  )}
                </div>
                <div>
                  <p className="text-muted-foreground">Test Name (Raw)</p>
                  <p className="font-medium">{selectedResult.test_name_raw ?? '---'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Canonical Test</p>
                  <p className="font-medium">{selectedResult.canonical_test_name ?? '---'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Result Value</p>
                  <p className={cn(
                    "font-medium font-mono text-base",
                    isOutOfRange(selectedResult) && "text-danger"
                  )}>
                    {selectedResult.test_value ?? '---'} {selectedResult.test_unit ?? ''}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Reference Range</p>
                  <p className="font-medium font-mono">{selectedResult.reference_range ?? '---'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Test Date</p>
                  <p className="font-medium font-mono">
                    {selectedResult.test_date
                      ? new Date(selectedResult.test_date).toLocaleDateString()
                      : '---'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Import Date</p>
                  <p className="font-medium font-mono">
                    {new Date(selectedResult.created_at).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Abnormal Flag</p>
                  {selectedResult.is_abnormal === true ? (
                    <Badge variant="warning" className="text-xs mt-1">Abnormal</Badge>
                  ) : selectedResult.is_abnormal === false ? (
                    <Badge variant="success" className="text-xs mt-1">Normal</Badge>
                  ) : (
                    <p className="text-muted-foreground">---</p>
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
