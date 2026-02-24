/**
 * BHARAT Data Explorer — rich parameter distribution, correlation, and clinical overview.
 * Tab navigation: Distribution | Correlation | Clinical Overview
 * Cohort filter sidebar: age group, sex, site checkboxes
 */

import { useState, useMemo, useCallback } from 'react'
import Plot from 'react-plotly.js'
import { PageHeader } from '@/components/ui/page-header'
import { ChartCard } from '@/components/ui/chart-card'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import {
  COLORS,
  PLOTLY_LAYOUT_DEFAULTS,
  DIVERGING_BWR,
  AGE_GROUP_LABELS,
  AGE_GROUP_COLORS,
  SEX_COLORS,
  SITE_COLORS,
  formatPct,
} from '@/lib/chart-theme'
import {
  useDataExplorerParameters,
  useDataExplorerDistribution,
  useDataExplorerCorrelation,
  useDataExplorerClinicalSummary,
  type DataExplorerFilters,
  type ParameterMeta,
} from '@/api/data-explorer'
import {
  FlaskConical,
  Activity,
  BarChart3,
  Dna,
  ChevronDown,
  X,
  Users,
  CheckSquare,
  Square,
  TrendingUp,
  Heart,
  Ruler,
  Brain,
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

const SITE_OPTIONS = [
  { value: 'RMH', label: 'RMH - Ramaiah' },
  { value: 'BBH', label: 'BBH - Baptist' },
  { value: 'SSSSMH', label: 'SSSSMH - Muddenahalli' },
  { value: 'CHAF', label: 'CHAF - Air Force' },
  { value: 'BMC', label: 'BMC - Bangalore Medical' },
  { value: 'JSS', label: 'JSS - Mysuru' },
]

const TABS = ['Distribution', 'Correlation', 'Clinical Overview'] as const
type Tab = (typeof TABS)[number]

const CHART_TYPES = ['box', 'violin', 'histogram'] as const
type ChartType = (typeof CHART_TYPES)[number]

const GROUP_BY_OPTIONS = [
  { value: 'age_group', label: 'Age Group' },
  { value: 'sex', label: 'Sex' },
  { value: 'site', label: 'Site' },
] as const
type GroupBy = 'age_group' | 'sex' | 'site'

const COLOR_BY_OPTIONS = [
  { value: 'age_group', label: 'Age Group' },
  { value: 'sex', label: 'Sex' },
  { value: 'site', label: 'Site' },
  // HbA1c-derived: UI only for now; backend support pending
  { value: 'hba1c_status', label: 'HbA1c Status' },
] as const
type ColorBy = 'age_group' | 'sex' | 'site' | 'hba1c_status'

const METHODS = [
  { value: 'spearman', label: 'Spearman' },
  { value: 'pearson', label: 'Pearson' },
] as const
type Method = 'spearman' | 'pearson'

// ---- Cohort Filter Sidebar ----

function CheckItem({
  label,
  checked,
  onToggle,
  color,
}: {
  label: string
  checked: boolean
  onToggle: () => void
  color?: string
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
      <span className="text-gray-700">{label}</span>
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
}

function FilterSidebar({ filters, onChange }: FilterSidebarProps) {
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

      <FilterSection title="Age Group">
        {AGE_GROUP_OPTIONS.map((opt) => (
          <CheckItem
            key={opt.value}
            label={opt.label}
            checked={(filters.age_groups ?? []).includes(opt.value)}
            onToggle={() => toggle('age_groups', opt.value)}
            color={AGE_GROUP_COLORS[opt.value]}
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
          />
        ))}
      </FilterSection>

      <FilterSection title="Site">
        {SITE_OPTIONS.map((opt, i) => (
          <CheckItem
            key={opt.value}
            label={opt.label}
            checked={(filters.site_ids ?? []).includes(opt.value)}
            onToggle={() => toggle('site_ids', opt.value)}
            color={SITE_COLORS[i % SITE_COLORS.length]}
          />
        ))}
      </FilterSection>
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
  const categories = useMemo(() => {
    const map = new Map<string, ParameterMeta[]>()
    for (const p of parameters) {
      const arr = map.get(p.category) ?? []
      arr.push(p)
      map.set(p.category, arr)
    }
    return map
  }, [parameters])

  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm text-gray-800 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
        aria-label={placeholder}
      >
        <option value="">{placeholder}</option>
        {Array.from(categories.entries()).map(([cat, params]) => (
          <optgroup key={cat} label={cat}>
            {params.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label} {p.unit ? `(${p.unit})` : ''}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
    </div>
  )
}

// ---- Distribution Tab ----

function getGroupColors(groupBy: GroupBy, groups: string[]): string[] {
  if (groupBy === 'age_group') return groups.map((g) => AGE_GROUP_COLORS[g] || COLORS.primary)
  if (groupBy === 'sex') return groups.map((g) => (g === 'A' || g === 'Male' ? SEX_COLORS.Male : SEX_COLORS.Female))
  return groups.map((_, i) => SITE_COLORS[i % SITE_COLORS.length])
}

function getGroupColor(groupBy: GroupBy, groupKey: string, index: number): string {
  if (groupBy === 'age_group') return AGE_GROUP_COLORS[groupKey] || COLORS.primary
  if (groupBy === 'sex') return groupKey === 'A' || groupKey === 'Male' ? SEX_COLORS.Male : SEX_COLORS.Female
  return SITE_COLORS[index % SITE_COLORS.length]
}

function getGroupLabel(groupBy: GroupBy, groupKey: string): string {
  if (groupBy === 'age_group') return AGE_GROUP_LABELS[groupKey] || groupKey
  if (groupBy === 'sex') return groupKey === 'A' ? 'Male' : groupKey === 'B' ? 'Female' : groupKey
  return groupKey
}

function getColorByColor(colorBy: ColorBy, groupBy: GroupBy, groupKey: string, index: number): string {
  // When colorBy matches groupBy, derive color from the group key
  if (colorBy === groupBy) return getGroupColor(groupBy, groupKey, index)
  // HbA1c status coloring: backend pending, fall back to index-based
  if (colorBy === 'hba1c_status') return SITE_COLORS[index % SITE_COLORS.length]
  // Cross-dimension coloring: use index-based as fallback
  return SITE_COLORS[index % SITE_COLORS.length]
}

function DistributionTab({
  parameters,
  filters,
}: {
  parameters: ParameterMeta[]
  filters: DataExplorerFilters
}) {
  const [parameter, setParameter] = useState('')
  const [chartType, setChartType] = useState<ChartType>('box')
  const [groupBy, setGroupBy] = useState<GroupBy>('age_group')
  const [colorBy, setColorBy] = useState<ColorBy>('age_group')
  const [showPoints, setShowPoints] = useState(false)

  // Keep colorBy in sync with groupBy default when groupBy changes
  const handleGroupByChange = useCallback((val: GroupBy) => {
    setGroupBy(val)
    setColorBy(val)
  }, [])

  // For violin/box we always fetch with chartType='box' to get raw values
  const fetchType = chartType === 'histogram' ? 'histogram' : 'box'

  const { data, isLoading, isError } = useDataExplorerDistribution(
    parameter,
    fetchType,
    groupBy,
    filters,
    !!parameter,
  )

  const selectedMeta = useMemo(
    () => parameters.find((p) => p.key === parameter),
    [parameters, parameter],
  )

  const plotData = useMemo(() => {
    if (!data) return []

    if (chartType === 'box') {
      return data.groups.map((g, i) => {
        const color = getColorByColor(colorBy, groupBy, g.group, i)
        return {
          type: 'box' as const,
          name: getGroupLabel(groupBy, g.group),
          y: g.values ?? [],
          boxpoints: 'outliers' as const,
          jitter: 0.3,
          marker: { color },
          line: { color },
          fillcolor: `${color}33`,
          hovertemplate:
            `<b>${getGroupLabel(groupBy, g.group)}</b><br>` +
            `Median: %{median:.2f}<br>` +
            `Q1-Q3: ${g.q1.toFixed(2)}-${g.q3.toFixed(2)}<br>` +
            `Mean: ${g.mean.toFixed(2)} +/- ${g.sd.toFixed(2)}<br>` +
            `N: ${g.n}<extra></extra>`,
        }
      })
    }

    if (chartType === 'violin') {
      return data.groups.map((g, i) => {
        const color = getColorByColor(colorBy, groupBy, g.group, i)
        return {
          type: 'violin' as const,
          name: getGroupLabel(groupBy, g.group),
          y: g.values ?? [],
          box: { visible: true },
          meanline: { visible: true },
          points: showPoints ? ('all' as const) : (false as const),
          marker: { color, size: 3, opacity: 0.5 },
          line: { color },
          fillcolor: `${color}33`,
          hovertemplate:
            `<b>${getGroupLabel(groupBy, g.group)}</b><br>` +
            `N: ${g.n}<extra></extra>`,
        }
      })
    }

    // histogram
    const colors = getGroupColors(groupBy, data.groups.map((g) => g.group))
    return data.groups.map((g, i) => ({
      type: 'histogram' as const,
      name: getGroupLabel(groupBy, g.group),
      x: g.values ?? [],
      opacity: 0.7,
      marker: { color: colors[i] },
      hovertemplate: `<b>${getGroupLabel(groupBy, g.group)}</b><br>Count: %{y}<extra></extra>`,
    }))
  }, [data, chartType, groupBy, colorBy, showPoints])

  // N annotations for box/violin — shown below each trace
  const annotations = useMemo(() => {
    if (!data || chartType === 'histogram') return []
    return data.groups.map((g, i) => ({
      x: i,
      y: -0.08,
      xref: 'x' as const,
      yref: 'paper' as const,
      text: `n=${g.n.toLocaleString()}`,
      showarrow: false,
      font: { size: 9, color: '#94A3B8' },
      xanchor: 'center' as const,
    }))
  }, [data, chartType])

  const statsRows = useMemo(() => {
    if (!data) return []
    return data.groups.map((g) => {
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
  }, [data, groupBy])

  return (
    <div className="space-y-4">
      {/* Controls */}
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
              id={`chart-type-${t}`}
              onClick={() => setChartType(t)}
              aria-pressed={chartType === t}
              className={cn(
                'flex-1 rounded-md px-2 py-1.5 text-xs font-medium capitalize transition-all',
                chartType === t
                  ? 'bg-white text-primary shadow-sm border border-gray-200'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
          {GROUP_BY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleGroupByChange(opt.value)}
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

      {/* Color-by selector */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500 flex-shrink-0" htmlFor="color-by-select">
          Color by:
        </label>
        <select
          id="color-by-select"
          value={colorBy}
          onChange={(e) => setColorBy(e.target.value as ColorBy)}
          className="rounded-lg border border-gray-200 bg-white py-1 pl-2 pr-7 text-xs text-gray-700 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
          aria-label="Color traces by dimension"
        >
          {COLOR_BY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
              {opt.value === 'hba1c_status' ? ' (pending backend)' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Show Points toggle — only for box and violin */}
      {(chartType === 'box' || chartType === 'violin') && (
        <label className="inline-flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showPoints}
            onChange={(e) => setShowPoints(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300 accent-primary"
          />
          Show individual data points
        </label>
      )}

      {/* Chart */}
      <ChartCard
        title={
          selectedMeta
            ? `${selectedMeta.label}${selectedMeta.unit ? ` (${selectedMeta.unit})` : ''}`
            : 'Distribution'
        }
        subtitle={
          selectedMeta?.normal_range
            ? `Normal range: ${selectedMeta.normal_range.min}-${selectedMeta.normal_range.max} ${selectedMeta.unit}`
            : undefined
        }
        loading={isLoading && !!parameter}
        error={isError ? 'Failed to load distribution data' : undefined}
        empty={!parameter || (!isLoading && (!data || data.groups.length === 0))}
        emptyMessage={parameter ? 'No data for the current filter selection' : 'Select a parameter above'}
        height="h-96"
      >
        <Plot
          data={plotData}
          layout={{
            ...PLOTLY_LAYOUT_DEFAULTS,
            boxmode: chartType !== 'histogram' ? ('group' as const) : undefined,
            violinmode: chartType === 'violin' ? ('group' as const) : undefined,
            barmode: chartType === 'histogram' ? ('overlay' as const) : undefined,
            yaxis: {
              ...PLOTLY_LAYOUT_DEFAULTS.yaxis,
              title: chartType !== 'histogram'
                ? { text: selectedMeta?.unit ?? '', font: { size: 11 } }
                : { text: 'Count', font: { size: 11 } },
            },
            legend: { orientation: 'h' as const, y: -0.2, x: 0.5, xanchor: 'center' as const },
            margin: { l: 60, r: 20, t: 20, b: 90 },
            annotations,
          }}
          config={{ displayModeBar: false, responsive: true }}
          style={{ width: '100%', height: '100%' }}
          useResizeHandler
        />
      </ChartCard>

      {/* Summary stats table -- accessible alternative to chart */}
      {statsRows.length > 0 && (
        <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-xs font-semibold text-gray-700">Summary Statistics</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Data table accessible alternative to chart above
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

  function toggleParam(key: string) {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }

  const { data, isLoading, isError } = useDataExplorerCorrelation(
    selected,
    method,
    filters,
    selected.length >= 2,
  )

  const heatmapData = useMemo(() => {
    if (!data) return []
    // p_value is BH-adjusted when backend returns adjusted_p_values (preferred in hook)
    const pLabel = data.multiple_comparison_note ? 'p_adj' : 'p'
    const zSignificant = data.matrix.map((row) =>
      row.map((cell) => (cell.p_value > 0.05 ? null : cell.r))
    )
    const zNonSig = data.matrix.map((row) =>
      row.map((cell) => (cell.p_value > 0.05 ? 0 : null))
    )
    const text = data.matrix.map((row) =>
      row.map(
        (cell) =>
          `r=${cell.r.toFixed(2)}\n${pLabel}=${cell.p_value < 0.001 ? '<0.001' : cell.p_value.toFixed(3)}\nn=${cell.n}`,
      ),
    )
    return [
      // Non-significant cells: light gray
      {
        type: 'heatmap' as const,
        z: zNonSig,
        x: data.labels,
        y: data.labels,
        colorscale: [[0, '#E5E7EB'], [1, '#E5E7EB']] as [number, string][],
        zmin: -0.5,
        zmax: 0.5,
        showscale: false,
        hoverongaps: false,
        hoverinfo: 'skip' as const,
      },
      // Significant cells: full color
      {
        type: 'heatmap' as const,
        z: zSignificant,
        x: data.labels,
        y: data.labels,
        text,
        texttemplate: '%{text}',
        colorscale: DIVERGING_BWR,
        zmin: -1,
        zmax: 1,
        hoverongaps: false,
        hovertemplate: '<b>%{x}</b> vs <b>%{y}</b><br>%{text}<extra></extra>',
        colorbar: {
          title: { text: 'r', side: 'right' as const },
          thickness: 12,
          len: 0.8,
        },
      },
      // Non-significant cells text overlay (show r value dimmed)
      {
        type: 'heatmap' as const,
        z: data.matrix.map((row) => row.map((cell) => (cell.p_value > 0.05 ? cell.r : null))),
        x: data.labels,
        y: data.labels,
        text: data.matrix.map((row) =>
          row.map((cell) =>
            cell.p_value > 0.05
              ? `r=${cell.r.toFixed(2)}\n${pLabel}=${cell.p_value < 0.001 ? '<0.001' : cell.p_value.toFixed(3)}\nn=${cell.n}`
              : '',
          ),
        ),
        texttemplate: '%{text}',
        colorscale: [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0)']] as [number, string][],
        zmin: -1,
        zmax: 1,
        showscale: false,
        hoverongaps: false,
        hovertemplate: `<b>%{x}</b> vs <b>%{y}</b><br>%{text} (${pLabel}>0.05, ns)<extra></extra>`,
        textfont: { color: '#9CA3AF' },
      },
    ]
  }, [data])

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
        <span className="text-xs text-gray-400">
          {selected.length === 0
            ? 'Select 2+ parameters below'
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

      {/* Parameter picker */}
      <div className="rounded-xl border border-gray-100 bg-white p-4">
        <p className="mb-3 text-xs font-semibold text-gray-600">Select Parameters to Correlate</p>
        <div className="space-y-3">
          {Array.from(categories.entries()).map(([cat, params]) => (
            <div key={cat}>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{cat}</p>
              <div className="flex flex-wrap gap-1.5">
                {params.map((p) => {
                  const active = selected.includes(p.key)
                  return (
                    <button
                      key={p.key}
                      onClick={() => toggleParam(p.key)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-all',
                        active
                          ? 'bg-primary text-white shadow-sm'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                      )}
                      aria-pressed={active}
                    >
                      {p.label}
                      {p.unit && <span className="opacity-60">({p.unit})</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Heatmap */}
      <ChartCard
        title={`Correlation Matrix - ${method === 'spearman' ? 'Spearman' : 'Pearson'} r`}
        subtitle={data ? `${data.n_participants.toLocaleString()} participants` : undefined}
        loading={isLoading && selected.length >= 2}
        error={isError ? 'Failed to compute correlations' : undefined}
        empty={selected.length < 2 || (!isLoading && !data)}
        emptyMessage={selected.length < 2 ? 'Select at least 2 parameters above' : 'No data for current filters'}
        height="h-[480px]"
      >
        <Plot
          data={heatmapData}
          layout={{
            ...PLOTLY_LAYOUT_DEFAULTS,
            margin: { l: 120, r: 80, t: 20, b: 120 },
            xaxis: { ...PLOTLY_LAYOUT_DEFAULTS.xaxis, tickangle: -35 },
            yaxis: { ...PLOTLY_LAYOUT_DEFAULTS.yaxis, autorange: 'reversed' as const },
          }}
          config={{ displayModeBar: false, responsive: true }}
          style={{ width: '100%', height: '100%' }}
          useResizeHandler
        />
      </ChartCard>

      {/* Heatmap scientific disclaimer */}
      {data && (
        <p className="text-[10px] text-gray-400 px-1">
          {data.multiple_comparison_note
            ? `Note: ${data.multiple_comparison_note} Significant correlations should be confirmed with formal analysis.`
            : 'Note: p-values are approximate and not corrected for multiple comparisons. Significant correlations should be confirmed with formal analysis.'}
          {' '}Gray cells indicate p &gt; 0.05 (not significant at alpha = 0.05).
        </p>
      )}

      {/* Accessible pair table */}
      {correlationRows.length > 0 && (
        <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-xs font-semibold text-gray-700">Pairwise Correlations</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Sorted by |r|, descending. Accessible alternative to heatmap.
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

// ---- Clinical Overview Tab ----

const SECTION_ICONS: Record<string, React.ReactNode> = {
  Vitals: <Heart className="h-4 w-4" />,
  Anthropometry: <Ruler className="h-4 w-4" />,
  'Cognitive Scores': <Brain className="h-4 w-4" />,
  Comorbidities: <Activity className="h-4 w-4" />,
  Default: <TrendingUp className="h-4 w-4" />,
}

function MiniBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="mt-1.5 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700 ease-out"
        style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
      />
    </div>
  )
}

interface ClinicalItemProps {
  label: string
  mean?: number
  median?: number
  sd?: number
  unit?: string
  prevalence_pct?: number
  count?: number
  total?: number
  type: 'continuous' | 'binary'
}

function ClinicalItemCard({ item }: { item: ClinicalItemProps }) {
  if (item.type === 'binary') {
    return (
      <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
        <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-1">{item.label}</p>
        <div className="flex items-baseline gap-1">
          <span className="text-lg font-bold text-gray-900 tabular-nums">
            {item.prevalence_pct != null ? formatPct(item.prevalence_pct) : '--'}
          </span>
        </div>
        {item.count != null && item.total != null && (
          <p className="text-[10px] text-gray-400">
            {item.count.toLocaleString()} / {item.total.toLocaleString()} participants
          </p>
        )}
        <MiniBar pct={item.prevalence_pct ?? 0} color={COLORS.primary} />
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-1">{item.label}</p>
      <div className="flex items-baseline gap-1.5">
        <span className="text-lg font-bold text-gray-900 tabular-nums">
          {item.mean != null ? item.mean.toFixed(1) : item.median != null ? item.median.toFixed(1) : '--'}
        </span>
        {item.unit && <span className="text-xs text-gray-400">{item.unit}</span>}
      </div>
      {item.sd != null && (
        <p className="text-[10px] text-gray-400">+/-{item.sd.toFixed(1)} SD</p>
      )}
      {item.median != null && item.mean != null && (
        <p className="text-[10px] text-gray-400">Median: {item.median.toFixed(1)}</p>
      )}
    </div>
  )
}

function ClinicalOverviewTab({ filters }: { filters: DataExplorerFilters }) {
  const { data, isLoading, isError } = useDataExplorerClinicalSummary(filters)

  if (isLoading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-3">
            <div className="h-4 w-32 skeleton" />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="h-20 skeleton rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 p-8 text-center">
        <p className="text-sm text-red-600">Failed to load clinical summary data.</p>
      </div>
    )
  }

  if (!data || data.sections.length === 0) {
    return (
      <EmptyState
        icon={<Activity className="h-6 w-6" />}
        title="No clinical data available"
        description="Clinical overview will appear here once ODK data has been processed."
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Participant count badge */}
      <div className="flex items-center gap-2">
        <div
          className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-white"
          style={{ background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.teal})` }}
        >
          <Users className="h-3 w-3" />
          {data.n_participants.toLocaleString()} participants
        </div>
        <span className="text-xs text-gray-400">with clinical data in current filter</span>
      </div>

      {data.sections.map((section) => (
        <div key={section.section}>
          <div className="flex items-center gap-2 mb-3">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-lg text-white"
              style={{ background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.teal})` }}
            >
              {SECTION_ICONS[section.section] ?? SECTION_ICONS.Default}
            </div>
            <h3 className="text-sm font-semibold text-gray-800">{section.section}</h3>
            <span className="text-xs text-gray-400">({section.items.length} measures)</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {section.items.map((item) => (
              <ClinicalItemCard key={item.label} item={item} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ---- Main Page ----

export function DataExplorerPage() {
  const [activeTab, setActiveTab] = useState<Tab>('Distribution')
  const [filters, setFilters] = useState<DataExplorerFilters>({})

  const { data: parameters, isLoading: parametersLoading } = useDataExplorerParameters()

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
        icon={<Dna className="h-5 w-5" />}
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
          <FilterSidebar filters={filters} onChange={handleFiltersChange} />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Tab bar */}
          <div className="mb-5 flex rounded-xl border border-gray-200 bg-gray-50 p-1 gap-1" role="tablist">
            {TABS.map((tab) => {
              const tabId = `tab-${tab.toLowerCase().replace(/\s+/g, '-')}`
              return (
                <button
                  key={tab}
                  id={tabId}
                  onClick={() => setActiveTab(tab)}
                  role="tab"
                  aria-selected={activeTab === tab}
                  aria-controls={`tabpanel-${tab.toLowerCase().replace(/\s+/g, '-')}`}
                  className={cn(
                    'flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                    activeTab === tab
                      ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                      : 'text-gray-500 hover:text-gray-700',
                  )}
                >
                  {tab === 'Distribution' && <BarChart3 className="inline-block h-3.5 w-3.5 mr-1.5 opacity-70" />}
                  {tab === 'Correlation' && <Activity className="inline-block h-3.5 w-3.5 mr-1.5 opacity-70" />}
                  {tab === 'Clinical Overview' && <Heart className="inline-block h-3.5 w-3.5 mr-1.5 opacity-70" />}
                  {tab}
                </button>
              )
            })}
          </div>

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
              {activeTab === 'Correlation' && (
                <CorrelationTab parameters={parameters ?? []} filters={filters} />
              )}
              {activeTab === 'Clinical Overview' && (
                <ClinicalOverviewTab filters={filters} />
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
              <FilterSidebar filters={filters} onChange={handleFiltersChange} />
            </div>
          </details>
        </div>
      </div>
    </div>
  )
}
