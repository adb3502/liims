import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useImportHistory, useImportDetail } from '@/api/partner'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
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
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { PartnerName } from '@/types'
import { PARTNER_LABELS } from '@/types'
import {
  Plus,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from 'lucide-react'

const PER_PAGE = 20
const ALL_PARTNERS: PartnerName[] = ['healthians', '1mg', 'lalpath', 'decodeage']

export function ImportHistoryPage() {
  const navigate = useNavigate()
  const { hasRole } = useAuth()
  const [page, setPage] = useState(1)
  const [partnerFilter, setPartnerFilter] = useState<PartnerName | ''>('')
  const [selectedImportId, setSelectedImportId] = useState<string | null>(null)

  const queryParams = useMemo(() => ({
    page,
    per_page: PER_PAGE,
    partner_name: partnerFilter || undefined,
  }), [page, partnerFilter])

  const { data, isLoading, isError } = useImportHistory(queryParams)
  const { data: importDetail } = useImportDetail(selectedImportId ?? undefined)

  const imports = data?.data ?? []
  const totalPages = data?.meta ? Math.ceil(data.meta.total / data.meta.per_page) : 0
  const canImport = hasRole('super_admin', 'lab_manager', 'data_entry')

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Import History</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.meta.total != null
              ? `${data.meta.total} import${data.meta.total !== 1 ? 's' : ''}`
              : 'Loading...'}
          </p>
        </div>
        {canImport && (
          <Button onClick={() => navigate('/partners/import')}>
            <Plus className="h-4 w-4" />
            New Import
          </Button>
        )}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3 mb-6">
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
      </div>

      {/* Content */}
      {isLoading ? (
        <PageSpinner />
      ) : isError ? (
        <div className="rounded-lg border border-danger/20 bg-danger/5 p-8 text-center">
          <p className="text-sm text-danger">Failed to load import history.</p>
        </div>
      ) : imports.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-foreground">No imports found</p>
          <p className="text-xs text-muted-foreground mt-1">
            {partnerFilter ? 'Try changing the filter.' : 'No partner data has been imported yet.'}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">
                    <span className="flex items-center justify-end gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                      Matched
                    </span>
                  </TableHead>
                  <TableHead className="text-right">
                    <span className="flex items-center justify-end gap-1">
                      <XCircle className="h-3.5 w-3.5 text-danger" />
                      Failed
                    </span>
                  </TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {imports.map((imp) => (
                  <TableRow
                    key={imp.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedImportId(imp.id)}
                  >
                    <TableCell>
                      <Badge variant="secondary">
                        {PARTNER_LABELS[imp.partner_name]}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {new Date(imp.import_date).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-sm">
                      {imp.source_file_name ?? <span className="text-muted-foreground">---</span>}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {imp.records_total ?? 0}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-success">
                      {imp.records_matched ?? 0}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-danger">
                      {imp.records_failed ?? 0}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {imp.notes ?? '---'}
                    </TableCell>
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

      {/* Import Detail Dialog */}
      {selectedImportId && (
        <Dialog open={!!selectedImportId} onOpenChange={() => setSelectedImportId(null)}>
          <DialogContent onClose={() => setSelectedImportId(null)} className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Import Details</DialogTitle>
            </DialogHeader>
            {importDetail ? (
              <div className="space-y-4 mt-2">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Partner</p>
                    <p className="font-medium">{PARTNER_LABELS[importDetail.partner_name]}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Date</p>
                    <p className="font-medium font-mono">
                      {new Date(importDetail.import_date).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">File</p>
                    <p className="font-medium">{importDetail.source_file_name ?? '---'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Records</p>
                    <p className="font-medium font-mono">
                      {importDetail.records_total ?? 0} total,{' '}
                      <span className="text-success">{importDetail.records_matched ?? 0} matched</span>,{' '}
                      <span className="text-danger">{importDetail.records_failed ?? 0} failed</span>
                    </p>
                  </div>
                </div>

                {importDetail.results && importDetail.results.length > 0 && (
                  <div className="rounded-lg border border-border max-h-64 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Participant</TableHead>
                          <TableHead>Test</TableHead>
                          <TableHead>Value</TableHead>
                          <TableHead>Match</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importDetail.results.slice(0, 50).map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-mono text-sm">
                              {r.participant_code_raw ?? '---'}
                            </TableCell>
                            <TableCell className="text-sm">
                              {r.canonical_test_name ?? r.test_name_raw ?? '---'}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {r.test_value ?? '---'} {r.test_unit ?? ''}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  r.match_status === 'auto_matched' ? 'success'
                                    : r.match_status === 'manual_matched' ? 'default'
                                      : 'destructive'
                                }
                                className="text-xs"
                              >
                                {r.match_status ?? 'unmatched'}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center py-8">
                <PageSpinner />
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
