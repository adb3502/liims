import { useState, useMemo, useRef } from 'react'
import {
  useQueryEntities,
  useExecuteQuery,
  useExportQuery,
  type QueryFilter,
  type QueryField,
} from '@/api/query-builder'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { PageSpinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import {
  Database,
  Plus,
  Trash2,
  Play,
  Download,
  ChevronLeft,
  ChevronRight,
  Filter,
  Columns3,
} from 'lucide-react'

const OPERATOR_LABELS: Record<string, string> = {
  eq: '=',
  ne: '!=',
  gt: '>',
  lt: '<',
  gte: '>=',
  lte: '<=',
  like: 'contains',
  in: 'in',
  is_null: 'is null',
}

interface FilterRow {
  id: number
  field: string
  operator: string
  value: string
}

export function QueryBuilderPage() {
  const filterIdCounter = useRef(1)
  const { data: entities, isLoading: entitiesLoading } = useQueryEntities()
  const executeQuery = useExecuteQuery()
  const exportQuery = useExportQuery()

  const [selectedEntity, setSelectedEntity] = useState('')
  const [filters, setFilters] = useState<FilterRow[]>([])
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set())
  const [sortBy, setSortBy] = useState('')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)
  const [showColumns, setShowColumns] = useState(false)
  const perPage = 25

  const currentEntity = useMemo(
    () => entities?.find((e) => e.entity === selectedEntity),
    [entities, selectedEntity],
  )

  const fields: QueryField[] = currentEntity?.fields ?? []

  function addFilter() {
    if (!fields.length) return
    const firstField = fields[0]
    setFilters((prev) => [
      ...prev,
      {
        id: filterIdCounter.current++,
        field: firstField.name,
        operator: firstField.operators[0] ?? 'eq',
        value: '',
      },
    ])
  }

  function removeFilter(id: number) {
    setFilters((prev) => prev.filter((f) => f.id !== id))
  }

  function updateFilter(id: number, updates: Partial<FilterRow>) {
    setFilters((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f
        const updated = { ...f, ...updates }
        // Reset operator when field changes
        if (updates.field) {
          const fieldDef = fields.find((fd) => fd.name === updates.field)
          if (fieldDef && !fieldDef.operators.includes(updated.operator)) {
            updated.operator = fieldDef.operators[0] ?? 'eq'
          }
        }
        return updated
      }),
    )
  }

  function toggleColumn(col: string) {
    setSelectedColumns((prev) => {
      const next = new Set(prev)
      if (next.has(col)) next.delete(col)
      else next.add(col)
      return next
    })
  }

  function buildRequest() {
    const queryFilters: QueryFilter[] = filters
      .filter((f) => f.operator === 'is_null' || f.value.trim() !== '')
      .map((f) => ({ field: f.field, operator: f.operator, value: f.value }))

    return {
      entity: selectedEntity,
      filters: queryFilters,
      columns: selectedColumns.size > 0 ? Array.from(selectedColumns) : undefined,
      sort_by: sortBy || undefined,
      sort_order: sortOrder,
      page,
      per_page: perPage,
    }
  }

  function handleExecute() {
    if (!selectedEntity) return
    setPage(1)
    executeQuery.mutate(buildRequest())
  }

  function handleExport() {
    if (!selectedEntity) return
    exportQuery.mutate(buildRequest())
  }

  function handlePageChange(newPage: number) {
    setPage(newPage)
    executeQuery.mutate({ ...buildRequest(), page: newPage })
  }

  const result = executeQuery.data
  // Prefer server-computed total_pages; fall back to client calculation for backward compat
  const totalPages = result
    ? (result.total_pages ?? Math.ceil(result.total / result.per_page))
    : 0

  if (entitiesLoading) return <PageSpinner />

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Query Builder</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Build custom queries against study data with filters, column selection, and export.
        </p>
      </div>

      {/* Entity Selector */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-[#3674F6]" />
            <CardTitle className="text-base font-semibold">Data Source</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {(entities ?? []).map((entity) => (
              <button
                key={entity.entity}
                onClick={() => {
                  setSelectedEntity(entity.entity)
                  setFilters([])
                  setSelectedColumns(new Set())
                  setSortBy('')
                  executeQuery.reset()
                }}
                className={cn(
                  'px-4 py-2 rounded-lg border text-sm font-medium transition-all',
                  selectedEntity === entity.entity
                    ? 'border-[#3674F6] bg-[#3674F6]/10 text-[#3674F6]'
                    : 'border-border hover:border-[#3674F6]/30 hover:bg-muted/50 text-foreground',
                )}
              >
                {entity.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {selectedEntity && (
        <>
          {/* Filters */}
          <Card className="mb-4">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-[#03B6D3]" />
                  <CardTitle className="text-base font-semibold">Filters</CardTitle>
                  {filters.length > 0 && (
                    <Badge variant="secondary" className="tabular-nums">{filters.length}</Badge>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={addFilter}>
                  <Plus className="h-3.5 w-3.5" />
                  Add Filter
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {filters.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-3">
                  No filters applied. Click "Add Filter" to narrow results.
                </p>
              ) : (
                <div className="space-y-2">
                  {filters.map((filter) => {
                    const fieldDef = fields.find((f) => f.name === filter.field)
                    return (
                      <div key={filter.id} className="flex items-center gap-2">
                        <select
                          value={filter.field}
                          onChange={(e) => updateFilter(filter.id, { field: e.target.value })}
                          className="h-9 rounded-md border border-input bg-background px-2 text-sm flex-1 min-w-0"
                        >
                          {fields.map((f) => (
                            <option key={f.name} value={f.name}>{f.label}</option>
                          ))}
                        </select>

                        <select
                          value={filter.operator}
                          onChange={(e) => updateFilter(filter.id, { operator: e.target.value })}
                          className="h-9 rounded-md border border-input bg-background px-2 text-sm w-28"
                        >
                          {(fieldDef?.operators ?? ['eq']).map((op) => (
                            <option key={op} value={op}>{OPERATOR_LABELS[op] ?? op}</option>
                          ))}
                        </select>

                        {filter.operator !== 'is_null' && (
                          <Input
                            value={filter.value}
                            onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                            placeholder="Value..."
                            className="h-9 flex-1 min-w-0"
                          />
                        )}

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFilter(filter.id)}
                          className="h-9 w-9 p-0 text-muted-foreground hover:text-red-500 flex-shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Column Selector + Sort */}
          <Card className="mb-4">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Columns3 className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base font-semibold">Columns &amp; Sorting</CardTitle>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowColumns(!showColumns)}
                >
                  {showColumns ? 'Hide' : 'Show'} column picker
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 items-end mb-3">
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">Sort By</Label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm mt-1"
                  >
                    <option value="">Default</option>
                    {fields.map((f) => (
                      <option key={f.name} value={f.name}>{f.label}</option>
                    ))}
                  </select>
                </div>
                <div className="w-28">
                  <Label className="text-xs text-muted-foreground">Order</Label>
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm mt-1"
                  >
                    <option value="asc">Ascending</option>
                    <option value="desc">Descending</option>
                  </select>
                </div>
              </div>

              {showColumns && (
                <div className="border rounded-lg p-3 bg-muted/30">
                  <div className="flex flex-wrap gap-2">
                    {fields.map((f) => (
                      <label
                        key={f.name}
                        className={cn(
                          'flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs cursor-pointer transition-colors',
                          selectedColumns.has(f.name)
                            ? 'border-[#3674F6] bg-[#3674F6]/10 text-[#3674F6]'
                            : 'border-border hover:bg-muted text-muted-foreground',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={selectedColumns.has(f.name)}
                          onChange={() => toggleColumn(f.name)}
                          className="sr-only"
                        />
                        {f.label}
                      </label>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    {selectedColumns.size === 0
                      ? 'All columns will be returned'
                      : `${selectedColumns.size} column${selectedColumns.size !== 1 ? 's' : ''} selected`}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Execute */}
          <div className="flex gap-2 mb-6">
            <Button onClick={handleExecute} disabled={executeQuery.isPending}>
              <Play className="h-4 w-4" />
              {executeQuery.isPending ? 'Running...' : 'Run Query'}
            </Button>
            {result && (
              <Button variant="outline" onClick={handleExport} disabled={exportQuery.isPending}>
                <Download className="h-4 w-4" />
                {exportQuery.isPending ? 'Exporting...' : 'Export CSV'}
              </Button>
            )}
          </div>

          {/* Results */}
          {executeQuery.isPending && <PageSpinner />}

          {result && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">
                    Results
                  </CardTitle>
                  <Badge variant="secondary" className="tabular-nums">
                    {result.total.toLocaleString()} row{result.total !== 1 ? 's' : ''}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {result.rows.length === 0 ? (
                  <div className="text-center py-8">
                    <Database className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No results match your query.</p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {result.columns.map((col) => (
                              <TableHead key={col} className="whitespace-nowrap text-xs">
                                {col.replace(/_/g, ' ')}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {result.rows.map((row, ri) => (
                            <TableRow key={ri}>
                              {result.columns.map((col) => (
                                <TableCell key={col} className="whitespace-nowrap text-xs tabular-nums">
                                  {formatCellValue(row[col])}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-4 pt-4 border-t">
                        <p className="text-sm text-muted-foreground tabular-nums">
                          Page {page} of {totalPages}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={page <= 1}
                            onClick={() => handlePageChange(page - 1)}
                          >
                            <ChevronLeft className="h-4 w-4" />
                            Previous
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={page >= totalPages}
                            onClick={() => handlePageChange(page + 1)}
                          >
                            Next
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function formatCellValue(value: unknown): string {
  if (value == null) return '--'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
