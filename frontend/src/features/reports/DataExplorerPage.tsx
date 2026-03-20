/**
 * BHARAT Data Explorer — rich parameter distribution, correlation, and advanced analytics.
 * Tab navigation: Distribution | Correlation | Advanced Analytics (coming soon)
 * Cohort filter sidebar: age group, sex, site checkboxes
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import Plot from 'react-plotly.js'
// Import Plotly from same path as react-plotly.js to get the SAME instance
import PlotlyStatic from 'plotly.js/dist/plotly'
import { PageHeader } from '@/components/ui/page-header'
import { ChartCard } from '@/components/ui/chart-card'
import { cn } from '@/lib/utils'
import {
  COLORS,
  PLOTLY_LAYOUT_DEFAULTS,
  DIVERGING_BWR,
  AGE_GROUP_LABELS,
  AGE_GROUP_COLORS,
  SEX_COLORS,
  SITE_COLORS,
} from '@/lib/chart-theme'
import {
  useDataExplorerParameters,
  useDataExplorerDistribution,
  useDataExplorerCorrelation,
  useDataExplorerScatter,
  useDataExplorerCounts,
  useDataExplorerStrata,
  type DataExplorerFilters,
  type ParameterMeta,
  type CohortCounts,
  type RawDataPoint,
  type ScatterPoint,
} from '@/api/data-explorer'
import {
  FlaskConical,
  Activity,
  BarChart3,
  ChevronDown,
  ChevronRight,
  X,
  CheckSquare,
  Square,
  HelpCircle,
  Download,
  Beaker,
  Filter,
  Lock,
  ScatterChart,
} from 'lucide-react'

// ---- Constants ----

const AGE_GROUP_OPTIONS = [
  { value: '1', label: '18-29' },
  { value: '2', label: '30-44' },
  { value: '3', label: '45-59' },
  { value: '4', label: '60-74' },
  { value: '5', label: '75+' },
]

const SEX_OPTIONS = [
  { value: 'A', label: 'Male' },
  { value: 'B', label: 'Female' },
]

const CENTRE_OPTIONS = [
  { value: 'RMH', label: 'RMH - Ramaiah' },
  { value: 'BBH', label: 'BBH - Baptist' },
  { value: 'SSSSMH', label: 'SSSSMH - Muddenahalli' },
  { value: 'CHAF', label: 'CHAF - Air Force' },
  { value: 'BMC', label: 'BMC - Bangalore Medical' },
  { value: 'JSS', label: 'JSS - Mysuru' },
]

/** Centre code → Urban/Rural mapping */
const CENTRE_SITE_TYPE: Record<string, 'Urban' | 'Rural'> = {
  RMH: 'Urban', CHAF: 'Urban', BMC: 'Urban', JSS: 'Urban',
  BBH: 'Rural', SSSSMH: 'Rural',
}

const SITE_TYPE_OPTIONS = [
  { value: 'Urban', label: 'Urban' },
  { value: 'Rural', label: 'Rural' },
]

const TABS = ['Distribution', 'Scatter', 'Correlation', 'Advanced Analytics'] as const
type Tab = (typeof TABS)[number]

const CHART_TYPES = ['box', 'violin', 'half-violin', 'histogram', 'density'] as const
type ChartType = (typeof CHART_TYPES)[number]

const CHART_TYPE_LABELS: Record<ChartType, string> = {
  box: 'Box', violin: 'Violin', 'half-violin': 'Half Violin', histogram: 'Histogram', density: 'Density',
}

const GROUP_BY_OPTIONS = [
  { value: 'age_group', label: 'Age Group' },
  { value: 'sex', label: 'Sex' },
  { value: 'age_sex', label: 'Age × Sex' },
  { value: 'site', label: 'Centre' },
  { value: 'site_type', label: 'Site' },
] as const
type GroupBy = 'age_group' | 'sex' | 'age_sex' | 'site' | 'site_type'

const COLOR_PALETTES = {
  default: { label: 'Default (BHARAT)', colors: ['#3674F6', '#03B6D9', '#8B5CF6', '#F97316', '#059669', '#EC4899', '#6366F1', '#14B8A6'] },
  viridis: { label: 'Viridis', colors: ['#440154', '#482878', '#3E4A89', '#31688E', '#26828E', '#1F9E89', '#35B779', '#6DCD59', '#B4DE2C', '#FDE725'] },
  plasma: { label: 'Plasma', colors: ['#0D0887', '#4B03A1', '#7D03A8', '#A82296', '#CC4778', '#E56B5D', '#F89441', '#FDC328', '#F0F921'] },
  pastel: { label: 'Pastel', colors: ['#8DD3C7', '#FFFFB3', '#BEBADA', '#FB8072', '#80B1D3', '#FDB462', '#B3DE69', '#FCCDE5'] },
  colorblind: { label: 'Colorblind Safe', colors: ['#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7', '#999999'] },
} as const
type PaletteName = keyof typeof COLOR_PALETTES

const COLOR_BY_OPTIONS = [
  { value: 'group', label: 'Default' },
  { value: 'age_group', label: 'Age Group' },
  { value: 'sex', label: 'Sex' },
  { value: 'age_sex', label: 'Age + Sex' },
  { value: 'site', label: 'Centre' },
  { value: 'site_type', label: 'Site (Urban/Rural)' },
] as const
type ColorBy = (typeof COLOR_BY_OPTIONS)[number]['value']

const METHODS = [
  { value: 'spearman', label: 'Spearman' },
  { value: 'pearson', label: 'Pearson' },
] as const
type Method = 'spearman' | 'pearson'

// ---- Helpers ----


/** Compute Gaussian KDE for smooth density curves */
function computeKDE(values: number[], nPoints = 200): { x: number[]; y: number[] } {
  if (values.length === 0) return { x: [], y: [] }
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length
  const mean = sorted.reduce((a, b) => a + b, 0) / n
  const sd = Math.sqrt(sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1 || 1))
  // Silverman's rule of thumb for bandwidth
  const iqr = sorted[Math.floor(n * 0.75)] - sorted[Math.floor(n * 0.25)]
  const bandwidth = 1.06 * Math.min(sd, (iqr || sd) / 1.34) * Math.pow(n, -0.2)
  if (bandwidth === 0 || !isFinite(bandwidth)) return { x: [sorted[0]], y: [1] }

  const pad = 3 * bandwidth
  const xMin = sorted[0] - pad
  const xMax = sorted[n - 1] + pad
  const step = (xMax - xMin) / (nPoints - 1)
  const xs: number[] = []
  const ys: number[] = []
  const coeff = 1 / (n * bandwidth * Math.sqrt(2 * Math.PI))
  for (let i = 0; i < nPoints; i++) {
    const x = xMin + i * step
    let sum = 0
    for (let j = 0; j < n; j++) {
      const z = (x - sorted[j]) / bandwidth
      sum += Math.exp(-0.5 * z * z)
    }
    xs.push(x)
    ys.push(coeff * sum)
  }
  return { x: xs, y: ys }
}

/** Compute stats from raw values array */
function computeStats(values: number[]) {
  if (values.length === 0) return { n: 0, mean: 0, median: 0, sd: 0, q1: 0, q3: 0, min: 0, max: 0 }
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length
  const mean = sorted.reduce((a, b) => a + b, 0) / n
  const pctl = (p: number) => {
    const k = (n - 1) * p
    const f = Math.floor(k)
    return sorted[f] + (k - f) * ((sorted[f + 1] ?? sorted[f]) - sorted[f])
  }
  return {
    n,
    mean: Math.round(mean * 100) / 100,
    median: Math.round(pctl(0.5) * 100) / 100,
    sd: n > 1 ? Math.round(Math.sqrt(sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)) * 100) / 100 : 0,
    q1: Math.round(pctl(0.25) * 100) / 100,
    q3: Math.round(pctl(0.75) * 100) / 100,
    min: sorted[0],
    max: sorted[n - 1],
  }
}

// ---- Cohort Filter Sidebar ----

function CheckItem({
  label,
  checked,
  onToggle,
  color,
  count,
}: {
  label: string
  checked: boolean
  onToggle: () => void
  color?: string
  count?: number
}) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-gray-50 text-left"
      aria-pressed={checked}
    >
      {checked ? (
        <CheckSquare className="h-3.5 w-3.5 flex-shrink-0" style={{ color: color || COLORS.primary }} />
      ) : (
        <Square className="h-3.5 w-3.5 flex-shrink-0 text-gray-300" />
      )}
      {color && (
        <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      )}
      <span className="text-gray-700 flex-1">{label}</span>
      {count != null && (
        <span className="text-[10px] text-gray-400 tabular-nums">({count.toLocaleString()})</span>
      )}
    </button>
  )
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

interface FilterSidebarProps {
  filters: DataExplorerFilters
  onChange: (filters: DataExplorerFilters) => void
  counts?: CohortCounts
}

/** Get the filtered N — uses the exact backend-computed intersection count when available */
function computeFilteredN(filters: DataExplorerFilters, counts?: CohortCounts): number | undefined {
  if (!counts) return undefined
  const hasFilters =
    (filters.age_groups?.length ?? 0) > 0 ||
    (filters.sex?.length ?? 0) > 0 ||
    (filters.site_ids?.length ?? 0) > 0
  if (!hasFilters) return counts.total
  // Backend returns exact filtered_total when filters are applied
  return counts.filtered_total ?? counts.total
}

function FilterSidebar({ filters, onChange, counts }: FilterSidebarProps) {
  function toggle(field: 'age_groups' | 'sex' | 'site_ids', value: string) {
    const current = filters[field] ?? []
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value]
    onChange({ ...filters, [field]: next.length ? next : undefined })
  }

  const hasFilters =
    (filters.age_groups?.length ?? 0) > 0 ||
    (filters.sex?.length ?? 0) > 0 ||
    (filters.site_ids?.length ?? 0) > 0

  const filteredN = computeFilteredN(filters, counts)

  return (
    <div className="rounded-xl bg-white border border-gray-100 p-4 space-y-4 sticky top-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-700">Cohort Filter</p>
        {hasFilters && (
          <button
            onClick={() => onChange({})}
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] text-red-500 hover:bg-red-50 transition-colors"
          >
            <X className="h-2.5 w-2.5" />
            Reset
          </button>
        )}
      </div>

      {/* Filtered N summary */}
      {counts && (
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-center">
          <p className="text-lg font-bold tabular-nums text-gray-800">{(filteredN ?? counts.total).toLocaleString()}</p>
          <p className="text-[10px] text-gray-400">
            {hasFilters ? 'filtered participants' : 'total participants'}
          </p>
        </div>
      )}

      <FilterSection title="Age Group">
        {AGE_GROUP_OPTIONS.map((opt) => (
          <CheckItem
            key={opt.value}
            label={opt.label}
            checked={(filters.age_groups ?? []).includes(opt.value)}
            onToggle={() => toggle('age_groups', opt.value)}
            color={AGE_GROUP_COLORS[opt.value]}
            count={counts?.by_age_group[opt.value]}
          />
        ))}
      </FilterSection>

      <FilterSection title="Sex">
        {SEX_OPTIONS.map((opt) => (
          <CheckItem
            key={opt.value}
            label={opt.label}
            checked={(filters.sex ?? []).includes(opt.value)}
            onToggle={() => toggle('sex', opt.value)}
            color={opt.value === 'A' ? SEX_COLORS.Male : SEX_COLORS.Female}
            count={counts?.by_sex[opt.value]}
          />
        ))}
      </FilterSection>

      <FilterSection title="Site (Urban/Rural)">
        {SITE_TYPE_OPTIONS.map((opt) => {
          // Compute count by summing centres in this site type
          const centresInType = CENTRE_OPTIONS.filter((c) => CENTRE_SITE_TYPE[c.value] === opt.value)
          const typeCount = counts ? centresInType.reduce((s, c) => s + (counts.by_site[c.value] ?? 0), 0) : undefined
          // Check if all centres of this type are selected
          const centreCodesInType = centresInType.map((c) => c.value)
          const currentSites = filters.site_ids ?? []
          const allOfTypeSelected = centreCodesInType.every((c) => currentSites.includes(c))
          const someOfTypeSelected = centreCodesInType.some((c) => currentSites.includes(c))
          return (
            <CheckItem
              key={opt.value}
              label={opt.label}
              checked={allOfTypeSelected && centreCodesInType.length > 0}
              onToggle={() => {
                if (allOfTypeSelected || someOfTypeSelected) {
                  // Remove all centres of this type
                  const next = currentSites.filter((s) => !centreCodesInType.includes(s))
                  onChange({ ...filters, site_ids: next.length ? next : undefined })
                } else {
                  // Add all centres of this type
                  const next = [...new Set([...currentSites, ...centreCodesInType])]
                  onChange({ ...filters, site_ids: next })
                }
              }}
              color={opt.value === 'Urban' ? '#3674F6' : '#059669'}
              count={typeCount}
            />
          )
        })}
      </FilterSection>

      <FilterSection title="Centre">
        {CENTRE_OPTIONS.map((opt, i) => (
          <CheckItem
            key={opt.value}
            label={opt.label}
            checked={(filters.site_ids ?? []).includes(opt.value)}
            onToggle={() => toggle('site_ids', opt.value)}
            color={SITE_COLORS[i % SITE_COLORS.length]}
            count={counts?.by_site[opt.value]}
          />
        ))}
      </FilterSection>
    </div>
  )
}

// ---- Filter Summary Bar ----

function FilterSummaryBar({ filters, totalN }: { filters: DataExplorerFilters; totalN?: number }) {
  const hasFilters =
    (filters.age_groups?.length ?? 0) > 0 ||
    (filters.sex?.length ?? 0) > 0 ||
    (filters.site_ids?.length ?? 0) > 0

  const chips: string[] = []
  if (filters.sex?.length) {
    chips.push(filters.sex.map((s) => (s === 'A' ? 'Male' : 'Female')).join(', '))
  }
  if (filters.age_groups?.length) {
    chips.push('Age ' + filters.age_groups.map((g) => AGE_GROUP_LABELS[g] || g).join(', '))
  }
  if (filters.site_ids?.length) {
    chips.push('Centres ' + filters.site_ids.join(', '))
  }

  return (
    <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100 text-xs text-gray-600">
      <Filter className="h-3 w-3 text-gray-400 flex-shrink-0" />
      {hasFilters ? (
        <>
          <span className="text-gray-500">Filtered:</span>
          {chips.map((chip, i) => (
            <span key={i} className="inline-flex items-center rounded-full bg-white border border-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-700">
              {chip}
            </span>
          ))}
        </>
      ) : (
        <span className="text-gray-500">All participants</span>
      )}
      {totalN != null && (
        <span className="ml-auto text-gray-400 tabular-nums">N = {totalN.toLocaleString()}</span>
      )}
    </div>
  )
}

// ---- Parameter Dropdown ----

function ParameterSelect({
  parameters,
  value,
  onChange,
  placeholder,
}: {
  parameters: ParameterMeta[]
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedParam = useMemo(() => parameters.find((p) => p.key === value), [parameters, value])

  const categories = useMemo(() => {
    const map = new Map<string, ParameterMeta[]>()
    const q = search.toLowerCase().trim()
    for (const p of parameters) {
      if (q && !p.label.toLowerCase().includes(q) && !p.key.toLowerCase().includes(q) && !(p.unit && p.unit.toLowerCase().includes(q))) continue
      const arr = map.get(p.category) ?? []
      arr.push(p)
      map.set(p.category, arr)
    }
    return map
  }, [parameters, search])

  const totalFiltered = useMemo(() => {
    let n = 0
    for (const [, arr] of categories) n += arr.length
    return n
  }, [categories])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setSearch('')
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  return (
    <div className="relative" ref={containerRef}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-3 text-sm text-left focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
        aria-label={placeholder}
      >
        <span className={selectedParam ? 'text-gray-800' : 'text-gray-400'}>
          {selectedParam ? `${selectedParam.label}${selectedParam.unit ? ` (${selectedParam.unit})` : ''}` : placeholder}
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-gray-400 transition-transform', open && 'rotate-180')} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-gray-100">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type to search..."
              className="w-full rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-700 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
            />
          </div>

          {/* Options list */}
          <div className="max-h-64 overflow-y-auto">
            {totalFiltered === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-gray-400">No parameters match "{search}"</div>
            ) : (
              Array.from(categories.entries()).map(([cat, params]) => (
                <div key={cat}>
                  <div className="sticky top-0 bg-gray-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-100">
                    {cat} ({params.length})
                  </div>
                  {params.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => { onChange(p.key); setOpen(false) }}
                      className={cn(
                        'w-full text-left px-3 py-1.5 text-xs transition-colors hover:bg-primary/5',
                        p.key === value ? 'bg-primary/10 text-primary font-medium' : 'text-gray-700',
                      )}
                    >
                      {p.label} {p.unit ? <span className="text-gray-400">({p.unit})</span> : null}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ---- Pairwise matrix data type (shared between PairwiseMatrix, ExportDialog, DistributionTab) ----

interface MatrixData {
  groups: ProcessedGroup[]
  pairStats: Map<string, { eps: number; pAdj: number }>
  labels: string[]
  nPairs: number
}

/** Draw the pairwise matrix onto an existing canvas context — used for combined PNG export. */
function drawMatrixOnCanvas(
  ctx: CanvasRenderingContext2D,
  data: MatrixData,
  startY: number,
  canvasWidth: number,
  pr: number,
): number {
  const { groups, pairStats, labels, nPairs } = data
  const k = groups.length
  const pad = 16 * pr
  const titleH = 30 * pr
  const headerH = 34 * pr
  const cellH = 46 * pr
  const rowLabelW = 80 * pr
  const availW = canvasWidth - pad * 2 - rowLabelW
  const cellW = Math.min(100 * pr, availW / k)
  const tableW = rowLabelW + cellW * k
  const fs = Math.round(10 * pr)
  const fsSmall = Math.round(8.5 * pr)

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, startY, canvasWidth, titleH + headerH + cellH * k + 44 * pr)

  ctx.font = `bold ${fs + 1}px "Red Hat Display", sans-serif`
  ctx.fillStyle = '#111827'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText('Pairwise Comparisons', pad, startY + titleH * 0.6)

  const tableY = startY + titleH

  ctx.fillStyle = '#F9FAFB'
  ctx.fillRect(pad, tableY, tableW, headerH)
  ctx.strokeStyle = '#E5E7EB'
  ctx.lineWidth = 0.5 * pr
  ctx.strokeRect(pad, tableY, tableW, headerH)

  ctx.font = `bold ${fs}px "Red Hat Display", sans-serif`
  ctx.fillStyle = '#374151'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let j = 0; j < k; j++) {
    ctx.fillText(labels[j], pad + rowLabelW + cellW * j + cellW / 2, tableY + headerH / 2)
  }

  for (let i = 0; i < k; i++) {
    const rowY = tableY + headerH + cellH * i
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(pad, rowY, rowLabelW, cellH)
    ctx.strokeStyle = '#E5E7EB'
    ctx.lineWidth = 0.5 * pr
    ctx.strokeRect(pad, rowY, rowLabelW, cellH)
    ctx.font = `bold ${fs}px "Red Hat Display", sans-serif`
    ctx.fillStyle = '#374151'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(labels[i], pad + 6 * pr, rowY + cellH / 2)

    for (let j = 0; j < k; j++) {
      const cellX = pad + rowLabelW + cellW * j
      if (i === j) {
        ctx.fillStyle = '#F9FAFB'
        ctx.fillRect(cellX, rowY, cellW, cellH)
        ctx.font = `bold ${fs}px "Red Hat Display", sans-serif`
        ctx.fillStyle = '#6B7280'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(labels[i], cellX + cellW / 2, rowY + cellH / 2)
      } else if (j > i) {
        const pct = groups[i].median !== 0
          ? ((groups[j].median - groups[i].median) / Math.abs(groups[i].median)) * 100
          : 0
        const isPos = pct > 0
        const absPct = Math.abs(pct)
        const alpha = Math.min(0.85, absPct / 50)
        ctx.fillStyle = isPos ? `rgba(5,150,105,${alpha})` : `rgba(220,38,38,${alpha})`
        ctx.fillRect(cellX, rowY, cellW, cellH)
        ctx.font = `bold ${fs}px "Red Hat Display", sans-serif`
        ctx.fillStyle = absPct > 25 ? 'white' : (isPos ? '#065F46' : '#991B1B')
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(`${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`, cellX + cellW / 2, rowY + cellH / 2)
      } else {
        const s = pairStats.get(`${i}-${j}`)
        const eps = s?.eps ?? 0
        const pAdj = s?.pAdj ?? 1
        const alpha = Math.min(0.85, eps / 0.2)
        ctx.fillStyle = `rgba(54,116,246,${alpha})`
        ctx.fillRect(cellX, rowY, cellW, cellH)
        const onDark = eps > 0.12
        ctx.font = `bold ${fs}px "Red Hat Display", sans-serif`
        ctx.fillStyle = onDark ? 'white' : '#1E3A8A'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(eps.toFixed(3), cellX + cellW / 2, rowY + cellH * 0.35)
        const pText = formatPAdj(pAdj)
        const pSig = pAdj < 0.05
        ctx.font = `${fsSmall}px "Red Hat Display", sans-serif`
        ctx.fillStyle = onDark
          ? (pSig ? '#FEF08A' : 'rgba(255,255,255,0.55)')
          : (pSig ? '#1D4ED8' : '#94A3B8')
        ctx.textBaseline = 'top'
        ctx.fillText(pText, cellX + cellW / 2, rowY + cellH * 0.58)
      }
      ctx.strokeStyle = '#E5E7EB'
      ctx.lineWidth = 0.5 * pr
      ctx.strokeRect(cellX, rowY, cellW, cellH)
    }
  }

  const legendY = tableY + headerH + cellH * k + 10 * pr
  ctx.font = `${fsSmall}px "Red Hat Display", sans-serif`
  ctx.fillStyle = '#9CA3AF'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(`ε² = H/(N−1); p Bonferroni-corrected for ${nPairs} pairs`, pad, legendY)

  return legendY + fsSmall * 1.5 + pad - startY
}

// ---- Export Dialog ----

const DPI_OPTIONS = [
  { value: 1, label: '72 dpi (screen)' },
  { value: 2, label: '150 dpi (draft print)' },
  { value: 4, label: '300 dpi (publication)' },
] as const

// PlotlyStatic is the same instance react-plotly.js uses (same import path = same module)

function ExportDialog({
  plotRef,
  title,
  onClose,
  matrixData,
}: {
  plotRef: React.RefObject<HTMLDivElement | null>
  title: string
  onClose: () => void
  matrixData?: MatrixData
}) {
  const [format, setFormat] = useState<'svg' | 'png'>('png')
  const [width, setWidth] = useState(1200)
  const [height, setHeight] = useState(600)
  const [scale, setScale] = useState(4) // 300 dpi default
  const [transparent, setTransparent] = useState(false)
  const [includeMatrix, setIncludeMatrix] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Find the plotly graph div — it has ._fullData attached by Plotly.newPlot
  const getPlotEl = useCallback((): HTMLElement | null => {
    const container = plotRef.current
    if (!container) return null
    // Walk all descendants and find the one Plotly initialized (has _fullData)
    const all = container.querySelectorAll('div')
    for (const div of all) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((div as any)._fullData || (div as any)._fullLayout) return div
    }
    // Fallback: look for .js-plotly-plot class
    return container.querySelector('.js-plotly-plot') as HTMLElement | null
  }, [plotRef])

  // Helper to temporarily set background color + title for export, then restore
  const exportWithSettings = useCallback(async (
    el: HTMLElement,
    opts: { format: string; width: number; height: number; scale?: number },
    useTransparent: boolean,
    exportTitle?: string,
    isPreview?: boolean,
  ): Promise<string> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gd = el as any
    const origPaper = gd._fullLayout?.paper_bgcolor
    const origPlot = gd._fullLayout?.plot_bgcolor
    const origTitle = gd._fullLayout?.title?.text
    const origMarginT = gd._fullLayout?.margin?.t
    const origMarginB = gd._fullLayout?.margin?.b
    const origTickAngle = gd._fullLayout?.xaxis?.tickangle

    const updates: Record<string, unknown> = {}
    const restores: Record<string, unknown> = {}

    if (!useTransparent) {
      updates.paper_bgcolor = '#ffffff'
      updates.plot_bgcolor = '#ffffff'
      restores.paper_bgcolor = origPaper ?? 'rgba(0,0,0,0)'
      restores.plot_bgcolor = origPlot ?? 'rgba(0,0,0,0)'
    }
    if (exportTitle) {
      updates['title.text'] = exportTitle
      updates['title.font'] = { size: 16, color: '#1E293B', family: 'Red Hat Display, sans-serif' }
      updates['margin.t'] = 50
      restores['title.text'] = origTitle ?? ''
      restores['margin.t'] = origMarginT ?? 20
    }
    // For preview: angle x-axis labels to avoid overlap in small render
    if (isPreview) {
      updates['xaxis.tickangle'] = -35
      updates['margin.b'] = 100
      restores['xaxis.tickangle'] = origTickAngle ?? 0
      restores['margin.b'] = origMarginB ?? 120
    }

    if (Object.keys(updates).length > 0) {
      await PlotlyStatic.relayout(el, updates)
    }
    try {
      return await PlotlyStatic.toImage(el, opts)
    } finally {
      if (Object.keys(restores).length > 0) {
        await PlotlyStatic.relayout(el, restores)
      }
    }
  }, [])

  // Generate preview
  const generatePreview = useCallback(async () => {
    const el = getPlotEl()
    if (!el) {
      setError('Chart element not found')
      return
    }
    setPreviewLoading(true)
    setError(null)
    try {
      const previewW = 600
      const previewH = Math.round(previewW * (height / width))
      const dataUrl = await exportWithSettings(el, {
        format: 'png',
        width: previewW,
        height: previewH,
        scale: 1,
      }, transparent, title, true)
      setPreview(dataUrl)
    } catch (err) {
      console.error('Preview generation failed:', err)
      setError('Preview failed — try downloading directly')
      setPreview(null)
    } finally {
      setPreviewLoading(false)
    }
  }, [getPlotEl, width, height, transparent, title, exportWithSettings])

  // Generate preview on mount (with small delay to ensure plot is ready) and on settings change
  const mountRef = useRef(true)
  useEffect(() => {
    if (mountRef.current) {
      mountRef.current = false
      // Delay initial preview to ensure Plotly has fully rendered
      const timer = setTimeout(generatePreview, 300)
      return () => clearTimeout(timer)
    }
    generatePreview()
  }, [generatePreview])

  const handleExport = async () => {
    const el = getPlotEl()
    if (!el) return
    setExporting(true)
    try {
      let dataUrl: string
      if (includeMatrix && matrixData) {
        // Combined export: plot PNG + matrix canvas stacked vertically
        const pr = scale
        const plotUrl = await exportWithSettings(el, { format: 'png', width, height, scale: pr }, transparent, title)
        const plotImg = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image()
          img.onload = () => resolve(img)
          img.onerror = reject
          img.src = plotUrl
        })
        const k = matrixData.groups.length
        const matrixPxH = Math.round((30 + 34 + 46 * k + 44) * pr)
        const matrixCanvas = document.createElement('canvas')
        matrixCanvas.width = width * pr
        matrixCanvas.height = matrixPxH
        const mCtx = matrixCanvas.getContext('2d')!
        mCtx.fillStyle = transparent ? 'rgba(0,0,0,0)' : '#ffffff'
        mCtx.fillRect(0, 0, matrixCanvas.width, matrixCanvas.height)
        drawMatrixOnCanvas(mCtx, matrixData, 0, matrixCanvas.width, pr)
        const finalCanvas = document.createElement('canvas')
        finalCanvas.width = width * pr
        finalCanvas.height = plotImg.height + matrixCanvas.height
        const fCtx = finalCanvas.getContext('2d')!
        fCtx.fillStyle = transparent ? 'rgba(0,0,0,0)' : '#ffffff'
        fCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height)
        fCtx.drawImage(plotImg, 0, 0)
        fCtx.drawImage(matrixCanvas, 0, plotImg.height)
        dataUrl = finalCanvas.toDataURL('image/png')
      } else {
        dataUrl = await exportWithSettings(el, {
          format,
          width,
          height,
          scale: format === 'png' ? scale : 1,
        }, transparent, title)
      }
      const ext = includeMatrix && matrixData ? 'png' : format
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `${title.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}.${ext}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      onClose()
    } catch (err) {
      console.error('Export failed:', err)
      setError('Export failed. Check browser console.')
    } finally {
      setExporting(false)
    }
  }

  const effectivePixels = format === 'png' ? `${width * scale} × ${height * scale} px` : `${width} × ${height}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl border border-gray-200 p-5 w-96 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">Export Plot</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Format toggle */}
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Format</label>
          <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
            {(['svg', 'png'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={cn(
                  'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                  format === f
                    ? 'bg-white text-primary shadow-sm border border-gray-200'
                    : 'text-gray-500 hover:text-gray-700',
                )}
              >
                {f === 'svg' ? 'SVG (vector)' : 'PNG (raster)'}
              </button>
            ))}
          </div>
        </div>

        {/* Dimensions */}
        <div className={cn('grid gap-3', format === 'png' ? 'grid-cols-3' : 'grid-cols-2')}>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Width (px)</label>
            <input
              type="number"
              value={width}
              onChange={(e) => setWidth(Math.max(200, Math.min(6000, Number(e.target.value) || 800)))}
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs tabular-nums"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Height (px)</label>
            <input
              type="number"
              value={height}
              onChange={(e) => setHeight(Math.max(200, Math.min(4000, Number(e.target.value) || 400)))}
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs tabular-nums"
            />
          </div>
          {format === 'png' && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Resolution</label>
              <div className="relative">
                <select
                  value={scale}
                  onChange={(e) => setScale(Number(e.target.value))}
                  className="w-full appearance-none rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs"
                >
                  {DPI_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />
              </div>
            </div>
          )}
        </div>

        {/* Include matrix + background */}
        <div className="flex flex-col gap-2 -mt-1">
          {matrixData && (
            <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeMatrix}
                onChange={(e) => {
                  setIncludeMatrix(e.target.checked)
                  if (e.target.checked) setFormat('png')
                }}
                className="h-3.5 w-3.5 rounded border-gray-300 accent-primary"
              />
              Include pairwise comparison matrix
              <span className="text-[10px] text-gray-400">(PNG only)</span>
            </label>
          )}
        <div className="flex items-center justify-between">
          <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={transparent}
              onChange={(e) => setTransparent(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300 accent-primary"
            />
            Transparent background
          </label>
          <span className="text-[10px] text-gray-400">
            {effectivePixels}
            {format === 'svg' && ' · vector'}
          </span>
        </div>
        </div>

        {/* Live preview */}
        <div
          className="border border-gray-200 rounded-lg overflow-hidden flex items-center justify-center"
          style={{ aspectRatio: `${width} / ${height}`, maxHeight: 220, background: transparent ? 'repeating-conic-gradient(#e5e7eb 0% 25%, white 0% 50%) 50% / 12px 12px' : '#f9fafb' }}
        >
          {previewLoading ? (
            <div className="h-4 w-4 rounded-full border-2 border-gray-200 border-t-primary animate-spin" />
          ) : preview ? (
            <img src={preview} alt="Plot preview" className="w-full h-full object-contain" />
          ) : error ? (
            <span className="text-[10px] text-red-400">{error}</span>
          ) : (
            <span className="text-[10px] text-gray-400">No preview available</span>
          )}
        </div>

        <button
          onClick={handleExport}
          disabled={exporting}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary text-white py-2 text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          {exporting ? 'Exporting...' : `Download ${format.toUpperCase()}`}
        </button>
      </div>
    </div>
  )
}

// ---- Distribution Tab ----

function lightenColor(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const nr = Math.round(r + (255 - r) * amount)
  const ng = Math.round(g + (255 - g) * amount)
  const nb = Math.round(b + (255 - b) * amount)
  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`
}

function getGroupColor(groupBy: GroupBy, groupKey: string, index: number): string {
  if (groupBy === 'age_group') return AGE_GROUP_COLORS[groupKey] || COLORS.primary
  if (groupBy === 'sex') return groupKey === 'A' || groupKey === 'Male' ? SEX_COLORS.Male : SEX_COLORS.Female
  if (groupBy === 'site_type') return groupKey === 'Urban' ? '#3674F6' : '#059669'
  if (groupBy === 'age_sex') {
    const ageNum = groupKey.slice(0, -1)
    const isMale = groupKey.endsWith('A')
    const base = AGE_GROUP_COLORS[ageNum] || COLORS.primary
    return isMale ? base : lightenColor(base, 0.38)
  }
  return SITE_COLORS[index % SITE_COLORS.length]
}

function getGroupLabel(groupBy: GroupBy, groupKey: string): string {
  if (groupBy === 'age_group') return AGE_GROUP_LABELS[groupKey] || groupKey
  if (groupBy === 'sex') return groupKey === 'A' ? 'Male' : groupKey === 'B' ? 'Female' : groupKey
  if (groupBy === 'age_sex') {
    const ageNum = groupKey.slice(0, -1)  // '1A' → '1'
    const isMale = groupKey.endsWith('A')
    return `${AGE_GROUP_LABELS[ageNum] || ageNum} ${isMale ? '♂' : '♀'}`
  }
  return groupKey
}

function getPaletteColor(groupBy: GroupBy, groupKey: string, index: number, paletteName: PaletteName): string {
  if (paletteName !== 'default') {
    const pal = COLOR_PALETTES[paletteName].colors
    return pal[index % pal.length]
  }
  return getGroupColor(groupBy, groupKey, index)
}

/** Get per-point color based on colorBy dimension */
function getPointColor(pt: RawDataPoint, colorByDim: ColorBy, palette: PaletteName): string {
  if (colorByDim === 'age_group') {
    const key = String(pt.age_group)
    return palette !== 'default' ? COLOR_PALETTES[palette].colors[(pt.age_group - 1) % COLOR_PALETTES[palette].colors.length] : (AGE_GROUP_COLORS[key] || COLORS.primary)
  }
  if (colorByDim === 'sex') {
    return palette !== 'default' ? COLOR_PALETTES[palette].colors[pt.sex === 'A' ? 0 : 1] : (pt.sex === 'A' ? SEX_COLORS.Male : SEX_COLORS.Female)
  }
  if (colorByDim === 'site') {
    const siteIdx = CENTRE_OPTIONS.findIndex((s) => s.value === pt.site_code)
    return palette !== 'default' ? COLOR_PALETTES[palette].colors[(siteIdx >= 0 ? siteIdx : 0) % COLOR_PALETTES[palette].colors.length] : SITE_COLORS[(siteIdx >= 0 ? siteIdx : 0) % SITE_COLORS.length]
  }
  if (colorByDim === 'site_type') {
    const siteType = CENTRE_SITE_TYPE[pt.site_code ?? ''] ?? 'Urban'
    return palette !== 'default' ? COLOR_PALETTES[palette].colors[siteType === 'Urban' ? 0 : 1] : (siteType === 'Urban' ? '#3674F6' : '#059669')
  }
  if (colorByDim === 'age_sex') {
    // 10 combos: 5 age groups × 2 sexes
    const idx = ((pt.age_group - 1) * 2 + (pt.sex === 'A' ? 0 : 1))
    const defaultColors = ['#3674F6', '#EC4899', '#03B6D9', '#F472B6', '#8B5CF6', '#F97316', '#059669', '#DC2626', '#6366F1', '#14B8A6']
    return palette !== 'default' ? COLOR_PALETTES[palette].colors[idx % COLOR_PALETTES[palette].colors.length] : defaultColors[idx % defaultColors.length]
  }
  return COLORS.primary
}

/** Build rich hover text for a raw data point */
function buildPointHoverText(pt: RawDataPoint): string {
  const age = AGE_GROUP_LABELS[String(pt.age_group)] || String(pt.age_group)
  const sex = pt.sex === 'A' ? 'Male' : pt.sex === 'B' ? 'Female' : pt.sex
  const centre = pt.site_code || 'Unknown'
  const siteType = CENTRE_SITE_TYPE[pt.site_code ?? ''] ?? 'Unknown'
  return [
    `<b>${pt.participant_code}</b>`,
    `Value: ${pt.value.toFixed(2)}`,
    `Age: ${age} | Sex: ${sex}`,
    `Centre: ${centre} | Site: ${siteType}`,
  ].join('<br>')
}

/** Get human-readable color category label for a data point */
function getColorCategory(pt: RawDataPoint, colorByDim: ColorBy): string {
  if (colorByDim === 'age_group') return AGE_GROUP_LABELS[String(pt.age_group)] || String(pt.age_group)
  if (colorByDim === 'sex') return pt.sex === 'A' ? 'Male' : 'Female'
  if (colorByDim === 'age_sex') {
    const age = AGE_GROUP_LABELS[String(pt.age_group)] || String(pt.age_group)
    const sex = pt.sex === 'A' ? 'M' : 'F'
    return `${age} ${sex}`
  }
  if (colorByDim === 'site') return pt.site_code || 'Unknown'
  if (colorByDim === 'site_type') return CENTRE_SITE_TYPE[pt.site_code ?? ''] ?? 'Unknown'
  return ''
}

/** Deterministic jitter for scatter overlays — stable across re-renders.
 *  densityScale (0-1) narrows the spread at the tails to match violin shape. */
function deterministicJitter(pointIndex: number, groupIndex: number, offset = 0, spread = 0.15, densityScale = 1): number {
  const seed = ((pointIndex * 2654435761 + groupIndex * 1597334677) >>> 0) % 10000
  return offset + (seed / 10000 - 0.5) * spread * densityScale
}

/** X-axis position for age_sex groups: pairs are clustered with 0.7 gap inside a group,
 *  1.1 gap between age groups (index 0=1M,1=1F,2=2M,3=2F,...,8=5M,9=5F) */
function getAgeSexXPos(groupIndex: number): number {
  const ageIdx = Math.floor(groupIndex / 2)
  const isFemale = groupIndex % 2 === 1
  return ageIdx * 1.8 + (isFemale ? 0.7 : 0)
}

/** Build a fast density lookup: for each value in `values`, return 0-1 scale
 *  representing local density (1 = densest region, ~0 = sparse tails).
 *  Uses a simple binned histogram approach for speed. */
function buildDensityScales(values: number[]): number[] {
  if (values.length < 3) return values.map(() => 1)
  const sorted = [...values].sort((a, b) => a - b)
  const min = sorted[0], max = sorted[sorted.length - 1]
  const range = max - min
  if (range === 0) return values.map(() => 1)
  const nBins = Math.max(10, Math.min(30, Math.round(values.length / 5)))
  const binWidth = range / nBins
  const bins = new Array(nBins).fill(0)
  for (const v of values) {
    const b = Math.min(Math.floor((v - min) / binWidth), nBins - 1)
    bins[b]++
  }
  // Smooth bins with a 3-wide moving average
  const smooth = bins.map((_, i) => {
    const lo = Math.max(0, i - 1), hi = Math.min(nBins - 1, i + 1)
    let sum = 0, cnt = 0
    for (let j = lo; j <= hi; j++) { sum += bins[j]; cnt++ }
    return sum / cnt
  })
  const maxBin = Math.max(...smooth)
  // Map each value to its smoothed density (0-1), with a floor so tails aren't invisible
  return values.map((v) => {
    const b = Math.min(Math.floor((v - min) / binWidth), nBins - 1)
    return Math.max(0.15, smooth[b] / maxBin)
  })
}

/** Kruskal-Wallis H statistic + epsilon-squared for exactly two groups.
 *  ε² = H / (N − 1). H ~ χ²(1) → p-value via chi-squared survival function. */
function computeKwPair(vals1: number[], vals2: number[]): { eps: number; H: number; pRaw: number } {
  const n1 = vals1.length
  const n2 = vals2.length
  const N = n1 + n2
  if (n1 < 2 || n2 < 2) return { eps: 0, H: 0, pRaw: 1 }
  const combined = [
    ...vals1.map((v) => ({ v, g: 0 })),
    ...vals2.map((v) => ({ v, g: 1 })),
  ].sort((a, b) => a.v - b.v)
  const ranks = new Array(N).fill(0)
  let i = 0
  while (i < N) {
    let j = i
    while (j < N - 1 && combined[j + 1].v === combined[j].v) j++
    const avgRank = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) ranks[k] = avgRank
    i = j + 1
  }
  let R1 = 0
  for (let k = 0; k < N; k++) if (combined[k].g === 0) R1 += ranks[k]
  const R2 = (N * (N + 1)) / 2 - R1
  const H = Math.max(0, (12 / (N * (N + 1))) * (R1 * R1 / n1 + R2 * R2 / n2) - 3 * (N + 1))
  const eps = Math.min(1, H / (N - 1))
  // p-value: H ~ chi²(1). Use p = erfc(sqrt(H/2)) via erfc approximation.
  const pRaw = erfcApprox(Math.sqrt(H / 2))
  return { eps, H, pRaw }
}

/** Complementary error function approximation (Horner form, max error < 1.5e-7) */
function erfcApprox(x: number): number {
  if (x < 0) return 2 - erfcApprox(-x)
  const t = 1 / (1 + 0.3275911 * x)
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))))
  return poly * Math.exp(-x * x)
}

/** Format Bonferroni-corrected p-value for display */
function formatPAdj(p: number): string {
  if (p >= 0.05) return 'ns'
  if (p < 0.0001) return 'p < 0.0001'
  if (p < 0.001) return `p = ${p.toFixed(4)}`
  return `p = ${p.toFixed(3)}`
}

interface ProcessedGroup {
  group: string
  values: number[]
  median: number
  n: number
  [key: string]: unknown
}

function PairwiseMatrix({
  groups,
  pairStats,
  groupBy,
  nPairs,
}: {
  groups: ProcessedGroup[]
  pairStats: Map<string, { eps: number; pAdj: number }>
  groupBy: GroupBy
  nPairs: number
}) {
  if (groups.length < 2) return null

  const labels = groups.map((g) => getGroupLabel(groupBy, g.group))

  return (
    <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-xs font-semibold text-gray-700">Pairwise Comparisons</h3>
        <p className="text-[10px] text-gray-400 mt-0.5">
          Lower triangle: KW ε² effect size with Bonferroni-corrected p-value.
          Upper triangle: % change in median (column vs row).
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="text-xs border-collapse" aria-label="Pairwise comparison matrix">
          <thead>
            <tr>
              <th className="px-3 py-2.5 text-left text-gray-400 font-medium border-b border-gray-100" />
              {labels.map((lbl, j) => (
                <th
                  key={j}
                  className="px-3 py-2.5 text-center font-semibold text-gray-700 border-b border-gray-100 whitespace-nowrap"
                >
                  {lbl}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {groups.map((rowGroup, i) => (
              <tr key={i}>
                <td className="px-3 py-2.5 font-semibold text-gray-700 whitespace-nowrap border-r border-gray-100">
                  {labels[i]}
                </td>
                {groups.map((colGroup, j) => {
                  if (i === j) {
                    return (
                      <td key={j} className="px-3 py-2.5 text-center bg-gray-50 text-gray-500 font-semibold">
                        {labels[i]}
                      </td>
                    )
                  }

                  if (j > i) {
                    // Upper triangle — % change in median
                    const pct =
                      rowGroup.median !== 0
                        ? ((colGroup.median - rowGroup.median) / Math.abs(rowGroup.median)) * 100
                        : 0
                    const isPos = pct > 0
                    const absPct = Math.abs(pct)
                    const alpha = Math.min(0.85, absPct / 50)
                    const bg = isPos ? `rgba(5,150,105,${alpha})` : `rgba(220,38,38,${alpha})`
                    const textColor = absPct > 25 ? 'white' : isPos ? '#065F46' : '#991B1B'
                    return (
                      <td
                        key={j}
                        className="px-3 py-2.5 text-center tabular-nums font-semibold"
                        style={{ backgroundColor: bg, color: textColor }}
                        title={`% median change from ${labels[i]} to ${labels[j]}`}
                      >
                        {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                      </td>
                    )
                  }

                  // Lower triangle — ε² + corrected p-value
                  const stats = pairStats.get(`${i}-${j}`)!
                  const { eps, pAdj } = stats
                  const alpha = Math.min(0.85, eps / 0.2)
                  const bg = `rgba(54,116,246,${alpha})`
                  const onDark = eps > 0.12
                  const textColor = onDark ? 'white' : '#1E3A8A'
                  const pText = formatPAdj(pAdj)
                  const pSig = pAdj < 0.05
                  return (
                    <td
                      key={j}
                      className="px-3 py-2 text-center tabular-nums"
                      style={{ backgroundColor: bg, color: textColor }}
                      title={`ε² = ${eps.toFixed(3)}, p_adj = ${pAdj.toFixed(4)} (Bonferroni, ${nPairs} pairs)`}
                    >
                      <div className="font-semibold leading-tight">{eps.toFixed(3)}</div>
                      <div
                        className="text-[10px] leading-tight mt-0.5"
                        style={{ color: onDark ? (pSig ? '#FEF08A' : 'rgba(255,255,255,0.6)') : (pSig ? '#1D4ED8' : '#94A3B8') }}
                      >
                        {pText}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="px-4 py-3 border-t border-gray-100 flex flex-wrap gap-x-6 gap-y-2">
        {/* Effect size gradient */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-gray-500 tracking-wider">
            ε<sup>2</sup> EFFECT SIZE
          </span>
          <div
            className="h-3 rounded"
            style={{
              width: 160,
              background: 'linear-gradient(to right, rgba(54,116,246,0), rgba(54,116,246,0.3) 30%, rgba(54,116,246,0.7) 70%, rgba(54,116,246,0.85))',
            }}
          />
          <div className="relative text-[9px] text-gray-400" style={{ width: 160, height: 14 }}>
            <span className="absolute left-0">0</span>
            <span className="absolute" style={{ left: '30%', transform: 'translateX(-50%)' }}>0.06</span>
            <span className="absolute" style={{ left: '70%', transform: 'translateX(-50%)' }}>0.14</span>
            <span className="absolute right-0">1</span>
          </div>
          <div className="relative text-[9px] text-gray-400" style={{ width: 160, height: 13 }}>
            <span className="absolute" style={{ left: '8%', transform: 'translateX(-50%)' }}>negligible</span>
            <span className="absolute" style={{ left: '50%', transform: 'translateX(-50%)' }}>small</span>
            <span className="absolute" style={{ left: '85%', transform: 'translateX(-50%)' }}>large</span>
          </div>
        </div>

        <div className="w-px bg-gray-100 self-stretch" />

        {/* % change gradient */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">% median change</span>
          <div className="flex items-center gap-1.5">
            <div className="flex h-3 rounded overflow-hidden" style={{ width: 120 }}>
              {[0.85, 0.6, 0.3, 0.05, 0.3, 0.6, 0.85].map((a, idx) => (
                <div
                  key={idx}
                  className="flex-1"
                  style={{ backgroundColor: idx < 3 ? `rgba(220,38,38,${a})` : idx === 3 ? '#f9fafb' : `rgba(5,150,105,${a})` }}
                />
              ))}
            </div>
          </div>
          <div className="flex text-[9px] text-gray-400 gap-3 justify-between" style={{ width: 120 }}>
            <span>−50%+</span><span>0</span><span>+50%+</span>
          </div>
        </div>

        <div className="w-px bg-gray-100 self-stretch" />

        {/* p-value key */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">p-value (Bonferroni)</span>
          <div className="flex flex-col gap-0.5 text-[10px] text-gray-500">
            <span><span className="font-semibold text-blue-700">p &lt; 0.05</span> — significant</span>
            <span><span className="font-semibold text-gray-400">ns</span> — not significant (p ≥ 0.05)</span>
          </div>
        </div>
      </div>

      <p className="px-4 pb-2 text-[10px] text-gray-400">
        ε² = H / (N − 1) where H is the Kruskal-Wallis statistic. p-values from χ²(1) distribution, Bonferroni-corrected for {nPairs} pairwise comparisons.
        Computed on outlier-filtered values.
      </p>
    </div>
  )
}

function DistributionTab({
  parameters,
  filters,
}: {
  parameters: ParameterMeta[]
  filters: DataExplorerFilters
}) {
  const [parameter, setParameter] = useState('')
  const [chartType, setChartType] = useState<ChartType>('violin')
  const [groupBy, setGroupBy] = useState<GroupBy>('age_group')
  const [colorBy, setColorBy] = useState<ColorBy>('group')
  const [palette, setPalette] = useState<PaletteName>('default')
  const [showPoints, setShowPoints] = useState(true)
  const [pointsSide, setPointsSide] = useState(false)
  const [removeOutliers, setRemoveOutliers] = useState(true)
  const [showGridlines, setShowGridlines] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [showSigBars, setShowSigBars] = useState(false)
  const [strataBy, setStrataBy] = useState('')
  const plotContainerRef = useRef<HTMLDivElement>(null)

  const { data: strataOptions } = useDataExplorerStrata()

  // For violin/box/density we always fetch with chartType='box' to get raw values
  const fetchType = chartType === 'histogram' ? 'histogram' : 'box'
  // site_type and age_sex are frontend-only groupings — fetch by site/age_group and regroup client-side
  const apiGroupBy = groupBy === 'site_type' ? 'site' : groupBy === 'age_sex' ? 'age_group' : groupBy

  const { data: rawApiData, isLoading, isError } = useDataExplorerDistribution(
    parameter,
    fetchType,
    apiGroupBy as 'age_group' | 'sex' | 'site',
    filters,
    !!parameter,
    strataBy || undefined,
  )

  // For site_type/age_sex grouping, re-derive groups from rawData by Urban/Rural or age+sex
  const data = useMemo(() => {
    if (!rawApiData) return undefined
    if (groupBy === 'site_type') {
      // Regroup raw data by urban/rural
      if (!rawApiData.rawData?.length) return rawApiData
      const typeMap = new Map<string, { values: number[]; pts: RawDataPoint[] }>()
      for (const pt of rawApiData.rawData) {
        const sType = CENTRE_SITE_TYPE[pt.site_code ?? ''] ?? 'Unknown'
        const entry = typeMap.get(sType) ?? { values: [], pts: [] }
        entry.values.push(pt.value)
        entry.pts.push(pt)
        typeMap.set(sType, entry)
      }
      const groups = Array.from(typeMap.entries()).map(([sType, { values }]) => {
        const stats = computeStats(values)
        return { group: sType, label: sType, ...stats, values }
      })
      return { ...rawApiData, groups, rawData: rawApiData.rawData }
    }
    if (groupBy === 'age_sex') {
      // Regroup raw data by age_group + sex (key = e.g. "1M", "1F")
      if (!rawApiData.rawData?.length) return rawApiData
      const ageSexMap = new Map<string, number[]>()
      for (const pt of rawApiData.rawData) {
        const key = `${pt.age_group}${pt.sex}`
        const arr = ageSexMap.get(key) ?? []
        arr.push(pt.value)
        ageSexMap.set(key, arr)
      }
      // Sort keys: by age group number, then A (Male) before B (Female)
      const sortedKeys = Array.from(ageSexMap.keys()).sort((a, b) => {
        const ageA = parseInt(a)
        const ageB = parseInt(b)
        if (ageA !== ageB) return ageA - ageB
        // 'A' (Male) before 'B' (Female)
        return a.slice(-1) < b.slice(-1) ? -1 : 1
      })
      const groups = sortedKeys.map((key) => {
        const values = ageSexMap.get(key)!
        const stats = computeStats(values)
        return { group: key, label: key, ...stats, values }
      })
      return { ...rawApiData, groups, rawData: rawApiData.rawData }
    }
    return rawApiData
  }, [rawApiData, groupBy])

  const selectedMeta = useMemo(
    () => parameters.find((p) => p.key === parameter),
    [parameters, parameter],
  )

  // Build per-group raw data point arrays (for hover IDs and color-by)
  const groupedRawData = useMemo(() => {
    if (!data?.rawData) return new Map<string, RawDataPoint[]>()
    const map = new Map<string, RawDataPoint[]>()
    for (const pt of data.rawData) {
      let gKey: string
      if (groupBy === 'age_group') gKey = String(pt.age_group)
      else if (groupBy === 'sex') gKey = pt.sex
      else if (groupBy === 'site_type') gKey = CENTRE_SITE_TYPE[pt.site_code ?? ''] ?? 'Unknown'
      else if (groupBy === 'age_sex') gKey = `${pt.age_group}${pt.sex}`
      else gKey = pt.site_code || 'Unknown'
      const arr = map.get(gKey) ?? []
      arr.push(pt)
      map.set(gKey, arr)
    }
    return map
  }, [data?.rawData, groupBy])

  // Apply outlier removal to each group's values
  // Use rawData as source of truth so values and points stay in sync
  const processedGroups = useMemo(() => {
    if (!data) return []
    return data.groups.map((g) => {
      const rawPts = groupedRawData.get(g.group) ?? []
      // If we have rawPts, derive values from them to guarantee sync
      let values: number[] = rawPts.length > 0 ? rawPts.map((pt) => pt.value) : (g.values ?? [])
      let points = rawPts.length > 0 ? [...rawPts] : []
      if (removeOutliers && values.length >= 4) {
        const sorted = [...values].sort((a, b) => a - b)
        const n = sorted.length
        const q1 = sorted[Math.floor(n * 0.25)]
        const q3 = sorted[Math.floor(n * 0.75)]
        const iqr = q3 - q1
        const lower = q1 - 1.5 * iqr
        const upper = q3 + 1.5 * iqr
        if (points.length === values.length) {
          const filtered = values.map((v, i) => ({ v, pt: points[i] })).filter(({ v }) => v >= lower && v <= upper)
          values = filtered.map(({ v }) => v)
          points = filtered.map(({ pt }) => pt)
        } else {
          values = values.filter((v) => v >= lower && v <= upper)
        }
      }
      const stats = removeOutliers ? computeStats(values) : g
      return { ...g, values, rawPoints: points, ...stats }
    })
  }, [data, removeOutliers, groupedRawData])

  const plotData = useMemo(() => {
    if (processedGroups.length === 0) return []

    // Box and violin — always use scatter overlay for points so positioning
    // is identical regardless of Color By setting (Plotly native marker.color
    // on box/violin doesn't support per-point color string arrays).
    const isBoxOrViolin = chartType === 'box' || chartType === 'violin' || chartType === 'half-violin'
    if (isBoxOrViolin) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const shapeTraces: any[] = []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pointTraces: any[] = []
      const useColorBy = colorBy !== 'group'
      const side = pointsSide
      const isHalfViolin = chartType === 'half-violin'
      const colorLegendShown = new Set<string>()

      // Scatter offset tuned to mimic Plotly's native jitter aesthetic
      let ptOffset: number
      let ptSpread: number
      if (chartType === 'box') {
        ptOffset = side ? -0.3 : 0
        ptSpread = side ? 0.2 : 0.3
      } else if (isHalfViolin) {
        ptOffset = -0.15
        ptSpread = 0.15
      } else {
        ptOffset = side ? -0.4 : 0
        ptSpread = side ? 0.2 : 0.3
      }

      processedGroups.forEach((g, i) => {
        const xPos = groupBy === 'age_sex' ? getAgeSexXPos(i) : i
        const color = getPaletteColor(groupBy, g.group, i, palette)
        const label = getGroupLabel(groupBy, g.group)

        if (chartType === 'box') {
          const boxX = (side && showPoints) ? xPos + 0.1 : xPos
          shapeTraces.push({
            type: 'box' as const,
            name: label,
            x: g.values.map(() => boxX),
            y: g.values,
            width: (side && showPoints) ? 0.4 : 0.5,
            boxpoints: false as const,
            marker: { color, size: 4, opacity: 0.7 },
            line: { color },
            fillcolor: `${color}33`,
            hovertemplate:
              `<b>${label}</b><br>` +
              `Median: %{median:.2f}<br>` +
              `Q1-Q3: ${g.q1.toFixed(2)}-${g.q3.toFixed(2)}<br>` +
              `Mean: ${g.mean.toFixed(2)} \u00b1 ${g.sd.toFixed(2)}<br>` +
              `N: ${g.n}<extra></extra>`,
          })
        } else {
          const useHalfSide = isHalfViolin
          shapeTraces.push({
            type: 'violin' as const,
            name: label,
            x: g.values.map(() => xPos),
            y: g.values,
            scalegroup: label,
            width: useHalfSide ? 0.55 : 0.6,
            side: useHalfSide ? ('positive' as const) : undefined,
            box: { visible: true },
            meanline: { visible: true },
            points: false as const,
            marker: { color, size: 4, opacity: 0.7 },
            line: { color },
            fillcolor: `${color}33`,
            hovertemplate: `<b>${label}</b><br>N: ${g.n}<extra></extra>`,
          })
        }

        // Scatter overlay for points — always used (both Default and Color By)
        // Density-scaled jitter: points spread wider where the violin is fat
        if (showPoints && g.rawPoints.length > 0) {
          const densityScales = buildDensityScales(g.rawPoints.map((p) => p.value))

          if (useColorBy) {
            // Group points by category, preserving original index for density lookup
            const catMap = new Map<string, Array<{ pt: RawDataPoint; idx: number }>>()
            for (let k = 0; k < g.rawPoints.length; k++) {
              const pt = g.rawPoints[k]
              const cat = getColorCategory(pt, colorBy)
              const arr = catMap.get(cat) ?? []
              arr.push({ pt, idx: k })
              catMap.set(cat, arr)
            }
            for (const [cat, entries] of catMap) {
              const catColor = getPointColor(entries[0].pt, colorBy, palette)
              const isFirst = !colorLegendShown.has(cat)
              if (isFirst) colorLegendShown.add(cat)
              pointTraces.push({
                type: 'scatter' as const,
                mode: 'markers' as const,
                x: entries.map((e, j) => xPos + deterministicJitter(j, i, ptOffset, ptSpread, densityScales[e.idx])),
                y: entries.map((e) => e.pt.value),
                marker: { color: catColor, size: 4, opacity: 0.6, line: { width: 0, color: 'transparent' } },
                name: cat,
                showlegend: isFirst,
                legendgroup: `color_${cat}`,
                text: entries.map((e) => buildPointHoverText(e.pt)),
                hovertemplate: '%{text}<extra></extra>',
              })
            }
          } else {
            // Default: all points same color as the group
            pointTraces.push({
              type: 'scatter' as const,
              mode: 'markers' as const,
              x: g.rawPoints.map((_, j) => xPos + deterministicJitter(j, i, ptOffset, ptSpread, densityScales[j])),
              y: g.rawPoints.map((p) => p.value),
              marker: { color, size: 4, opacity: 0.6, line: { width: 0, color: 'transparent' } },
              name: label,
              showlegend: false,
              text: g.rawPoints.map(buildPointHoverText),
              hovertemplate: '%{text}<extra></extra>',
            })
          }
        }
      })

      return [...shapeTraces, ...pointTraces]
    }

    if (chartType === 'density') {
      return processedGroups.map((g, i) => {
        const color = getPaletteColor(groupBy, g.group, i, palette)
        const kde = computeKDE(g.values)
        return {
          type: 'scatter' as const,
          mode: 'lines' as const,
          name: getGroupLabel(groupBy, g.group),
          x: kde.x,
          y: kde.y,
          fill: 'tozeroy' as const,
          line: { color, width: 2 },
          fillcolor: `${color}22`,
          hovertemplate:
            `<b>${getGroupLabel(groupBy, g.group)}</b><br>` +
            `Value: %{x:.2f}<br>Density: %{y:.4f}<br>` +
            `N: ${g.n}<extra></extra>`,
        }
      })
    }

    // histogram
    return processedGroups.map((g, i) => {
      const color = getPaletteColor(groupBy, g.group, i, palette)
      return {
        type: 'histogram' as const,
        name: getGroupLabel(groupBy, g.group),
        x: g.values,
        opacity: 0.7,
        marker: { color },
        hovertemplate: `<b>${getGroupLabel(groupBy, g.group)}</b><br>Count: %{y}<extra></extra>`,
      }
    })
  }, [processedGroups, chartType, groupBy, colorBy, palette, showPoints, pointsSide])

  // N annotations for box/violin — shown below each trace (numeric x positions)
  const annotations = useMemo((): object[] => {
    if (processedGroups.length === 0 || chartType === 'histogram' || chartType === 'density') return []
    const result = processedGroups.map((g, i) => ({
      x: groupBy === 'age_sex' ? getAgeSexXPos(i) : i,
      y: -0.15,
      xref: 'x' as const,
      yref: 'paper' as const,
      text: `n=${g.n.toLocaleString()}`,
      showarrow: false,
      font: { size: 10, color: '#1E293B', family: '"Red Hat Display", sans-serif' },
      xanchor: 'center' as const,
    }))
    if (groupBy === 'age_sex' && processedGroups.length > 0) {
      const AGE_LABELS = ['18–29', '30–44', '45–59', '60–74', '75+']
      for (let ag = 0; ag < 5; ag++) {
        const mPos = getAgeSexXPos(ag * 2)
        const fPos = getAgeSexXPos(ag * 2 + 1)
        result.push({
          x: (mPos + fPos) / 2,
          y: -0.26,
          xref: 'x' as const,
          yref: 'paper' as const,
          text: AGE_LABELS[ag],
          showarrow: false,
          font: { size: 10, color: '#374151', family: '"Red Hat Display", sans-serif' },
          xanchor: 'center' as const,
        })
      }
    }
    return result
  }, [processedGroups, chartType, groupBy])

  const nPairs = useMemo(() => {
    const k = processedGroups.length
    return (k * (k - 1)) / 2
  }, [processedGroups.length])

  const pairStats = useMemo(() => {
    const k = processedGroups.length
    const map = new Map<string, { eps: number; pAdj: number }>()
    for (let a = 0; a < k; a++) {
      for (let b = 0; b < a; b++) {
        const { eps, pRaw } = computeKwPair(processedGroups[a].values, processedGroups[b].values)
        map.set(`${a}-${b}`, { eps, pAdj: Math.min(1, pRaw * nPairs) })
      }
    }
    return map
  }, [processedGroups, nPairs])

  const statsRows = useMemo(() => {
    return processedGroups.map((g) => {
      const ciMargin = g.n > 0 ? 1.96 * (g.sd / Math.sqrt(g.n)) : 0
      return {
        group: getGroupLabel(groupBy, g.group),
        n: g.n,
        mean: g.mean,
        median: g.median,
        sd: g.sd,
        q1: g.q1,
        q3: g.q3,
        min: g.min,
        max: g.max,
        ciLow: g.mean - ciMargin,
        ciHigh: g.mean + ciMargin,
      }
    })
  }, [processedGroups, groupBy])

  const unit = selectedMeta?.unit ?? ''
  const isXOriented = chartType === 'histogram' || chartType === 'density'

  const sigBarElements = useMemo(() => {
    const empty = { shapes: [] as object[], annotations: [] as object[], yMax: null as number | null }
    if (!showSigBars || processedGroups.length < 2 || isXOriented) return empty
    const allVals = processedGroups.flatMap((g) => g.values)
    if (!allVals.length) return empty
    const allMax = Math.max(...allVals)
    const allMin = Math.min(...allVals)
    const range = Math.max(allMax - allMin, 1)
    const step = range * 0.09
    const baseY = allMax + range * 0.04
    const shapes: object[] = []
    const annots: object[] = []
    for (let gi = 1; gi < processedGroups.length; gi++) {
      const s = pairStats.get(`${gi}-0`)
      if (!s) continue
      const label = s.pAdj < 0.001 ? '***' : s.pAdj < 0.01 ? '**' : s.pAdj < 0.05 ? '*' : 'ns'
      const isSig = label !== 'ns'
      const y = baseY + step * (gi - 1)
      const color = isSig ? '#374151' : '#9CA3AF'
      const lw = isSig ? 1.5 : 1
      const x0 = 0  // reference group is always index 0, xPos = getAgeSexXPos(0) = 0
      const x1 = groupBy === 'age_sex' ? getAgeSexXPos(gi) : gi
      const cx = (x0 + x1) / 2
      const gapHalf = 0.05
      shapes.push(
        // Left half of horizontal bracket
        { type: 'line', x0, y0: y, x1: cx - gapHalf, y1: y, xref: 'x', yref: 'y', line: { color, width: lw } },
        // Right half of horizontal bracket
        { type: 'line', x0: cx + gapHalf, y0: y, x1, y1: y, xref: 'x', yref: 'y', line: { color, width: lw } },
        // Left vertical tick
        { type: 'line', x0, y0: y - step * 0.3, x1: x0, y1: y, xref: 'x', yref: 'y', line: { color, width: lw } },
        // Right vertical tick
        { type: 'line', x0: x1, y0: y - step * 0.3, x1, y1: y, xref: 'x', yref: 'y', line: { color, width: lw } },
      )
      annots.push({
        x: cx, y,
        xref: 'x', yref: 'y',
        text: label, showarrow: false,
        font: { size: isSig ? 13 : 10, color, family: '"Red Hat Display", sans-serif' },
        yanchor: 'middle',
      })
    }
    const nDrawn = processedGroups.length - 1
    const yMax = nDrawn > 0 ? baseY + step * processedGroups.length + range * 0.02 : null
    return { shapes, annotations: annots, yMax }
  }, [showSigBars, processedGroups, pairStats, isXOriented, groupBy])

  return (
    <div className="space-y-4">
      {/* Controls row 1: parameter, chart type, group by + stratify by */}
      <div className="grid gap-3 sm:grid-cols-3">
        <ParameterSelect
          parameters={parameters}
          value={parameter}
          onChange={setParameter}
          placeholder="Select parameter..."
        />

        <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
          {CHART_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setChartType(t)}
              aria-pressed={chartType === t}
              className={cn(
                'flex-1 rounded-md px-2 py-1.5 text-xs font-medium capitalize transition-all',
                chartType === t
                  ? 'bg-white text-primary shadow-sm border border-gray-200'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {CHART_TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
          {GROUP_BY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setGroupBy(opt.value)}
              aria-pressed={groupBy === opt.value}
              className={cn(
                'flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-all',
                groupBy === opt.value
                  ? 'bg-white text-primary shadow-sm border border-gray-200'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stratify by */}
      {strataOptions && strataOptions.length > 0 && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wider" htmlFor="strata-by-select">
            Stratify by
          </label>
          <select
            id="strata-by-select"
            value={strataBy}
            onChange={(e) => setStrataBy(e.target.value)}
            className="w-full h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
          >
            <option value="">None</option>
            {strataOptions.map((s) => (
              <option key={s.name} value={s.name}>{s.display_name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Controls row 2: color by, palette + checkboxes */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Color By */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 flex-shrink-0" htmlFor="color-by-select">
            Color by:
          </label>
          <select
            id="color-by-select"
            value={colorBy}
            onChange={(e) => setColorBy(e.target.value as ColorBy)}
            className="rounded-lg border border-gray-200 bg-white py-1 pl-2 pr-7 text-xs text-gray-700 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
          >
            {COLOR_BY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <span className="text-gray-200">|</span>

        {/* Palette */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 flex-shrink-0" htmlFor="palette-select">
            Palette:
          </label>
          <select
            id="palette-select"
            value={palette}
            onChange={(e) => setPalette(e.target.value as PaletteName)}
            className="rounded-lg border border-gray-200 bg-white py-1 pl-2 pr-7 text-xs text-gray-700 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
          >
            {(Object.keys(COLOR_PALETTES) as PaletteName[]).map((key) => (
              <option key={key} value={key}>{COLOR_PALETTES[key].label}</option>
            ))}
          </select>
          <div className="flex gap-0.5">
            {COLOR_PALETTES[palette].colors.slice(0, 6).map((c, i) => (
              <span key={i} className="h-3 w-3 rounded-full" style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>

        <span className="text-gray-200">|</span>

        {/* Checkboxes */}
        {(chartType === 'box' || chartType === 'violin' || chartType === 'half-violin') && (
          <>
            <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showPoints}
                onChange={(e) => setShowPoints(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 accent-primary"
              />
              Show points
            </label>
            {showPoints && (
              <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={pointsSide}
                  onChange={(e) => setPointsSide(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-gray-300 accent-primary"
                />
                Points side
              </label>
            )}
          </>
        )}

        <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={removeOutliers}
            onChange={(e) => setRemoveOutliers(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300 accent-primary"
          />
          Remove outliers
        </label>

        {!isXOriented && processedGroups.length >= 2 && (
          <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showSigBars}
              onChange={(e) => setShowSigBars(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300 accent-primary"
            />
            p-value bars
          </label>
        )}

        <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showGridlines}
            onChange={(e) => setShowGridlines(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300 accent-primary"
          />
          Gridlines
        </label>
      </div>

      {/* Chart */}
      <div ref={plotContainerRef} className="relative">
        {/* Export button */}
        {data && (
          <button
            onClick={() => setShowExport(true)}
            className="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-white/80 border border-gray-200 text-gray-500 hover:text-primary hover:border-primary/30 transition-colors"
            title="Export plot"
          >
            <Download className="h-4 w-4" />
          </button>
        )}
        <ChartCard
          title={
            selectedMeta
              ? `${selectedMeta.label}${unit ? ` (${unit})` : ''}`
              : 'Distribution'
          }
          subtitle={
            selectedMeta?.normal_range
              ? `Normal range: ${selectedMeta.normal_range.min}-${selectedMeta.normal_range.max} ${unit}`
              : undefined
          }
          loading={isLoading && !!parameter}
          error={isError ? 'Failed to load distribution data' : undefined}
          empty={!parameter || (!isLoading && processedGroups.length === 0)}
          emptyMessage={parameter ? 'No data for the current filter selection' : 'Select a parameter above'}
          height="h-96"
        >
          <Plot
            data={plotData}
            layout={{
              ...PLOTLY_LAYOUT_DEFAULTS,
              barmode: chartType === 'histogram' ? ('overlay' as const) : undefined,
              xaxis: {
                ...PLOTLY_LAYOUT_DEFAULTS.xaxis,
                // Use gridcolor transparency instead of showgrid to avoid Plotly relayout/rescale
                gridcolor: showGridlines ? '#E2E8F0' : 'rgba(0,0,0,0)',
                gridwidth: showGridlines ? 1 : 0,
                title: isXOriented ? { text: unit || '', font: { size: 11 } } : undefined,
                // For box/violin: numeric x with custom tick labels, hide axis lines
                ...(!isXOriented && processedGroups.length > 0 ? {
                  tickvals: processedGroups.map((_, idx) => groupBy === 'age_sex' ? getAgeSexXPos(idx) : idx),
                  ticktext: processedGroups.map((_, idx) =>
                    groupBy === 'age_sex' ? (idx % 2 === 0 ? '♂' : '♀') : getGroupLabel(groupBy, processedGroups[idx].group)
                  ),
                  range: groupBy === 'age_sex' ? [-0.5, 8.4] : [-0.6, processedGroups.length - 0.4],
                  zeroline: false,
                } : {}),
              },
              yaxis: {
                ...PLOTLY_LAYOUT_DEFAULTS.yaxis,
                gridcolor: showGridlines ? '#E2E8F0' : 'rgba(0,0,0,0)',
                gridwidth: showGridlines ? 1 : 0,
                title: !isXOriented
                  ? { text: unit || '', font: { size: 11 } }
                  : chartType === 'histogram'
                    ? { text: 'Count', font: { size: 11 } }
                    : chartType === 'density'
                      ? { text: 'Density', font: { size: 11 } }
                      : undefined,
                ...(sigBarElements.yMax != null ? { range: [
                  Math.min(...processedGroups.flatMap((g) => g.values)) - Math.max(Math.max(...processedGroups.flatMap((g) => g.values)) - Math.min(...processedGroups.flatMap((g) => g.values)), 1) * 0.15,
                  sigBarElements.yMax,
                ] } : {}),
              },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              shapes: sigBarElements.shapes as any,
              legend: { orientation: 'h' as const, y: -0.3, x: 0.5, xanchor: 'center' as const, font: { size: 11 } },
              margin: { l: 60, r: 20, t: showSigBars ? 40 : 20, b: groupBy === 'age_sex' ? 150 : 120 },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              annotations: [...annotations, ...(sigBarElements.annotations as any[])],
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%', height: '100%' }}
            useResizeHandler
          />
        </ChartCard>
      </div>

      {showExport && (
        <ExportDialog
          plotRef={plotContainerRef}
          title={selectedMeta?.label || 'distribution'}
          onClose={() => setShowExport(false)}
          matrixData={processedGroups.length >= 2 ? {
            groups: processedGroups,
            pairStats,
            labels: processedGroups.map((g) => getGroupLabel(groupBy, g.group)),
            nPairs,
          } : undefined}
        />
      )}

      {/* Pairwise comparison matrix */}
      {processedGroups.length >= 2 && (
        <PairwiseMatrix
          groups={processedGroups}
          pairStats={pairStats}
          groupBy={groupBy}
          nPairs={nPairs}
        />
      )}

      {/* Summary stats table */}
      {statsRows.length > 0 && (
        <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-xs font-semibold text-gray-700">Summary Statistics</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {removeOutliers
                ? 'Outliers removed using IQR ×1.5 method.'
                : 'All data points included.'}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" aria-label="Distribution summary statistics">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-gray-600">Group</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-600">N</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-600">Mean</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-600">Median</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-600">SD</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-600">Min</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-600">Max</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-600">Q1</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-600">Q3</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-600">95% CI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {statsRows.map((row) => (
                  <tr key={row.group} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2 font-medium text-gray-800">{row.group}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-600">{row.n.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-600">{row.mean.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-600">{row.median.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-600">{row.sd.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-600">{row.min.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-600">{row.max.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-600">{row.q1.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-600">{row.q3.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-600">
                      [{row.ciLow.toFixed(2)}, {row.ciHigh.toFixed(2)}]
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2 text-[10px] text-gray-400 border-t border-gray-100">
            SD = sample standard deviation. CI = 95% confidence interval for the mean.
            {removeOutliers && ' Outliers removed using IQR ×1.5 method.'}
          </p>
        </div>
      )}
    </div>
  )
}

// ---- Correlation Tab ----

function CorrelationTab({
  parameters,
  filters,
}: {
  parameters: ParameterMeta[]
  filters: DataExplorerFilters
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [method, setMethod] = useState<Method>('spearman')
  const [showTooltip, setShowTooltip] = useState(false)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [showCellText, setShowCellText] = useState(false)
  const plotContainerRef = useRef<HTMLDivElement>(null)
  const [showExport, setShowExport] = useState(false)
  const [paramSearch, setParamSearch] = useState('')

  function toggleParam(key: string) {
    setSelected((prev) =>
      prev.includes(key)
        ? prev.filter((k) => k !== key)
        : prev.length >= MAX_CORR_PARAMS ? prev : [...prev, key],
    )
  }

  function toggleCategory(cat: string) {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  const { data, isLoading, isError } = useDataExplorerCorrelation(
    selected,
    method,
    filters,
    selected.length >= 2,
  )

  const heatmapData = useMemo(() => {
    if (!data) return []
    const pLabel = data.multiple_comparison_note ? 'p_adj' : 'p'

    // Significance stars: *** p<0.001, ** p<0.01, * p<0.05
    const sigStars = (p: number) => p < 0.001 ? '***' : p < 0.01 ? '**' : p < 0.05 ? '*' : ''

    // Compact cell text: just r value + stars
    const cellText = data.matrix.map((row) =>
      row.map((cell) => {
        const stars = sigStars(cell.p_value)
        return `${cell.r.toFixed(2)}${stars}`
      })
    )
    // Full hover text with all details
    const hoverText = data.matrix.map((row) =>
      row.map((cell) => {
        const stars = sigStars(cell.p_value)
        return `<b>${cell.label_x}</b> vs <b>${cell.label_y}</b><br>` +
          `r = ${cell.r.toFixed(3)}${stars}<br>` +
          `${pLabel} = ${cell.p_value < 0.001 ? '<0.001' : cell.p_value.toFixed(3)}<br>` +
          `n = ${cell.n.toLocaleString()}`
      })
    )

    const zSignificant = data.matrix.map((row) =>
      row.map((cell) => (cell.p_value > 0.05 ? null : cell.r))
    )
    const zNonSig = data.matrix.map((row) =>
      row.map((cell) => (cell.p_value > 0.05 ? 0 : null))
    )

    // Determine font size based on number of parameters
    const nParams = data.parameters.length
    const fontSize = nParams > 20 ? 8 : nParams > 12 ? 9 : nParams > 8 ? 10 : 11

    // Show text in cells only when toggled on
    const textTmpl = showCellText ? '%{text}' : ''

    return [
      {
        type: 'heatmap' as const,
        z: zNonSig,
        x: data.labels,
        y: data.labels,
        colorscale: [[0, '#E5E7EB'], [1, '#E5E7EB']] as [number, string][],
        zmin: -0.5, zmax: 0.5,
        showscale: false,
        hoverongaps: false,
        hoverinfo: 'skip' as const,
      },
      {
        type: 'heatmap' as const,
        z: zSignificant,
        x: data.labels,
        y: data.labels,
        text: cellText,
        customdata: hoverText,
        texttemplate: textTmpl,
        textfont: { size: fontSize },
        colorscale: DIVERGING_BWR,
        zmin: -1, zmax: 1,
        hoverongaps: false,
        hovertemplate: '%{customdata}<extra></extra>',
        colorbar: { title: { text: 'r', side: 'right' as const }, thickness: 12, len: 0.8 },
      },
      {
        type: 'heatmap' as const,
        z: data.matrix.map((row) => row.map((cell) => (cell.p_value > 0.05 ? cell.r : null))),
        x: data.labels,
        y: data.labels,
        text: cellText,
        customdata: hoverText,
        texttemplate: textTmpl,
        textfont: { color: '#9CA3AF', size: fontSize },
        colorscale: [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0)']] as [number, string][],
        zmin: -1, zmax: 1,
        showscale: false,
        hoverongaps: false,
        hovertemplate: '%{customdata} (ns)<extra></extra>',
      },
    ]
  }, [data, showCellText])

  const correlationRows = useMemo(() => {
    if (!data) return []
    const rows: Array<{ x: string; y: string; r: number; p: number; n: number }> = []
    for (let i = 0; i < data.matrix.length; i++) {
      for (let j = i + 1; j < data.matrix[i].length; j++) {
        const cell = data.matrix[i][j]
        rows.push({ x: cell.label_x, y: cell.label_y, r: cell.r, p: cell.p_value, n: cell.n })
      }
    }
    return rows.sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
  }, [data])

  const categories = useMemo(() => {
    const map = new Map<string, ParameterMeta[]>()
    for (const p of parameters) {
      const arr = map.get(p.category) ?? []
      arr.push(p)
      map.set(p.category, arr)
    }
    return map
  }, [parameters])

  const filteredCategories = useMemo(() => {
    if (!paramSearch.trim()) return categories
    const q = paramSearch.trim().toLowerCase()
    const filtered = new Map<string, ParameterMeta[]>()
    for (const [cat, params] of categories) {
      const matches = params.filter(
        (p) => p.label.toLowerCase().includes(q) || p.key.toLowerCase().includes(q) || (p.unit && p.unit.toLowerCase().includes(q))
      )
      if (matches.length > 0) filtered.set(cat, matches)
    }
    return filtered
  }, [categories, paramSearch])

  // Initialize expanded categories
  useMemo(() => {
    if (expandedCategories.size === 0 && categories.size > 0) {
      setExpandedCategories(new Set(categories.keys()))
    }
  }, [categories.size]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-toggle cell text: ON for <=10 params, OFF for >10
  useEffect(() => {
    setShowCellText(selected.length <= 10)
  }, [selected.length])

  const MAX_CORR_PARAMS = 100
  const allParamKeys = useMemo(() => parameters.map((p) => p.key), [parameters])

  const allSelected = selected.length === allParamKeys.length || selected.length >= MAX_CORR_PARAMS
  const toggleAll = () => {
    if (selected.length > 0) {
      setSelected([])
    } else {
      setSelected(allParamKeys.slice(0, MAX_CORR_PARAMS))
    }
  }

  const toggleCategoryParams = (catParams: ParameterMeta[]) => {
    const catKeys = catParams.map((p) => p.key)
    const allCatSelected = catKeys.every((k) => selected.includes(k))
    if (allCatSelected) {
      setSelected((prev) => prev.filter((k) => !catKeys.includes(k)))
    } else {
      // Add category params but cap at MAX_CORR_PARAMS total
      setSelected((prev) => {
        const merged = [...new Set([...prev, ...catKeys])]
        return merged.slice(0, MAX_CORR_PARAMS)
      })
    }
  }

  return (
    <div className="space-y-4">
      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
          {METHODS.map((m) => (
            <button
              key={m.value}
              onClick={() => setMethod(m.value)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                method === m.value
                  ? 'bg-white text-primary shadow-sm border border-gray-200'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Help tooltip */}
        <div className="relative">
          <button
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Help: Spearman vs Pearson"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
          {showTooltip && (
            <div className="absolute left-0 top-full mt-1 z-50 w-72 rounded-lg bg-gray-900 text-white p-3 text-xs shadow-xl">
              <p className="font-semibold mb-1.5">Spearman vs Pearson</p>
              <p className="mb-2">
                <span className="font-medium text-blue-300">Spearman:</span> Rank-based correlation.
                Measures monotonic relationships. Robust to outliers and skewed data.
                Use when data may not be normally distributed.
              </p>
              <p>
                <span className="font-medium text-blue-300">Pearson:</span> Measures linear relationships.
                Assumes normally distributed variables. Use for linear associations
                between normally distributed variables.
              </p>
              <div className="absolute -top-1 left-3 w-2 h-2 bg-gray-900 rotate-45" />
            </div>
          )}
        </div>

        <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showCellText}
            onChange={(e) => setShowCellText(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300 accent-primary"
          />
          Cell text
        </label>

        <span className="text-xs text-gray-400">
          {selected.length === 0
            ? 'Select 2+ parameters'
            : `${selected.length} parameter${selected.length !== 1 ? 's' : ''} selected`}
        </span>
        {selected.length > 0 && (
          <button
            onClick={() => setSelected([])}
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] text-red-500 hover:bg-red-50 transition-colors"
          >
            <X className="h-2.5 w-2.5" />
            Clear
          </button>
        )}
      </div>

      {/* Main layout: heatmap (left) + parameter picker (right) */}
      <div className="flex gap-4">
        {/* Heatmap area */}
        <div className="flex-1 min-w-0 space-y-3">
          <div ref={plotContainerRef} className="relative">
            {data && (
              <button
                onClick={() => setShowExport(true)}
                className="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-white/80 border border-gray-200 text-gray-500 hover:text-primary hover:border-primary/30 transition-colors"
                title="Export plot"
              >
                <Download className="h-4 w-4" />
              </button>
            )}
            <ChartCard
              title={`Correlation Matrix — ${method === 'spearman' ? 'Spearman' : 'Pearson'} r`}
              subtitle={data ? `${selected.length} parameters · * p<0.05  ** p<0.01  *** p<0.001` : undefined}
              loading={isLoading && selected.length >= 2}
              error={isError ? 'Failed to compute correlations' : undefined}
              empty={selected.length < 2 || (!isLoading && !data)}
              emptyMessage={selected.length < 2 ? 'Select at least 2 parameters →' : 'No data for current filters'}
              height="h-auto"
            >
              <Plot
                data={heatmapData}
                layout={{
                  ...PLOTLY_LAYOUT_DEFAULTS,
                  margin: { l: 120, r: 80, t: 20, b: 120 },
                  xaxis: { ...PLOTLY_LAYOUT_DEFAULTS.xaxis, tickangle: -35, showgrid: false, tickfont: { size: selected.length > 15 ? 9 : 11 } },
                  yaxis: { ...PLOTLY_LAYOUT_DEFAULTS.yaxis, autorange: 'reversed' as const, showgrid: false, tickfont: { size: selected.length > 15 ? 9 : 11 } },
                }}
                config={{ displayModeBar: true, responsive: true, modeBarButtonsToRemove: ['lasso2d', 'select2d'] as never[] }}
                style={{ width: '100%', height: Math.max(400, Math.min(1200, selected.length * 45 + 200)) }}
                useResizeHandler
              />
            </ChartCard>
          </div>

          {showExport && (
            <ExportDialog
              plotRef={plotContainerRef}
              title={`correlation_${method}`}
              onClose={() => setShowExport(false)}
            />
          )}

          {data && (
            <p className="text-[10px] text-gray-400 px-1">
              {data.multiple_comparison_note
                ? `Note: ${data.multiple_comparison_note} Significant correlations should be confirmed with formal analysis.`
                : 'Note: p-values are approximate and not corrected for multiple comparisons.'}
              {' '}Gray cells indicate p &gt; 0.05.
            </p>
          )}
        </div>

        {/* Parameter picker — right panel */}
        <div className="w-64 flex-shrink-0 rounded-xl border border-gray-100 bg-white overflow-hidden self-start sticky top-4">
          <div className="px-3 py-2.5 border-b border-gray-100">
            <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-700">Parameters</p>
            {/* Master select all */}
            <button
              onClick={toggleAll}
              className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-primary transition-colors"
            >
              {allSelected ? (
                <CheckSquare className="h-3 w-3" style={{ color: COLORS.primary }} />
              ) : (
                <Square className="h-3 w-3 text-gray-300" />
              )}
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
            </div>
            <input
              type="text"
              value={paramSearch}
              onChange={(e) => setParamSearch(e.target.value)}
              placeholder="Search parameters..."
              className="mt-1.5 w-full rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-700 placeholder-gray-400 outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
            />
            <p className="text-[10px] text-gray-400 mt-0.5">
              {selected.length}/{MAX_CORR_PARAMS} max
              {selected.length >= MAX_CORR_PARAMS && <span className="text-amber-500 ml-1">— limit reached</span>}
            </p>
          </div>

          <div className="max-h-[500px] overflow-y-auto divide-y divide-gray-50">
            {Array.from(filteredCategories.entries()).map(([cat, catParams]) => {
              const expanded = expandedCategories.has(cat)
              const catKeys = catParams.map((p) => p.key)
              const allCatSelected = catKeys.every((k) => selected.includes(k))
              const someCatSelected = !allCatSelected && catKeys.some((k) => selected.includes(k))

              return (
                <div key={cat}>
                  {/* Category header */}
                  <div className="flex items-center gap-1 px-3 py-2 hover:bg-gray-50 transition-colors">
                    <button
                      onClick={() => toggleCategoryParams(catParams)}
                      className="flex-shrink-0"
                      aria-label={`Select all ${cat}`}
                    >
                      {allCatSelected ? (
                        <CheckSquare className="h-3.5 w-3.5" style={{ color: COLORS.primary }} />
                      ) : someCatSelected ? (
                        <CheckSquare className="h-3.5 w-3.5 text-gray-400" />
                      ) : (
                        <Square className="h-3.5 w-3.5 text-gray-300" />
                      )}
                    </button>
                    <button
                      onClick={() => toggleCategory(cat)}
                      className="flex-1 flex items-center gap-1 text-left"
                    >
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{cat}</span>
                      <span className="text-[10px] text-gray-400">({catParams.length})</span>
                      {expanded ? (
                        <ChevronDown className="h-3 w-3 text-gray-400 ml-auto" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-gray-400 ml-auto" />
                      )}
                    </button>
                  </div>

                  {/* Parameter checkboxes */}
                  {expanded && (
                    <div className="pb-1">
                      {catParams.map((p) => {
                        const active = selected.includes(p.key)
                        return (
                          <button
                            key={p.key}
                            onClick={() => toggleParam(p.key)}
                            className="flex w-full items-center gap-2 px-3 pl-7 py-1 text-left text-xs hover:bg-gray-50 transition-colors"
                          >
                            {active ? (
                              <CheckSquare className="h-3 w-3 flex-shrink-0" style={{ color: COLORS.primary }} />
                            ) : (
                              <Square className="h-3 w-3 flex-shrink-0 text-gray-300" />
                            )}
                            <span className={cn('truncate', active ? 'text-gray-800 font-medium' : 'text-gray-600')}>
                              {p.label}
                            </span>
                            {p.unit && <span className="text-[10px] text-gray-400 flex-shrink-0">({p.unit})</span>}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Accessible pair table */}
      {correlationRows.length > 0 && (
        <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-xs font-semibold text-gray-700">Pairwise Correlations</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Sorted by |r|, descending.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" aria-label="Pairwise correlation coefficients">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-gray-600">Parameter X</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-600">Parameter Y</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-600">r</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-600">
                    {data?.multiple_comparison_note ? 'p-value (adj)' : 'p-value'}
                  </th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-600">N</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {correlationRows.map((row, i) => {
                  const absR = Math.abs(row.r)
                  const strength =
                    absR >= 0.7
                      ? 'text-emerald-700 font-semibold'
                      : absR >= 0.4
                        ? 'text-blue-600'
                        : 'text-gray-600'
                  const sig = row.p < 0.05 ? 'text-gray-800' : 'text-gray-400'
                  return (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2 text-gray-700">{row.x}</td>
                      <td className="px-4 py-2 text-gray-700">{row.y}</td>
                      <td className={cn('px-4 py-2 text-right tabular-nums', strength)}>
                        {row.r >= 0 ? '+' : ''}{row.r.toFixed(3)}
                      </td>
                      <td className={cn('px-4 py-2 text-right tabular-nums', sig)}>
                        {row.p < 0.001 ? '<0.001' : row.p.toFixed(3)}
                        {row.p < 0.05 && (
                          <span className="ml-1 text-emerald-500" aria-label="statistically significant (p < 0.05)">*</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-600">{row.n.toLocaleString()}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2 text-[10px] text-gray-400 border-t border-gray-100">
            * p &lt; 0.05. Correlations computed using {method === 'spearman' ? 'Spearman rank' : 'Pearson'} method.
          </p>
        </div>
      )}
    </div>
  )
}

// ---- Scatter / Regression Tab ----

/** Color-by options for scatter (subset — no age_sex, no site_type for simplicity) */
const SCATTER_COLOR_BY_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'age_group', label: 'Age Group' },
  { value: 'sex', label: 'Sex' },
  { value: 'site', label: 'Centre' },
] as const
type ScatterColorBy = (typeof SCATTER_COLOR_BY_OPTIONS)[number]['value']

/** Get scatter point color based on color-by dimension */
function getScatterPointColor(pt: ScatterPoint, colorByDim: ScatterColorBy): string {
  if (colorByDim === 'age_group') {
    return AGE_GROUP_COLORS[String(pt.age_group)] || COLORS.primary
  }
  if (colorByDim === 'sex') {
    return pt.sex === 'A' ? SEX_COLORS.Male : SEX_COLORS.Female
  }
  if (colorByDim === 'site') {
    const siteIdx = CENTRE_OPTIONS.findIndex((s) => s.value === pt.site_code)
    return SITE_COLORS[(siteIdx >= 0 ? siteIdx : 0) % SITE_COLORS.length]
  }
  return COLORS.primary
}

/** Get category label for a scatter point */
function getScatterCategory(pt: ScatterPoint, colorByDim: ScatterColorBy): string {
  if (colorByDim === 'age_group') return AGE_GROUP_LABELS[String(pt.age_group)] || String(pt.age_group)
  if (colorByDim === 'sex') return pt.sex === 'A' ? 'Male' : 'Female'
  if (colorByDim === 'site') return pt.site_code || 'Unknown'
  return 'All'
}

/** Simple linear regression from arrays */
function computeLinearRegression(xs: number[], ys: number[]): { slope: number; intercept: number } | null {
  const n = xs.length
  if (n < 2) return null
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  const sxy = xs.reduce((s, xi, i) => s + (xi - mx) * (ys[i] - my), 0)
  const sxx = xs.reduce((s, xi) => s + (xi - mx) ** 2, 0)
  if (sxx === 0) return null
  const slope = sxy / sxx
  return { slope, intercept: my - slope * mx }
}

/** Format p-value for display */
function formatPValue(p: number | null): string {
  if (p === null || p === undefined) return 'N/A'
  if (p < 0.001) return '<0.001'
  return p.toFixed(4)
}

function ScatterTab({
  parameters,
  filters,
}: {
  parameters: ParameterMeta[]
  filters: DataExplorerFilters
}) {
  const [paramX, setParamX] = useState('')
  const [paramY, setParamY] = useState('')
  const [colorBy, setColorBy] = useState<ScatterColorBy>('default')
  const [showRegression, setShowRegression] = useState(true)
  const plotContainerRef = useRef<HTMLDivElement>(null)
  const [showExport, setShowExport] = useState(false)

  const paramXMeta = useMemo(() => parameters.find((p) => p.key === paramX), [parameters, paramX])
  const paramYMeta = useMemo(() => parameters.find((p) => p.key === paramY), [parameters, paramY])

  const { data, isLoading, isError } = useDataExplorerScatter(
    paramX,
    paramY,
    filters,
    !!paramX && !!paramY,
  )

  const plotData = useMemo(() => {
    if (!data || data.points.length === 0) return []

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const traces: any[] = []

    if (colorBy === 'default') {
      // Single trace
      traces.push({
        type: 'scatter',
        mode: 'markers',
        x: data.points.map((p) => p.x),
        y: data.points.map((p) => p.y),
        marker: { color: COLORS.primary, size: 7, opacity: 0.6 },
        hovertemplate: data.points.map(
          (p) => `<b>${p.participant_code}</b><br>X: ${p.x}<br>Y: ${p.y}<extra></extra>`
        ),
        showlegend: false,
      })

      // Regression line for all points
      if (showRegression && data.stats.regression.slope !== null && data.stats.regression.intercept !== null) {
        const xVals = data.points.map((p) => p.x)
        const xMin = Math.min(...xVals)
        const xMax = Math.max(...xVals)
        const slope = data.stats.regression.slope
        const intercept = data.stats.regression.intercept
        traces.push({
          type: 'scatter',
          mode: 'lines',
          x: [xMin, xMax],
          y: [slope * xMin + intercept, slope * xMax + intercept],
          line: { color: COLORS.gray700, width: 2, dash: 'dash' },
          showlegend: false,
          hoverinfo: 'skip',
        })
      }
    } else {
      // Group by category
      const groups = new Map<string, ScatterPoint[]>()
      for (const pt of data.points) {
        const cat = getScatterCategory(pt, colorBy)
        const arr = groups.get(cat) ?? []
        arr.push(pt)
        groups.set(cat, arr)
      }

      for (const [cat, pts] of Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
        const color = getScatterPointColor(pts[0], colorBy)
        traces.push({
          type: 'scatter',
          mode: 'markers',
          name: cat,
          x: pts.map((p) => p.x),
          y: pts.map((p) => p.y),
          marker: { color, size: 7, opacity: 0.6 },
          hovertemplate: pts.map(
            (p) => `<b>${p.participant_code}</b><br>X: ${p.x}<br>Y: ${p.y}<extra></extra>`
          ),
        })

        // Per-group regression line
        if (showRegression && pts.length >= 2) {
          const reg = computeLinearRegression(pts.map((p) => p.x), pts.map((p) => p.y))
          if (reg) {
            const xMin = Math.min(...pts.map((p) => p.x))
            const xMax = Math.max(...pts.map((p) => p.x))
            traces.push({
              type: 'scatter',
              mode: 'lines',
              x: [xMin, xMax],
              y: [reg.slope * xMin + reg.intercept, reg.slope * xMax + reg.intercept],
              line: { color, width: 2, dash: 'dash' },
              showlegend: false,
              hoverinfo: 'skip',
            })
          }
        }
      }
    }

    return traces
  }, [data, colorBy, showRegression])

  const layout = useMemo((): Record<string, unknown> => ({
    ...PLOTLY_LAYOUT_DEFAULTS,
    xaxis: {
      ...PLOTLY_LAYOUT_DEFAULTS.xaxis,
      title: {
        text: paramXMeta ? `${paramXMeta.label}${paramXMeta.unit ? ` (${paramXMeta.unit})` : ''}` : paramX,
        font: { size: 13, color: '#1E293B', family: '"Red Hat Display", sans-serif' },
      },
      tickfont: { size: 11, color: '#1E293B', family: '"Red Hat Display", sans-serif' },
    },
    yaxis: {
      ...PLOTLY_LAYOUT_DEFAULTS.yaxis,
      title: {
        text: paramYMeta ? `${paramYMeta.label}${paramYMeta.unit ? ` (${paramYMeta.unit})` : ''}` : paramY,
        font: { size: 13, color: '#1E293B', family: '"Red Hat Display", sans-serif' },
      },
      tickfont: { size: 11, color: '#1E293B', family: '"Red Hat Display", sans-serif' },
    },
    legend: { x: 1, xanchor: 'right', y: 1, bgcolor: 'rgba(255,255,255,0.8)', bordercolor: '#E2E8F0', borderwidth: 1 },
    height: 500,
  }), [paramX, paramY, paramXMeta, paramYMeta])

  const plotConfig = useMemo(() => ({
    displayModeBar: true,
    displaylogo: false,
    modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'] as string[],
    responsive: true,
  }), [])

  const stats = data?.stats

  // No parameters selected prompt
  if (!paramX || !paramY) {
    return (
      <div className="flex flex-col lg:flex-row gap-5">
        {/* Left sidebar */}
        <div className="w-full lg:w-64 flex-shrink-0 space-y-4">
          <div className="rounded-xl bg-white border border-gray-100 p-4 space-y-4">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">X Parameter</label>
              <ParameterSelect parameters={parameters} value={paramX} onChange={setParamX} placeholder="Select X axis..." />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Y Parameter</label>
              <ParameterSelect parameters={parameters} value={paramY} onChange={setParamY} placeholder="Select Y axis..." />
            </div>
          </div>
        </div>
        {/* Empty state */}
        <div className="flex-1 min-w-0">
          <ChartCard title="Scatter Plot" subtitle="Select X and Y parameters to plot">
            <div className="flex h-64 items-center justify-center">
              <div className="text-center">
                <ScatterChart className="mx-auto h-10 w-10 text-gray-300 mb-3" />
                <p className="text-sm text-gray-400">Select both X and Y parameters to generate a scatter plot</p>
              </div>
            </div>
          </ChartCard>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col lg:flex-row gap-5">
      {/* Left sidebar */}
      <div className="w-full lg:w-64 flex-shrink-0 space-y-4">
        <div className="rounded-xl bg-white border border-gray-100 p-4 space-y-4">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">X Parameter</label>
            <ParameterSelect parameters={parameters} value={paramX} onChange={setParamX} placeholder="Select X axis..." />
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Y Parameter</label>
            <ParameterSelect parameters={parameters} value={paramY} onChange={setParamY} placeholder="Select Y axis..." />
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Color By</label>
            <select
              value={colorBy}
              onChange={(e) => setColorBy(e.target.value as ScatterColorBy)}
              className="w-full rounded-lg border border-gray-200 bg-white py-2 px-3 text-sm text-gray-700 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
            >
              {SCATTER_COLOR_BY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="show-regression"
              checked={showRegression}
              onChange={(e) => setShowRegression(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary/20"
            />
            <label htmlFor="show-regression" className="text-xs text-gray-700">Show Regression Line</label>
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Regression Type</label>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
              Linear
            </div>
          </div>
        </div>

        {/* Export button */}
        <button
          onClick={() => setShowExport(true)}
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white py-2 px-3 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          Export Chart
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-4">
        <ChartCard
          title="Scatter Plot"
          subtitle={paramXMeta && paramYMeta ? `${paramXMeta.label} vs ${paramYMeta.label}` : ''}
          loading={isLoading}
          error={isError ? 'Failed to load scatter data' : undefined}
          empty={!isLoading && !isError && data && data.points.length === 0}
          emptyMessage="No paired data found for these parameters"
        >
          <div ref={plotContainerRef}>
            {plotData.length > 0 && (
              <Plot
                data={plotData}
                layout={layout}
                config={plotConfig}
                useResizeHandler
                style={{ width: '100%', height: '500px' }}
              />
            )}
          </div>
        </ChartCard>

        {/* Stats panel */}
        {stats && stats.n > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              { label: 'N', value: stats.n.toLocaleString(), significant: false },
              { label: 'Pearson r', value: stats.pearson_r !== null ? stats.pearson_r.toFixed(4) : 'N/A', significant: stats.pearson_p !== null && stats.pearson_p < 0.05 },
              { label: 'Spearman r', value: stats.spearman_r !== null ? stats.spearman_r.toFixed(4) : 'N/A', significant: stats.spearman_p !== null && stats.spearman_p < 0.05 },
              { label: 'R\u00B2', value: stats.r_squared !== null ? stats.r_squared.toFixed(4) : 'N/A', significant: false },
              { label: 'p-value', value: formatPValue(stats.pearson_p), significant: stats.pearson_p !== null && stats.pearson_p < 0.05 },
              { label: 'Slope', value: stats.regression.slope !== null ? stats.regression.slope.toFixed(4) : 'N/A', significant: false },
              { label: 'Intercept', value: stats.regression.intercept !== null ? stats.regression.intercept.toFixed(4) : 'N/A', significant: false },
            ].map((card) => (
              <div
                key={card.label}
                className={cn(
                  'rounded-lg border px-3 py-2.5 text-center',
                  card.significant
                    ? 'border-green-200 bg-green-50'
                    : 'border-gray-100 bg-white',
                )}
              >
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">{card.label}</p>
                <p className={cn(
                  'text-sm font-bold tabular-nums',
                  card.significant ? 'text-green-700' : 'text-gray-800',
                )}>
                  {card.value}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Export modal */}
        {showExport && (
          <ExportDialog plotRef={plotContainerRef} title="Scatter Plot" onClose={() => setShowExport(false)} />
        )}
      </div>
    </div>
  )
}

// ---- Advanced Analytics Placeholder ----

function AdvancedAnalyticsPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-2xl mb-4"
        style={{ background: `linear-gradient(135deg, ${COLORS.primary}22, ${COLORS.teal}22)` }}
      >
        <Beaker className="h-8 w-8" style={{ color: COLORS.primary }} />
      </div>
      <h3 className="text-lg font-semibold text-gray-800 mb-1">Advanced Analytics</h3>
      <p className="text-sm text-gray-500 max-w-md">
        Regression models, survival analysis, dimensionality reduction, and more — coming soon.
      </p>
      <div className="mt-4 flex items-center gap-1.5 rounded-full px-3 py-1.5 bg-gray-100 text-xs text-gray-500">
        <Lock className="h-3 w-3" />
        Coming Soon
      </div>
    </div>
  )
}

// ---- Main Page ----

export function DataExplorerPage() {
  const [activeTab, setActiveTab] = useState<Tab>('Distribution')
  const [filters, setFilters] = useState<DataExplorerFilters>({})

  const { data: parameters, isLoading: parametersLoading } = useDataExplorerParameters()
  const { data: counts } = useDataExplorerCounts(filters)

  const handleFiltersChange = useCallback((f: DataExplorerFilters) => setFilters(f), [])

  const activeFilterCount =
    (filters.age_groups?.length ?? 0) +
    (filters.sex?.length ?? 0) +
    (filters.site_ids?.length ?? 0)

  return (
    <div>
      <PageHeader
        title="BHARAT Data Explorer"
        subtitle="Explore distributions, correlations, and clinical summaries across the cohort"
        icon={<BarChart3 className="h-5 w-5" />}
        gradient
        actions={
          activeFilterCount > 0 ? (
            <div
              className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-white"
              style={{ background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.teal})` }}
            >
              <FlaskConical className="h-3 w-3" />
              {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active
            </div>
          ) : undefined
        }
      />

      <div className="flex gap-6">
        {/* Filter sidebar (desktop) */}
        <div className="w-48 flex-shrink-0 hidden lg:block">
          <FilterSidebar filters={filters} onChange={handleFiltersChange} counts={counts} />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Tab bar */}
          <div className="mb-5 flex rounded-xl border border-gray-200 bg-gray-50 p-1 gap-1" role="tablist">
            {TABS.map((tab) => {
              const tabId = `tab-${tab.toLowerCase().replace(/\s+/g, '-')}`
              const isDisabled = tab === 'Advanced Analytics'
              return (
                <button
                  key={tab}
                  id={tabId}
                  onClick={() => !isDisabled && setActiveTab(tab)}
                  role="tab"
                  aria-selected={activeTab === tab}
                  aria-controls={`tabpanel-${tab.toLowerCase().replace(/\s+/g, '-')}`}
                  disabled={isDisabled}
                  className={cn(
                    'flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all relative',
                    isDisabled
                      ? 'text-gray-400 cursor-not-allowed'
                      : activeTab === tab
                        ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                        : 'text-gray-500 hover:text-gray-700',
                  )}
                >
                  {tab === 'Distribution' && <BarChart3 className="inline-block h-3.5 w-3.5 mr-1.5 opacity-70" />}
                  {tab === 'Scatter' && <ScatterChart className="inline-block h-3.5 w-3.5 mr-1.5 opacity-70" />}
                  {tab === 'Correlation' && <Activity className="inline-block h-3.5 w-3.5 mr-1.5 opacity-70" />}
                  {tab === 'Advanced Analytics' && <Beaker className="inline-block h-3.5 w-3.5 mr-1.5 opacity-70" />}
                  {tab}
                  {isDisabled && (
                    <span className="ml-1.5 inline-flex items-center rounded-full bg-gray-200 px-1.5 py-0.5 text-[9px] font-medium text-gray-500">
                      Soon
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Filter summary bar */}
          <FilterSummaryBar filters={filters} totalN={counts?.filtered_total ?? counts?.total} />

          {/* Tab content */}
          {parametersLoading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 rounded-full border-2 border-gray-200 border-t-primary animate-spin" />
                <span className="text-xs text-gray-400">Loading parameters...</span>
              </div>
            </div>
          ) : (
            <div
              role="tabpanel"
              id={`tabpanel-${activeTab.toLowerCase().replace(/\s+/g, '-')}`}
              aria-labelledby={`tab-${activeTab.toLowerCase().replace(/\s+/g, '-')}`}
            >
              {activeTab === 'Distribution' && (
                <DistributionTab parameters={parameters ?? []} filters={filters} />
              )}
              {activeTab === 'Scatter' && (
                <ScatterTab parameters={parameters ?? []} filters={filters} />
              )}
              {activeTab === 'Correlation' && (
                <CorrelationTab parameters={parameters ?? []} filters={filters} />
              )}
              {activeTab === 'Advanced Analytics' && (
                <AdvancedAnalyticsPlaceholder />
              )}
            </div>
          )}

          {/* Mobile filter disclosure */}
          <details className="lg:hidden mt-6 rounded-xl border border-gray-200">
            <summary
              className="px-4 py-3 text-sm font-medium text-gray-700 cursor-pointer list-none flex items-center justify-between"
              role="group"
              aria-expanded={undefined}
            >
              <span>Cohort Filters {activeFilterCount > 0 && `(${activeFilterCount} active)`}</span>
              <ChevronDown className="h-4 w-4 text-gray-400" />
            </summary>
            <div className="px-4 pb-4">
              <FilterSidebar filters={filters} onChange={handleFiltersChange} counts={counts} />
            </div>
          </details>
        </div>
      </div>
    </div>
  )
}
