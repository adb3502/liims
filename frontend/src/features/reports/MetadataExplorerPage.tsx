/**
 * Metadata Explorer — paginated table of participant clinical metadata.
 * Supports column visibility toggle by category. No data export.
 * 4-state: loading, error, empty, populated.
 */

import { useState, useMemo, useCallback } from 'react'
import { useCollectionSites } from '@/api/participants'
import { useMetadataTable, type MetadataRow } from '@/api/data-explorer'
import { PageSpinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { AGE_GROUP_LABELS, type AgeGroup } from '@/types'
import {
  ChevronLeft,
  ChevronRight,
  Columns3,
  ClipboardList,
} from 'lucide-react'

// ── Column definitions ─────────────────────────────────────────────────────

type ColCategory = 'Identity' | 'Demographics' | 'Vitals & Anthropometry' | 'Scores' | 'Lifestyle' | 'Addiction'

interface ColDef {
  key: keyof MetadataRow
  label: string
  category: ColCategory
  defaultVisible: boolean
  unit?: string
}

const COLUMNS: ColDef[] = [
  { key: 'participant_code', label: 'Participant', category: 'Identity', defaultVisible: true },
  { key: 'site_code', label: 'Site', category: 'Identity', defaultVisible: true },
  { key: 'age_group', label: 'Age Group', category: 'Identity', defaultVisible: true },
  { key: 'sex', label: 'Sex', category: 'Identity', defaultVisible: true },
  { key: 'computed_age', label: 'Age', category: 'Identity', defaultVisible: true, unit: 'yrs' },
  { key: 'residential_area', label: 'Residential Area', category: 'Demographics', defaultVisible: true },
  { key: 'education', label: 'Education', category: 'Demographics', defaultVisible: false },
  { key: 'occupation', label: 'Occupation', category: 'Demographics', defaultVisible: false },
  { key: 'bp_sbp', label: 'Systolic BP', category: 'Vitals & Anthropometry', defaultVisible: true, unit: 'mmHg' },
  { key: 'bp_dbp', label: 'Diastolic BP', category: 'Vitals & Anthropometry', defaultVisible: false, unit: 'mmHg' },
  { key: 'pulse_rate', label: 'Pulse', category: 'Vitals & Anthropometry', defaultVisible: false, unit: 'bpm' },
  { key: 'height_cm', label: 'Height', category: 'Vitals & Anthropometry', defaultVisible: false, unit: 'cm' },
  { key: 'weight_kg', label: 'Weight', category: 'Vitals & Anthropometry', defaultVisible: false, unit: 'kg' },
  { key: 'bmi', label: 'BMI', category: 'Vitals & Anthropometry', defaultVisible: true, unit: 'kg/m²' },
  { key: 'dass_depression', label: 'Depression', category: 'Scores', defaultVisible: true },
  { key: 'dass_anxiety', label: 'Anxiety', category: 'Scores', defaultVisible: false },
  { key: 'dass_stress', label: 'Stress', category: 'Scores', defaultVisible: false },
  { key: 'mmse_total', label: 'MMSE', category: 'Scores', defaultVisible: true },
  { key: 'frail_score', label: 'FRAIL Score', category: 'Scores', defaultVisible: false },
  { key: 'frail_category', label: 'FRAIL Category', category: 'Scores', defaultVisible: false },
  { key: 'dietary_pattern', label: 'Dietary Pattern', category: 'Lifestyle', defaultVisible: true },
  { key: 'exercise', label: 'Exercise', category: 'Lifestyle', defaultVisible: true },
  { key: 'smoking_status', label: 'Smoking', category: 'Addiction', defaultVisible: false },
  { key: 'alcohol_status', label: 'Alcohol', category: 'Addiction', defaultVisible: false },
]

const PER_PAGE = 25

function formatCellValue(col: ColDef, row: MetadataRow): React.ReactNode {
  const raw = row[col.key]
  if (raw === null || raw === undefined) return <span className="text-muted-foreground">—</span>
  if (col.key === 'participant_code') {
    return <span className="font-mono font-medium text-primary">{String(raw)}</span>
  }
  if (col.key === 'age_group') {
    const ag = raw as AgeGroup
    return <Badge variant="secondary">{AGE_GROUP_LABELS[ag] ?? ag}</Badge>
  }
  if (col.key === 'sex') {
    const s = raw as string
    return <Badge variant={s === 'M' ? 'outline' : 'secondary'}>{s === 'M' ? 'Male' : 'Female'}</Badge>
  }
  if (col.unit) {
    return <span className="tabular-nums">{String(raw)} <span className="text-xs text-muted-foreground">{col.unit}</span></span>
  }
  return <span>{String(raw)}</span>
}

// ── Column picker popover ──────────────────────────────────────────────────

const CATEGORIES: ColCategory[] = ['Identity', 'Demographics', 'Vitals & Anthropometry', 'Scores', 'Lifestyle', 'Addiction']

function ColumnPicker({
  visible,
  onChange,
  onClose,
}: {
  visible: Set<string>
  onChange: (key: string, checked: boolean) => void
  onClose: () => void
}) {
  return (
    <div
      className="absolute right-0 top-full mt-1 z-20 w-64 rounded-xl border border-border bg-background shadow-lg p-3 space-y-3"
      role="dialog"
      aria-label="Toggle columns"
    >
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold text-foreground">Visible Columns</p>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Close</button>
      </div>
      {CATEGORIES.map((cat) => {
        const cols = COLUMNS.filter((c) => c.category === cat)
        if (cols.length === 0) return null
        return (
          <div key={cat}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{cat}</p>
            <div className="space-y-1">
              {cols.map((c) => (
                <label key={c.key} className="flex items-center gap-2 cursor-pointer text-xs text-foreground hover:text-foreground/80">
                  <input
                    type="checkbox"
                    checked={visible.has(c.key)}
                    onChange={(e) => onChange(c.key, e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-input accent-primary"
                  />
                  {c.label}
                  {c.unit && <span className="text-muted-foreground">({c.unit})</span>}
                </label>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export function MetadataExplorerPage() {
  const [page, setPage] = useState(1)
  const [siteFilter, setSiteFilter] = useState('')
  const [ageFilter, setAgeFilter] = useState('')
  const [sexFilter, setSexFilter] = useState('')
  const [showColumnPicker, setShowColumnPicker] = useState(false)

  const defaultVisible = useMemo(
    () => new Set(COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key)),
    [],
  )
  const [visibleCols, setVisibleCols] = useState<Set<string>>(defaultVisible)

  const { data: sites } = useCollectionSites(true)

  const queryParams = useMemo(() => ({
    page,
    per_page: PER_PAGE,
    age_group: ageFilter ? parseInt(ageFilter) : undefined,
    sex: sexFilter || undefined,
    site: siteFilter || undefined,
  }), [page, ageFilter, sexFilter, siteFilter])

  const { data, isLoading, isError } = useMetadataTable(queryParams)

  const activeCols = useMemo(() => COLUMNS.filter((c) => visibleCols.has(c.key)), [visibleCols])

  const updateFilter = useCallback((setter: React.Dispatch<React.SetStateAction<string>>) => (val: string) => {
    setter(val)
    setPage(1)
  }, [])

  const totalPages = data?.meta ? data.meta.total_pages : 0

  const toggleCol = useCallback((key: string, checked: boolean) => {
    setVisibleCols((prev) => {
      const next = new Set(prev)
      if (checked) next.add(key)
      else next.delete(key)
      return next
    })
  }, [])

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Metadata Explorer</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.meta.total != null
              ? `${data.meta.total.toLocaleString()} participant${data.meta.total !== 1 ? 's' : ''}`
              : 'Loading...'}
          </p>
        </div>
      </div>

      {/* Filters + column picker */}
      <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center">
        {/* Site filter */}
        <select
          value={siteFilter}
          onChange={(e) => updateFilter(setSiteFilter)(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          aria-label="Filter by site"
        >
          <option value="">All Sites</option>
          {sites?.map((s) => (
            <option key={s.id} value={s.code}>{s.name}</option>
          ))}
        </select>

        {/* Age group filter */}
        <select
          value={ageFilter}
          onChange={(e) => updateFilter(setAgeFilter)(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          aria-label="Filter by age group"
        >
          <option value="">All Ages</option>
          {([1, 2, 3, 4, 5] as AgeGroup[]).map((ag) => (
            <option key={ag} value={ag}>{AGE_GROUP_LABELS[ag]}</option>
          ))}
        </select>

        {/* Sex filter */}
        <select
          value={sexFilter}
          onChange={(e) => updateFilter(setSexFilter)(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          aria-label="Filter by sex"
        >
          <option value="">All Sex</option>
          <option value="M">Male</option>
          <option value="F">Female</option>
        </select>

        {/* Column picker */}
        <div className="relative ml-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowColumnPicker((v) => !v)}
            aria-expanded={showColumnPicker}
            aria-haspopup="dialog"
          >
            <Columns3 className="h-4 w-4" />
            Columns
          </Button>
          {showColumnPicker && (
            <ColumnPicker
              visible={visibleCols}
              onChange={toggleCol}
              onClose={() => setShowColumnPicker(false)}
            />
          )}
        </div>
      </div>

      {/* Table — 4-state */}
      {isLoading ? (
        <PageSpinner />
      ) : isError ? (
        <div className="rounded-lg border border-danger/20 bg-danger/5 p-8 text-center">
          <p className="text-sm text-danger">Failed to load metadata. Please try again.</p>
        </div>
      ) : !data?.data.length ? (
        <EmptyState
          icon={<ClipboardList className="h-6 w-6" />}
          title="No metadata available"
          description="No participants with clinical metadata match the current filters."
        />
      ) : (
        <>
          <div className="rounded-lg border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {activeCols.map((col) => (
                    <TableHead key={col.key} className="whitespace-nowrap text-xs">
                      {col.label}
                      {col.unit && <span className="text-muted-foreground ml-1">({col.unit})</span>}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((row) => (
                  <TableRow key={row.participant_code}>
                    {activeCols.map((col) => (
                      <TableCell key={col.key} className={cn('text-sm', col.key === 'participant_code' && 'font-mono')}>
                        {formatCellValue(col, row)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Accessible data summary for screen readers */}
          <p className="sr-only" aria-live="polite">
            Showing page {page} of {totalPages}, {data.data.length} rows.
          </p>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages} ({data.meta.total.toLocaleString()} total)
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
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
