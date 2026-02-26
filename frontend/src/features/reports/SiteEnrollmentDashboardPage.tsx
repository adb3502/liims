/**
 * Site-specific enrollment dashboard.
 * Mirrors the global EnrollmentDashboardPage but filtered to a single collection site.
 */
import { useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useDashboardEnrollmentBySite, useDashboardEnrollmentMatrix } from '@/api/dashboard'
import type { DemographicStats } from '@/api/dashboard'
import { useCollectionSites } from '@/api/participants'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard, StatCardSkeleton } from '@/components/ui/stat-card'
import { ChartCard } from '@/components/ui/chart-card'
import {
  AGE_GROUP_COLORS,
  AGE_GROUP_LABELS,
  SEX_COLORS,
  SEX_LABELS,
  HBA1C_COLORS,
  RECHARTS_THEME,
  COLORS,
} from '@/lib/chart-theme'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import {
  Users,
  MapPin,
  UserCheck,
  CalendarPlus,
  ArrowLeft,
  Building2,
} from 'lucide-react'

// ──── Types ────

type DistributionView = 'donut' | 'bar' | 'histogram' | 'continuous'

// ──── Helpers ────

function formatDateLabel(date: string): string {
  try {
    const d = new Date(date)
    return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  } catch {
    return date
  }
}

function binValues(
  values: number[],
  bins: Array<{ label: string; min: number; max: number }>,
): Array<{ label: string; count: number; min: number; max: number }> {
  return bins.map(bin => ({
    ...bin,
    count: values.filter(v => v >= bin.min && v < bin.max).length,
  }))
}

const AGE_BINS_STUDY = [
  { label: '18-29', min: 18, max: 30 },
  { label: '30-44', min: 30, max: 45 },
  { label: '45-59', min: 45, max: 60 },
  { label: '60-74', min: 60, max: 75 },
  { label: '75+', min: 75, max: Infinity },
]

const AGE_GROUP_ENTRIES = Object.entries(AGE_GROUP_LABELS)

const HBAIC_BINS = [
  { label: 'Normal (<5.7%)', min: 0, max: 5.7, category: 'Normal' },
  { label: 'Prediabetic (5.7-6.4%)', min: 5.7, max: 6.5, category: 'Prediabetic' },
  { label: 'Diabetic (≥6.5%)', min: 6.5, max: Infinity, category: 'Diabetic' },
]

const GROUP_CODE_LABELS: Record<string, string> = {
  '1A': 'M 18-29', '1B': 'F 18-29',
  '2A': 'M 30-44', '2B': 'F 30-44',
  '3A': 'M 45-59', '3B': 'F 45-59',
  '4A': 'M 60-74', '4B': 'F 60-74',
  '5A': 'M 75+', '5B': 'F 75+',
}

// ──── Toggle Button Group ────

function ChartToggle({
  value,
  onChange,
  options,
}: {
  value: DistributionView
  onChange: (v: DistributionView) => void
  options: Array<{ value: DistributionView; label: string }>
}) {
  return (
    <div
      role="group"
      aria-label="Chart type"
      className="flex gap-0.5 rounded-lg border border-gray-200 bg-gray-50 p-0.5"
    >
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={cn(
            'rounded-md px-2.5 py-1 text-[11px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
            value === opt.value
              ? 'bg-white text-primary shadow-sm border border-gray-200'
              : 'text-gray-500 hover:text-gray-700',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ──── Custom Tooltip ────

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div style={RECHARTS_THEME.tooltip.contentStyle} className="px-3 py-2">
      <p className="text-xs font-medium text-gray-700 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span
            className="h-2 w-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-gray-500">{entry.name}:</span>
          <span className="font-semibold text-gray-800 tabular-nums">
            {entry.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  )
}

// ──── Enrollment Trend Chart (single site — no per-site lines) ────

function SiteEnrollmentTrendChart({
  data,
}: {
  data: Array<{ date: string; count: number }>
}) {
  const chartData = useMemo(() => {
    return data.reduce<Array<Record<string, unknown>>>(
      (acc, d) => {
        const prev = acc.length > 0 ? (acc[acc.length - 1].cumulative as number) : 0
        return [
          ...acc,
          {
            ...d,
            cumulative: prev + d.count,
            label: formatDateLabel(d.date),
          },
        ]
      },
      [],
    )
  }, [data])

  const latestCumulative =
    chartData.length > 0 ? (chartData[chartData.length - 1].cumulative as number) : 0

  return (
    <ChartCard
      title="Enrollment Trend"
      subtitle={`Cumulative: ${latestCumulative.toLocaleString()} participants`}
      empty={chartData.length === 0}
      emptyMessage="No enrollment data available yet"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="siteEnrollGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.primary} stopOpacity={0.25} />
              <stop offset="100%" stopColor={COLORS.teal} stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid {...RECHARTS_THEME.grid} />
          <XAxis
            dataKey="label"
            tick={{ ...RECHARTS_THEME.tick, fill: '#000000' }}
            axisLine={{ stroke: COLORS.gray200 }}
            tickLine={false}
          />
          <YAxis
            tick={{ ...RECHARTS_THEME.tick, fill: '#000000' }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip content={<ChartTooltip />} />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          <Area
            type="monotone"
            dataKey="cumulative"
            name="Cumulative"
            stroke={COLORS.primary}
            strokeWidth={2.5}
            fill="url(#siteEnrollGradient)"
            dot={false}
            activeDot={{ r: 5, fill: COLORS.primary, stroke: '#fff', strokeWidth: 2 }}
          />
          <Area
            type="monotone"
            dataKey="count"
            name="New / Month"
            stroke={COLORS.teal}
            strokeWidth={1.5}
            fill="none"
            strokeDasharray="4 4"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

// ──── Demographics Pyramid ────

function DemographicsPyramid({ demographics }: { demographics: DemographicStats }) {
  const pyramidData = useMemo(() => {
    const ageGroups = ['1', '2', '3', '4', '5']
    return ageGroups
      .map(ag => {
        const maleEntry = demographics.by_age_sex.find(
          d => d.age_group === ag && (d.sex === 'M' || d.sex === 'A'),
        )
        const femaleEntry = demographics.by_age_sex.find(
          d => d.age_group === ag && (d.sex === 'F' || d.sex === 'B'),
        )
        return {
          ageGroup: AGE_GROUP_LABELS[ag] || ag,
          male: -(maleEntry?.count ?? 0),
          female: femaleEntry?.count ?? 0,
          maleAbs: maleEntry?.count ?? 0,
          femaleAbs: femaleEntry?.count ?? 0,
        }
      })
      .reverse()
  }, [demographics])

  const maxVal = Math.max(...pyramidData.map(d => Math.max(d.maleAbs, d.femaleAbs)), 1)
  const domainMax = Math.ceil(maxVal / 5) * 5 || 5

  return (
    <ChartCard
      title="Demographics Pyramid"
      subtitle="Age-sex distribution"
      empty={demographics.by_age_sex.length === 0}
      emptyMessage="No demographic data available"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={pyramidData}
          layout="vertical"
          margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
          barGap={0}
        >
          <CartesianGrid {...RECHARTS_THEME.grid} horizontal={false} />
          <XAxis
            type="number"
            domain={[-domainMax, domainMax]}
            tickFormatter={(v: number) => Math.abs(v).toString()}
            tick={{ ...RECHARTS_THEME.tick, fill: '#000000' }}
            axisLine={{ stroke: COLORS.gray200 }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="ageGroup"
            tick={{ ...RECHARTS_THEME.tick, fill: '#000000', fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
            width={50}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const d = payload[0]?.payload
              return (
                <div style={RECHARTS_THEME.tooltip.contentStyle} className="px-3 py-2">
                  <p className="text-xs font-semibold text-gray-700 mb-1">{label}</p>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SEX_COLORS.Male }} />
                    <span className="text-gray-500">Male:</span>
                    <span className="font-semibold tabular-nums">{d?.maleAbs ?? 0}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SEX_COLORS.Female }} />
                    <span className="text-gray-500">Female:</span>
                    <span className="font-semibold tabular-nums">{d?.femaleAbs ?? 0}</span>
                  </div>
                </div>
              )
            }}
          />
          <Bar dataKey="male" name="Male" fill={SEX_COLORS.Male} radius={[4, 0, 0, 4]} barSize={20} />
          <Bar dataKey="female" name="Female" fill={SEX_COLORS.Female} radius={[0, 4, 4, 0]} barSize={20} />
          <Legend verticalAlign="bottom" formatter={(value: string) => <span className="text-xs text-gray-600">{value}</span>} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

// ──── HbA1c Chart ────

function HbA1cChart({ demographics }: { demographics: DemographicStats }) {
  const [view, setView] = useState<DistributionView>('donut')
  const { normal, prediabetic, diabetic } = demographics.hba1c_status

  const donutData = [
    { name: 'Normal', value: normal, fill: HBA1C_COLORS.Normal },
    { name: 'Prediabetic', value: prediabetic, fill: HBA1C_COLORS.Prediabetic },
    { name: 'Diabetic', value: diabetic, fill: HBA1C_COLORS.Diabetic },
  ].filter(d => d.value > 0)

  const histData = useMemo(
    () => binValues(demographics.hba1c_distribution ?? [], HBAIC_BINS),
    [demographics.hba1c_distribution],
  )

  return (
    <ChartCard
      title="HbA1c Status"
      subtitle="Glycated hemoglobin classification"
      empty={donutData.length === 0}
      emptyMessage="No HbA1c data available"
      height="h-72"
      action={
        <ChartToggle
          value={view}
          onChange={setView}
          options={[
            { value: 'donut', label: 'Donut' },
            { value: 'bar', label: 'Bar' },
            { value: 'histogram', label: 'Histogram' },
          ]}
        />
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        {view === 'donut' ? (
          <PieChart>
            <Pie data={donutData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="55%" outerRadius="85%" paddingAngle={2}>
              {donutData.map((d, i) => <Cell key={i} fill={d.fill} />)}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        ) : view === 'bar' ? (
          <BarChart data={donutData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid {...RECHARTS_THEME.grid} />
            <XAxis dataKey="name" tick={{ ...RECHARTS_THEME.tick, fill: '#000000' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ ...RECHARTS_THEME.tick, fill: '#000000' }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="value" name="Count" radius={[4, 4, 0, 0]} barSize={32}>
              {donutData.map((d, i) => <Cell key={i} fill={d.fill} />)}
            </Bar>
          </BarChart>
        ) : (
          <BarChart data={histData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid {...RECHARTS_THEME.grid} />
            <XAxis dataKey="label" tick={{ ...RECHARTS_THEME.tick, fill: '#000000' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ ...RECHARTS_THEME.tick, fill: '#000000' }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="count" name="Count" radius={[4, 4, 0, 0]} barSize={24}>
              {histData.map((d, i) => {
                const cat = (d as unknown as { category: string }).category
                const fill = cat === 'Normal' ? HBA1C_COLORS.Normal : cat === 'Prediabetic' ? HBA1C_COLORS.Prediabetic : HBA1C_COLORS.Diabetic
                return <Cell key={i} fill={fill} />
              })}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </ChartCard>
  )
}

// ──── Age Group Chart ────

function AgeGroupChart({ demographics }: { demographics: DemographicStats }) {
  const [view, setView] = useState<DistributionView>('donut')

  const donutData = useMemo(
    () =>
      demographics.by_age_group.map(d => ({
        name: AGE_GROUP_LABELS[d.age_group] || d.age_group,
        value: d.count,
        fill: AGE_GROUP_COLORS[d.age_group] || COLORS.gray400,
      })),
    [demographics.by_age_group],
  )

  const histData = useMemo(
    () => binValues(demographics.age_distribution ?? [], AGE_BINS_STUDY),
    [demographics.age_distribution],
  )

  // 1-year bins for continuous view
  const continuousData = useMemo(() => {
    const ages = demographics.age_distribution ?? []
    if (ages.length === 0) return []
    const minAge = Math.floor(Math.min(...ages))
    const maxAge = Math.ceil(Math.max(...ages))
    const bins: Array<{ age: number; count: number }> = []
    for (let a = minAge; a <= maxAge; a++) {
      bins.push({ age: a, count: ages.filter(v => v >= a && v < a + 1).length })
    }
    return bins
  }, [demographics.age_distribution])

  return (
    <ChartCard
      title="Age Distribution"
      subtitle="Participant age breakdown"
      empty={donutData.length === 0}
      emptyMessage="No age data"
      height="h-72"
      action={
        <ChartToggle
          value={view}
          onChange={setView}
          options={[
            { value: 'donut', label: 'Donut' },
            { value: 'bar', label: 'Bar' },
            { value: 'histogram', label: 'Histogram' },
            { value: 'continuous', label: 'Continuous' },
          ]}
        />
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        {view === 'donut' ? (
          <PieChart>
            <Pie data={donutData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="55%" outerRadius="85%" paddingAngle={2}>
              {donutData.map((d, i) => <Cell key={i} fill={d.fill} />)}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        ) : view === 'bar' ? (
          <BarChart data={donutData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid {...RECHARTS_THEME.grid} />
            <XAxis dataKey="name" tick={{ ...RECHARTS_THEME.tick, fill: '#000000' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ ...RECHARTS_THEME.tick, fill: '#000000' }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="value" name="Count" radius={[4, 4, 0, 0]} barSize={32}>
              {donutData.map((d, i) => <Cell key={i} fill={d.fill} />)}
            </Bar>
          </BarChart>
        ) : view === 'continuous' ? (
          <AreaChart data={continuousData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid {...RECHARTS_THEME.grid} />
            <XAxis dataKey="age" tick={{ ...RECHARTS_THEME.tick, fill: '#000000' }} axisLine={false} tickLine={false} label={{ value: 'Age (years)', position: 'insideBottom', offset: -5, style: { fontSize: 10, fill: '#64748B' } }} />
            <YAxis tick={{ ...RECHARTS_THEME.tick, fill: '#000000' }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} />
            <Area type="monotone" dataKey="count" name="Participants" stroke={COLORS.primary} fill={COLORS.primary} fillOpacity={0.15} strokeWidth={2} dot={false} />
          </AreaChart>
        ) : (
          <BarChart data={histData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid {...RECHARTS_THEME.grid} />
            <XAxis dataKey="label" tick={{ ...RECHARTS_THEME.tick, fill: '#000000' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ ...RECHARTS_THEME.tick, fill: '#000000' }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="count" name="Count" radius={[4, 4, 0, 0]} barSize={32}>
              {histData.map((_, i) => <Cell key={i} fill={Object.values(AGE_GROUP_COLORS)[i] || COLORS.gray400} />)}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </ChartCard>
  )
}

// ──── Gender Chart ────

function GenderChart({ data }: { data: Array<{ sex: string; count: number }> }) {
  const [view, setView] = useState<DistributionView>('donut')

  const chartData = useMemo(
    () =>
      data.map(d => ({
        name: SEX_LABELS[d.sex] || d.sex,
        value: d.count,
        fill: d.sex === 'M' || d.sex === 'A' ? SEX_COLORS.Male : SEX_COLORS.Female,
      })),
    [data],
  )

  return (
    <ChartCard
      title="Sex Distribution"
      subtitle="Male vs Female participants"
      empty={chartData.length === 0}
      emptyMessage="No sex data"
      height="h-72"
      action={
        <ChartToggle
          value={view}
          onChange={setView}
          options={[
            { value: 'donut', label: 'Donut' },
            { value: 'bar', label: 'Bar' },
          ]}
        />
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        {view === 'donut' ? (
          <PieChart>
            <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="55%" outerRadius="85%" paddingAngle={3}>
              {chartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        ) : (
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid {...RECHARTS_THEME.grid} />
            <XAxis dataKey="name" tick={{ ...RECHARTS_THEME.tick, fill: '#000000' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ ...RECHARTS_THEME.tick, fill: '#000000' }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="value" name="Count" radius={[4, 4, 0, 0]} barSize={40}>
              {chartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </ChartCard>
  )
}

// ──── Site Group Code Breakdown (single-site matrix row) ────

function SiteGroupBreakdown({
  siteCode,
}: {
  siteCode: string
}) {
  const { data } = useDashboardEnrollmentMatrix()
  const [showRemaining, setShowRemaining] = useState(false)

  if (!data) return null

  const { group_codes, matrix, totals } = data
  const siteMatrix = matrix[siteCode]
  const siteTotal = totals.by_site[siteCode]
  if (!siteMatrix) return null

  const sitePct = siteTotal && siteTotal.target > 0
    ? Math.min((siteTotal.count / siteTotal.target) * 100, 100)
    : 0

  return (
    <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Group Breakdown</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {showRemaining
              ? 'Slots remaining by age-sex group code'
              : 'Enrollment progress by age-sex group code'}
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
          <button
            onClick={() => setShowRemaining(false)}
            className={cn(
              'rounded-md px-3 py-1 text-xs font-medium transition-all',
              !showRemaining
                ? 'bg-white text-primary shadow-sm border border-gray-200'
                : 'text-gray-500 hover:text-gray-700',
            )}
          >
            Enrolled
          </button>
          <button
            onClick={() => setShowRemaining(true)}
            className={cn(
              'rounded-md px-3 py-1 text-xs font-medium transition-all',
              showRemaining
                ? 'bg-white text-primary shadow-sm border border-gray-200'
                : 'text-gray-500 hover:text-gray-700',
            )}
          >
            Slots Remaining
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs" aria-label="Group code enrollment breakdown">
          <thead className="bg-gray-50">
            <tr>
              {group_codes.map(gc => (
                <th key={gc} className="px-3 py-2.5 text-center font-semibold text-gray-600 whitespace-nowrap">
                  <div>{gc}</div>
                  <div className="text-[10px] font-normal text-gray-400">{GROUP_CODE_LABELS[gc] || ''}</div>
                </th>
              ))}
              <th className="px-4 py-2.5 text-right font-semibold text-gray-600 whitespace-nowrap">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              {group_codes.map(gc => {
                const cell = siteMatrix[gc]
                const count = cell?.count ?? 0
                const target = cell?.target ?? 0
                const remaining = Math.max(0, target - count)
                const pct = target > 0 ? Math.min((count / target) * 100, 100) : 0
                const barColor =
                  pct >= 100 ? COLORS.success
                    : pct >= 75 ? COLORS.primary
                      : pct >= 40 ? COLORS.teal
                        : COLORS.gray400
                return (
                  <td key={gc} className="px-3 py-4 text-center">
                    {showRemaining ? (
                      target > 0 ? (
                        <span className={cn(
                          'tabular-nums text-sm font-medium',
                          remaining > 0 ? 'text-amber-600' : 'text-emerald-600',
                        )}>
                          {remaining > 0 ? remaining : 'Full'}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )
                    ) : (
                      <>
                        <span className="tabular-nums text-gray-700 text-sm font-medium">
                          {count}
                        </span>
                        {target > 0 && (
                          <span className="text-gray-400 text-xs">/{target}</span>
                        )}
                      </>
                    )}
                    {target > 0 && (
                      <div className="mt-1.5 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700 ease-out"
                          style={{ width: `${pct}%`, backgroundColor: barColor }}
                        />
                      </div>
                    )}
                  </td>
                )
              })}
              <td className="px-4 py-4 text-right">
                {showRemaining ? (
                  <span className={cn(
                    'tabular-nums font-bold text-sm',
                    siteTotal?.target && siteTotal.target > siteTotal.count ? 'text-amber-600' : 'text-emerald-600',
                  )}>
                    {Math.max(0, (siteTotal?.target ?? 0) - (siteTotal?.count ?? 0))}
                  </span>
                ) : (
                  <>
                    <span className="tabular-nums font-bold text-gray-800 text-sm">
                      {siteTotal?.count?.toLocaleString() ?? 0}
                    </span>
                    {siteTotal?.target != null && siteTotal.target > 0 && (
                      <span className="text-gray-400 text-xs">/{siteTotal.target.toLocaleString()}</span>
                    )}
                  </>
                )}
                {siteTotal?.target != null && siteTotal.target > 0 && (
                  <div className="mt-1.5 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{
                        width: `${sitePct}%`,
                        backgroundColor: sitePct >= 100 ? COLORS.success : COLORS.primary,
                      }}
                    />
                  </div>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ──── Ratio Card ────

function RatioCard({
  title,
  icon,
  accentColor,
  children,
}: {
  title: string
  icon: React.ReactNode
  accentColor: string
  children: React.ReactNode
}) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-white border border-gray-100 p-5 transition-all duration-200 hover:shadow-[0_4px_12px_-2px_rgba(0,0,0,0.08)] hover:border-gray-200">
      <div className="absolute top-0 left-0 w-1 h-full rounded-r-full" style={{ backgroundColor: accentColor }} />
      <div className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-[0.04] -translate-y-6 translate-x-6" style={{ backgroundColor: accentColor }} />
      <div className="flex items-start justify-between">
        <div className="space-y-1 min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-400">{title}</p>
          {children}
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg opacity-90 flex-shrink-0 ml-3" style={{ backgroundColor: `${accentColor}12`, color: accentColor }}>
          {icon}
        </div>
      </div>
    </div>
  )
}

// ──── Main Page ────

export function SiteEnrollmentDashboardPage() {
  const { siteCode } = useParams<{ siteCode: string }>()
  const { data: sites } = useCollectionSites()
  const { data, isLoading, isError } = useDashboardEnrollmentBySite(siteCode ?? '')

  const site = useMemo(
    () => sites?.find(s => s.code === siteCode),
    [sites, siteCode],
  )

  const siteName = site?.name ?? siteCode ?? 'Unknown Site'
  const siteCity = site?.city ?? ''

  const totalEnrolled = data?.total_participants ?? 0
  const demographics = data?.demographics
  const recent30d = data?.recent_30d ?? 0

  // M:F ratio
  const maleCount = demographics?.by_sex?.find(d => d.sex === 'M' || d.sex === 'A')?.count ?? 0
  const femaleCount = demographics?.by_sex?.find(d => d.sex === 'F' || d.sex === 'B')?.count ?? 0
  const ratioStr =
    femaleCount > 0
      ? `${(maleCount / femaleCount).toFixed(2)} : 1`
      : maleCount > 0
        ? `${maleCount} : 0`
        : '--'

  const pageTitle = `${siteCode} — Enrollment Analytics`
  const pageSubtitle = `${siteName}${siteCity ? `, ${siteCity}` : ''}`

  // ── Loading ──
  if (isLoading) {
    return (
      <div>
        <PageHeader title={pageTitle} subtitle={pageSubtitle} icon={<Building2 className="h-5 w-5" />} gradient />
        <div className="mb-4">
          <Link to="/reports/enrollment" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-primary transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to All Sites
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Enrollment Trend" loading>{null}</ChartCard>
          <ChartCard title="Demographics Pyramid" loading>{null}</ChartCard>
        </div>
      </div>
    )
  }

  // ── Error ──
  if (isError) {
    return (
      <div>
        <PageHeader title={pageTitle} subtitle={pageSubtitle} icon={<Building2 className="h-5 w-5" />} gradient />
        <div className="mb-4">
          <Link to="/reports/enrollment" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-primary transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to All Sites
          </Link>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
          <p className="text-sm font-medium text-red-600">
            Failed to load enrollment data for {siteName}. Please try again later.
          </p>
        </div>
      </div>
    )
  }

  // ── Empty ──
  if (totalEnrolled === 0) {
    return (
      <div>
        <PageHeader title={pageTitle} subtitle={pageSubtitle} icon={<Building2 className="h-5 w-5" />} gradient />
        <div className="mb-4">
          <Link to="/reports/enrollment" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-primary transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to All Sites
          </Link>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <Users className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-600">No participants enrolled at {siteName}</p>
          <p className="text-xs text-gray-400 mt-1">
            Enrollment data will appear here once participants are registered at this site.
          </p>
        </div>
      </div>
    )
  }

  // ── Populated ──
  return (
    <div>
      <PageHeader title={pageTitle} subtitle={pageSubtitle} icon={<Building2 className="h-5 w-5" />} gradient />

      <div className="mb-4">
        <Link
          to="/reports/enrollment"
          className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-primary transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to All Sites
        </Link>
      </div>

      {/* Row 0: Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-6">
        <StatCard
          title="Total Enrolled"
          value={totalEnrolled.toLocaleString()}
          subtitle={`All-time at ${siteCode}`}
          icon={<Users className="h-5 w-5" />}
          accentColor={COLORS.primary}
        />
        <StatCard
          title="This Month"
          value={recent30d > 0 ? `+${recent30d.toLocaleString()}` : '0'}
          subtitle="Enrolled this month"
          icon={<CalendarPlus className="h-5 w-5" />}
          accentColor={COLORS.success}
        />
        <StatCard
          title="Site"
          value={siteCode ?? '--'}
          subtitle={siteCity || siteName}
          icon={<Building2 className="h-5 w-5" />}
          accentColor={COLORS.teal}
        />
      </div>

      {/* Row 1: Ratio Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-6">
        <RatioCard title="M : F Ratio" icon={<UserCheck className="h-5 w-5" />} accentColor="#8B5CF6">
          <p className="text-2xl font-bold text-gray-900 tabular-nums">{ratioStr}</p>
          <p className="text-xs text-gray-500">
            {maleCount.toLocaleString()} male, {femaleCount.toLocaleString()} female
          </p>
        </RatioCard>

        <RatioCard title="Age Categories" icon={<Users className="h-5 w-5" />} accentColor={COLORS.primary}>
          {demographics?.by_age_group && demographics.by_age_group.length > 0 ? (
            <div className="grid grid-cols-5 gap-1 w-full">
              {AGE_GROUP_ENTRIES.map(([key, label]) => {
                const count = demographics.by_age_group.find(g => String(g.age_group) === key)?.count ?? 0
                return (
                  <div key={key} className="text-center">
                    <p className="text-sm font-bold text-gray-900 tabular-nums">{count}</p>
                    <p className="text-[10px] text-gray-500 leading-tight">{label}</p>
                  </div>
                )
              })}
            </div>
          ) : (
            <>
              <p className="text-2xl font-bold text-gray-900">--</p>
              <p className="text-xs text-gray-500">Age data pending</p>
            </>
          )}
        </RatioCard>

        <RatioCard title="Location" icon={<MapPin className="h-5 w-5" />} accentColor="#059669">
          <p className="text-lg font-bold text-gray-900">{siteCity || '--'}</p>
          <p className="text-xs text-gray-500 truncate">{siteName}</p>
        </RatioCard>
      </div>

      {/* Row 2: Group Code Breakdown */}
      {siteCode && <SiteGroupBreakdown siteCode={siteCode} />}

      {/* Row 3: Trend + Pyramid */}
      <div className="grid gap-4 lg:grid-cols-2 mb-6 mt-6">
        <SiteEnrollmentTrendChart data={data?.enrollment_over_time ?? []} />
        {demographics ? (
          <DemographicsPyramid demographics={demographics} />
        ) : (
          <ChartCard title="Demographics Pyramid" subtitle="Age-sex distribution" empty emptyMessage="Demographic data not yet available">
            {null}
          </ChartCard>
        )}
      </div>

      {/* Row 4: HbA1c + Age + Gender */}
      <div className="grid gap-4 lg:grid-cols-3 mb-6">
        {demographics ? (
          <HbA1cChart demographics={demographics} />
        ) : (
          <ChartCard title="HbA1c Status" empty emptyMessage="No data" height="h-72">{null}</ChartCard>
        )}
        {demographics ? (
          <AgeGroupChart demographics={demographics} />
        ) : (
          <ChartCard title="Age Distribution" empty emptyMessage="No data" height="h-72">{null}</ChartCard>
        )}
        {demographics ? (
          <GenderChart data={demographics.by_sex} />
        ) : (
          <ChartCard title="Sex Distribution" empty emptyMessage="No data" height="h-72">{null}</ChartCard>
        )}
      </div>
    </div>
  )
}
