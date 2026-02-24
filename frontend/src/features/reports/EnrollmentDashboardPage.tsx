import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { useDashboardEnrollment, useDashboardEnrollmentMatrix } from '@/api/dashboard'
import type { DemographicStats } from '@/api/dashboard'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard, StatCardSkeleton } from '@/components/ui/stat-card'
import { ChartCard } from '@/components/ui/chart-card'
import {
  AGE_GROUP_COLORS,
  AGE_GROUP_LABELS,
  SEX_COLORS,
  SEX_LABELS,
  SITE_COLORS,
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
import { Users, MapPin, UserCheck, CalendarPlus, Activity, Droplets } from 'lucide-react'

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

/** Bin a continuous numeric array into labelled buckets. */
function binValues(
  values: number[],
  bins: Array<{ label: string; min: number; max: number }>,
): Array<{ label: string; count: number; min: number; max: number }> {
  return bins.map(bin => ({
    ...bin,
    count: values.filter(v => v >= bin.min && v < bin.max).length,
  }))
}

// Study age categories (match the 5 BHARAT study groups)
const AGE_BINS_STUDY = [
  { label: '18-29', min: 18, max: 30 },
  { label: '30-44', min: 30, max: 45 },
  { label: '45-59', min: 45, max: 60 },
  { label: '60-74', min: 60, max: 75 },
  { label: '75+',   min: 75, max: Infinity },
]

// AGE_BINS_CONTINUOUS removed — continuous tab now uses 1-year bins computed inline

const HBAIC_BINS = [
  { label: '<5.0',     min: 0,   max: 5.0,  category: 'Normal' },
  { label: '5.0-5.6',  min: 5.0, max: 5.7,  category: 'Normal' },
  { label: '5.7-6.4',  min: 5.7, max: 6.5,  category: 'Prediabetic' },
  { label: '6.5-7.4',  min: 6.5, max: 7.5,  category: 'Diabetic' },
  { label: '7.5-8.9',  min: 7.5, max: 9.0,  category: 'Diabetic' },
  { label: '9.0+',     min: 9.0, max: Infinity, category: 'Diabetic' },
]

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

// ──── Enrollment Trend Chart ────

function EnrollmentTrendChart({
  data,
}: {
  data: Array<{ date: string; count: number }>
}) {
  const chartData = useMemo(() => {
    return data.reduce<Array<{ date: string; count: number; cumulative: number; label: string }>>(
      (acc, d) => {
        const prev = acc.length > 0 ? acc[acc.length - 1].cumulative : 0
        acc.push({ ...d, cumulative: prev + d.count, label: formatDateLabel(d.date) })
        return acc
      },
      [],
    )
  }, [data])

  const latestCumulative =
    chartData.length > 0 ? chartData[chartData.length - 1].cumulative : 0

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
            <linearGradient id="enrollGradient" x1="0" y1="0" x2="0" y2="1">
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
          <Area
            type="monotone"
            dataKey="cumulative"
            name="Cumulative"
            stroke={COLORS.primary}
            strokeWidth={2.5}
            fill="url(#enrollGradient)"
            dot={false}
            activeDot={{ r: 5, fill: COLORS.primary, stroke: '#fff', strokeWidth: 2 }}
          />
          <Area
            type="monotone"
            dataKey="count"
            name="New This Month"
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
      subtitle="Age-sex distribution of enrolled participants"
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
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: SEX_COLORS.Male }}
                    />
                    <span className="text-gray-500">Male:</span>
                    <span className="font-semibold tabular-nums">{d?.maleAbs ?? 0}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: SEX_COLORS.Female }}
                    />
                    <span className="text-gray-500">Female:</span>
                    <span className="font-semibold tabular-nums">{d?.femaleAbs ?? 0}</span>
                  </div>
                </div>
              )
            }}
          />
          <Bar
            dataKey="male"
            name="Male"
            fill={SEX_COLORS.Male}
            radius={[4, 0, 0, 4]}
            barSize={20}
          />
          <Bar
            dataKey="female"
            name="Female"
            fill={SEX_COLORS.Female}
            radius={[0, 4, 4, 0]}
            barSize={20}
          />
          <Legend
            verticalAlign="bottom"
            formatter={(value: string) => (
              <span className="text-xs text-gray-600">{value}</span>
            )}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

// ──── Site Distribution Chart ────

function SiteDistributionChart({
  data,
}: {
  data: Array<{ site_code: string; site_name: string; count: number }>
}) {
  const chartData = useMemo(
    () =>
      [...data]
        .sort((a, b) => b.count - a.count)
        .map((s, i) => ({
          ...s,
          fill: SITE_COLORS[i % SITE_COLORS.length],
          shortName: s.site_name.length > 25 ? s.site_name.slice(0, 22) + '...' : s.site_name,
        })),
    [data],
  )

  return (
    <ChartCard
      title="Site Distribution"
      subtitle={`${data.length} active collection site${data.length !== 1 ? 's' : ''}`}
      empty={data.length === 0}
      emptyMessage="No site data available"
      height="h-72"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
        >
          <CartesianGrid {...RECHARTS_THEME.grid} horizontal={false} />
          <XAxis
            type="number"
            tick={{ ...RECHARTS_THEME.tick, fill: '#000000' }}
            axisLine={{ stroke: COLORS.gray200 }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="shortName"
            tick={{ ...RECHARTS_THEME.tick, fill: '#000000' }}
            axisLine={false}
            tickLine={false}
            width={140}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0]?.payload
              return (
                <div style={RECHARTS_THEME.tooltip.contentStyle} className="px-3 py-2">
                  <p className="text-xs font-semibold text-gray-700 mb-1">{d?.site_name}</p>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-500">Enrolled:</span>
                    <span className="font-semibold tabular-nums">
                      {d?.count?.toLocaleString()}
                    </span>
                  </div>
                </div>
              )
            }}
          />
          <Bar dataKey="count" name="Enrolled" radius={[0, 4, 4, 0]} barSize={18}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

// ──── Age Group Distribution (Donut | Bar | Histogram) ────

function AgeGroupChart({ demographics }: { demographics: DemographicStats }) {
  const [view, setView] = useState<'donut' | 'bar' | 'histogram' | 'continuous'>('donut')

  const donutData = useMemo(
    () =>
      demographics.by_age_group.map(d => ({
        name: AGE_GROUP_LABELS[d.age_group] || d.age_group,
        value: d.count,
        fill: AGE_GROUP_COLORS[d.age_group] || COLORS.gray400,
      })),
    [demographics.by_age_group],
  )

  const donutTotal = donutData.reduce((sum, d) => sum + d.value, 0)

  const histogramData = useMemo(
    () => binValues(demographics.age_distribution, AGE_BINS_STUDY),
    [demographics.age_distribution],
  )

  type AgeView = 'donut' | 'bar' | 'histogram' | 'continuous'
  const toggleOptions: Array<{ value: AgeView; label: string }> = [
    { value: 'donut', label: 'Donut' },
    { value: 'bar', label: 'Bar' },
    { value: 'histogram', label: 'Histogram' },
    { value: 'continuous', label: 'Continuous' },
  ]

  const isEmpty =
    (view === 'histogram' || view === 'continuous')
      ? demographics.age_distribution.length === 0
      : demographics.by_age_group.length === 0

  const emptyMessage =
    (view === 'histogram' || view === 'continuous')
      ? 'No continuous age data available'
      : 'No age group data available'

  return (
    <ChartCard
      title="Age Distribution"
      subtitle={
        view === 'histogram'
          ? `${demographics.age_distribution.length} participants — 5 study age categories`
          : view === 'continuous'
            ? `${demographics.age_distribution.length} participants — 5-year bins`
            : `${donutTotal.toLocaleString()} total participants`
      }
      empty={isEmpty}
      emptyMessage={emptyMessage}
      height="h-72"
      action={
        <ChartToggle value={view} onChange={setView} options={toggleOptions} />
      }
    >
      {view === 'donut' && (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={donutData}
              cx="50%"
              cy="50%"
              innerRadius="55%"
              outerRadius="80%"
              paddingAngle={2}
              dataKey="value"
              nameKey="name"
              stroke="none"
            >
              {donutData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const d = payload[0]
                const pct =
                  donutTotal > 0
                    ? (((d?.value as number) / donutTotal) * 100).toFixed(1)
                    : '0'
                return (
                  <div style={RECHARTS_THEME.tooltip.contentStyle} className="px-3 py-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: d?.payload?.fill }}
                      />
                      <span className="font-semibold text-gray-700">{d?.name}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {(d?.value as number)?.toLocaleString()} ({pct}%)
                    </p>
                  </div>
                )
              }}
            />
            <Legend
              verticalAlign="bottom"
              iconType="circle"
              iconSize={8}
              formatter={(value: string) => (
                <span className="text-xs text-gray-600">{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      )}

      {view === 'bar' && (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={donutData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
            <CartesianGrid {...RECHARTS_THEME.grid} />
            <XAxis
              dataKey="name"
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
            <Bar dataKey="value" name="Participants" radius={[4, 4, 0, 0]} barSize={32}>
              {donutData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      {view === 'histogram' && (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={histogramData}
            margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
            barCategoryGap="4%"
          >
            <defs>
              <linearGradient id="ageHistGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.primary} stopOpacity={0.9} />
                <stop offset="100%" stopColor={COLORS.teal} stopOpacity={0.6} />
              </linearGradient>
            </defs>
            <CartesianGrid {...RECHARTS_THEME.grid} />
            <XAxis
              dataKey="label"
              tick={{ ...RECHARTS_THEME.tick, fill: '#000000' }}
              axisLine={{ stroke: COLORS.gray200 }}
              tickLine={false}
              label={{ value: 'Age (years)', position: 'insideBottom', offset: -12, style: { fontSize: 10, fill: '#000000' } }}
            />
            <YAxis
              tick={{ ...RECHARTS_THEME.tick, fill: '#000000' }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip content={<ChartTooltip />} />
            <Bar
              dataKey="count"
              name="Participants"
              fill="url(#ageHistGrad)"
              radius={[3, 3, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      )}

      {view === 'continuous' && (() => {
        // True continuous histogram: 1-year bins from raw age values
        const minAge = Math.floor(Math.min(...demographics.age_distribution, 18))
        const maxAge = Math.ceil(Math.max(...demographics.age_distribution, 90))
        const yearBins = Array.from({ length: maxAge - minAge + 1 }, (_, i) => {
          const age = minAge + i
          return {
            age,
            count: demographics.age_distribution.filter(v => Math.floor(v) === age).length,
          }
        }).filter(b => b.age >= 18 && b.age <= 95)

        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={yearBins}
              margin={{ top: 10, right: 10, left: 0, bottom: 24 }}
              barCategoryGap={0}
              barGap={0}
            >
              <defs>
                <linearGradient id="ageContinuousGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={COLORS.primary} stopOpacity={0.85} />
                  <stop offset="100%" stopColor={COLORS.teal} stopOpacity={0.65} />
                </linearGradient>
              </defs>
              <CartesianGrid {...RECHARTS_THEME.grid} vertical={false} />
              <XAxis
                dataKey="age"
                type="number"
                domain={[18, 95]}
                tick={{ ...RECHARTS_THEME.tick, fill: '#000000' }}
                axisLine={{ stroke: '#CBD5E1' }}
                tickLine={false}
                label={{ value: 'Age (years)', position: 'insideBottom', offset: -14, style: { fontSize: 11, fill: '#000000', fontWeight: 500 } }}
              />
              <YAxis
                tick={{ ...RECHARTS_THEME.tick, fill: '#000000' }}
                axisLine={false}
                tickLine={false}
                width={35}
                label={{ value: 'Count', angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 11, fill: '#000000', fontWeight: 500 } }}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0]?.payload
                  return (
                    <div style={RECHARTS_THEME.tooltip.contentStyle} className="px-3 py-2">
                      <p className="text-xs font-semibold text-gray-800">Age {d?.age}</p>
                      <p className="text-xs text-gray-600">{d?.count} participant{d?.count !== 1 ? 's' : ''}</p>
                    </div>
                  )
                }}
              />
              <Bar
                dataKey="count"
                fill="url(#ageContinuousGrad)"
                radius={0}
              />
            </BarChart>
          </ResponsiveContainer>
        )
      })()}
    </ChartCard>
  )
}

// ──── Sex Distribution (Donut | Bar) ────

function GenderChart({ data }: { data: Array<{ sex: string; count: number }> }) {
  const [view, setView] = useState<DistributionView>('donut')

  const chartData = useMemo(
    () =>
      data.map(d => ({
        name: SEX_LABELS[d.sex] || d.sex,
        value: d.count,
        fill: SEX_COLORS[d.sex] || COLORS.gray400,
      })),
    [data],
  )

  const total = chartData.reduce((sum, d) => sum + d.value, 0)

  const toggleOptions: Array<{ value: DistributionView; label: string }> = [
    { value: 'donut', label: 'Donut' },
    { value: 'bar', label: 'Bar' },
  ]

  return (
    <ChartCard
      title="Sex Distribution"
      subtitle="Male vs Female enrollment"
      empty={data.length === 0}
      emptyMessage="No sex distribution data available"
      height="h-72"
      action={
        <ChartToggle value={view} onChange={setView} options={toggleOptions} />
      }
    >
      {view === 'donut' && (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius="55%"
              outerRadius="80%"
              paddingAngle={3}
              dataKey="value"
              nameKey="name"
              stroke="none"
            >
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const d = payload[0]
                const pct =
                  total > 0
                    ? (((d?.value as number) / total) * 100).toFixed(1)
                    : '0'
                return (
                  <div style={RECHARTS_THEME.tooltip.contentStyle} className="px-3 py-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: d?.payload?.fill }}
                      />
                      <span className="font-semibold text-gray-700">{d?.name}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {(d?.value as number)?.toLocaleString()} ({pct}%)
                    </p>
                  </div>
                )
              }}
            />
            <Legend
              verticalAlign="bottom"
              iconType="circle"
              iconSize={8}
              formatter={(value: string) => (
                <span className="text-xs text-gray-600">{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      )}

      {view === 'bar' && (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
            <CartesianGrid {...RECHARTS_THEME.grid} />
            <XAxis
              dataKey="name"
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
            <Bar dataKey="value" name="Participants" radius={[4, 4, 0, 0]} barSize={48}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  )
}

// ──── Urban / Rural Donut ────

function UrbanRuralChart({
  data,
}: {
  data: { urban: number; rural: number }
}) {
  const [view, setView] = useState<DistributionView>('donut')

  const chartData = useMemo(
    () => [
      { name: 'Urban', value: data.urban, fill: '#059669' },
      { name: 'Rural', value: data.rural, fill: '#F97316' },
    ],
    [data],
  )

  const total = data.urban + data.rural

  const toggleOptions: Array<{ value: DistributionView; label: string }> = [
    { value: 'donut', label: 'Donut' },
    { value: 'bar', label: 'Bar' },
  ]

  return (
    <ChartCard
      title="Urban vs Rural"
      subtitle={`${total.toLocaleString()} participants with site classification`}
      empty={total === 0}
      emptyMessage="No urban/rural data available"
      height="h-72"
      action={
        <ChartToggle value={view} onChange={setView} options={toggleOptions} />
      }
    >
      {view === 'donut' && (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius="55%"
              outerRadius="80%"
              paddingAngle={3}
              dataKey="value"
              nameKey="name"
              stroke="none"
            >
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const d = payload[0]
                const pct =
                  total > 0
                    ? (((d?.value as number) / total) * 100).toFixed(1)
                    : '0'
                return (
                  <div style={RECHARTS_THEME.tooltip.contentStyle} className="px-3 py-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: d?.payload?.fill }}
                      />
                      <span className="font-semibold text-gray-700">{d?.name}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {(d?.value as number)?.toLocaleString()} ({pct}%)
                    </p>
                  </div>
                )
              }}
            />
            <Legend
              verticalAlign="bottom"
              iconType="circle"
              iconSize={8}
              formatter={(value: string) => (
                <span className="text-xs text-gray-600">{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      )}

      {view === 'bar' && (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
            <CartesianGrid {...RECHARTS_THEME.grid} />
            <XAxis
              dataKey="name"
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
            <Bar dataKey="value" name="Participants" radius={[4, 4, 0, 0]} barSize={48}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  )
}

// ──── HbA1c Status Chart (Donut | Bar | Histogram) ────

function HbA1cChart({ demographics }: { demographics: DemographicStats }) {
  const [view, setView] = useState<DistributionView>('donut')

  const statusData = useMemo(
    () => [
      {
        name: 'Normal',
        value: demographics.hba1c_status.normal,
        fill: HBA1C_COLORS.Normal,
      },
      {
        name: 'Prediabetic',
        value: demographics.hba1c_status.prediabetic,
        fill: HBA1C_COLORS.Prediabetic,
      },
      {
        name: 'Diabetic',
        value: demographics.hba1c_status.diabetic,
        fill: HBA1C_COLORS.Diabetic,
      },
    ],
    [demographics.hba1c_status],
  )

  const total = statusData.reduce((sum, d) => sum + d.value, 0)

  const histogramData = useMemo(
    () =>
      HBAIC_BINS.map(bin => ({
        label: bin.label,
        count: demographics.hba1c_distribution.filter(
          v => v >= bin.min && v < bin.max,
        ).length,
        category: bin.category,
        fill:
          HBA1C_COLORS[bin.category as keyof typeof HBA1C_COLORS] || COLORS.gray400,
      })),
    [demographics.hba1c_distribution],
  )

  const toggleOptions: Array<{ value: DistributionView; label: string }> = [
    { value: 'donut', label: 'Donut' },
    { value: 'bar', label: 'Bar' },
    { value: 'histogram', label: 'Histogram' },
  ]

  const isEmpty =
    view === 'histogram' ? demographics.hba1c_distribution.length === 0 : total === 0

  const emptyMessage =
    view === 'histogram'
      ? 'No continuous HbA1c data available'
      : 'No HbA1c classification data available'

  return (
    <ChartCard
      title="HbA1c Status"
      subtitle={
        view === 'histogram'
          ? `${demographics.hba1c_distribution.length} participants with recorded HbA1c`
          : `${total.toLocaleString()} participants with HbA1c data`
      }
      empty={isEmpty}
      emptyMessage={emptyMessage}
      height="h-72"
      action={
        <ChartToggle value={view} onChange={setView} options={toggleOptions} />
      }
    >
      {view === 'donut' && (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={statusData}
              cx="50%"
              cy="50%"
              innerRadius="55%"
              outerRadius="80%"
              paddingAngle={2}
              dataKey="value"
              nameKey="name"
              stroke="none"
            >
              {statusData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const d = payload[0]
                const pct =
                  total > 0
                    ? (((d?.value as number) / total) * 100).toFixed(1)
                    : '0'
                return (
                  <div style={RECHARTS_THEME.tooltip.contentStyle} className="px-3 py-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: d?.payload?.fill }}
                      />
                      <span className="font-semibold text-gray-700">{d?.name}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {(d?.value as number)?.toLocaleString()} ({pct}%)
                    </p>
                  </div>
                )
              }}
            />
            <Legend
              verticalAlign="bottom"
              iconType="circle"
              iconSize={8}
              formatter={(value: string) => (
                <span className="text-xs text-gray-600">{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      )}

      {view === 'bar' && (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={statusData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
            <CartesianGrid {...RECHARTS_THEME.grid} />
            <XAxis
              dataKey="name"
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
            <Bar dataKey="value" name="Participants" radius={[4, 4, 0, 0]} barSize={48}>
              {statusData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      {view === 'histogram' && (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={histogramData}
            margin={{ top: 10, right: 10, left: 0, bottom: 24 }}
            barCategoryGap="4%"
          >
            <CartesianGrid {...RECHARTS_THEME.grid} />
            <XAxis
              dataKey="label"
              tick={{ ...RECHARTS_THEME.tick, fill: '#000000' }}
              axisLine={{ stroke: COLORS.gray200 }}
              tickLine={false}
              label={{
                value: 'HbA1c (%)',
                position: 'insideBottom',
                offset: -12,
                style: { fontSize: 10, fill: '#000000' },
              }}
            />
            <YAxis
              tick={{ ...RECHARTS_THEME.tick, fill: '#000000' }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const d = payload[0]?.payload
                return (
                  <div style={RECHARTS_THEME.tooltip.contentStyle} className="px-3 py-2">
                    <p className="text-xs font-medium text-gray-700 mb-1">
                      HbA1c {label}%
                    </p>
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: d?.fill }}
                      />
                      <span className="text-gray-500">{d?.category}:</span>
                      <span className="font-semibold tabular-nums text-gray-800">
                        {d?.count?.toLocaleString()}
                      </span>
                    </div>
                  </div>
                )
              }}
            />
            <Bar dataKey="count" name="Participants" radius={[3, 3, 0, 0]}>
              {histogramData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  )
}

// ──── Enrollment Matrix Table ────

function EnrollmentMatrixTable() {
  const { data, isLoading, isError } = useDashboardEnrollmentMatrix()
  const [showRemaining, setShowRemaining] = useState(false)

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="h-4 w-40 skeleton rounded" />
          <div className="h-3 w-56 skeleton rounded mt-1.5" />
        </div>
        <div className="p-4 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 skeleton rounded" />
          ))}
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 p-6 text-center">
        <p className="text-sm text-red-600">Failed to load enrollment matrix data.</p>
      </div>
    )
  }

  if (!data || data.sites.length === 0) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white p-8 text-center">
        <Users className="h-8 w-8 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500">No enrollment matrix data available</p>
      </div>
    )
  }

  const { sites, group_codes, matrix, totals } = data
  const grand = (totals as Record<string, unknown>).grand as
    | { count: number; target: number }
    | undefined ??
    Object.values(totals.by_site ?? {}).reduce(
      (acc, s) => ({ count: acc.count + (s?.count ?? 0), target: acc.target + (s?.target ?? 0) }),
      { count: 0, target: 0 },
    )
  const grandPct = grand.target > 0 ? Math.min((grand.count / grand.target) * 100, 100) : 0

  return (
    <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Enrollment Matrix</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {showRemaining
              ? 'Slots remaining per site and participant group.'
              : 'Count / target per site and participant group. Progress bars show completion rate.'}
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
        <table
          className="w-full text-xs"
          aria-label="Enrollment matrix showing participant counts by site and group code"
        >
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold text-gray-600 whitespace-nowrap">
                Site
              </th>
              {group_codes.map(gc => (
                <th
                  key={gc}
                  className="px-3 py-2.5 text-center font-semibold text-gray-600 whitespace-nowrap"
                >
                  {gc}
                </th>
              ))}
              <th className="px-4 py-2.5 text-right font-semibold text-gray-600 whitespace-nowrap">
                Site Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sites.map(site => {
              const siteCode = typeof site === 'string' ? site : site.code
              const siteName = typeof site === 'string' ? site : site.name || site.code
              const siteTotal = totals.by_site[siteCode]
              const sitePct =
                siteTotal && siteTotal.target > 0
                  ? Math.min((siteTotal.count / siteTotal.target) * 100, 100)
                  : 0
              return (
                <tr key={siteCode} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2 font-semibold text-gray-800 whitespace-nowrap">
                    {siteName}
                  </td>
                  {group_codes.map(gc => {
                    const cell = matrix[siteCode]?.[gc]
                    const count = cell?.count ?? 0
                    const target = cell?.target ?? 0
                    const remaining = Math.max(0, target - count)
                    const pct = target > 0 ? Math.min((count / target) * 100, 100) : 0
                    const barColor =
                      pct >= 100
                        ? COLORS.success
                        : pct >= 75
                          ? COLORS.primary
                          : pct >= 40
                            ? COLORS.teal
                            : COLORS.gray400
                    return (
                      <td key={gc} className="px-3 py-2 text-center">
                        <span className="tabular-nums text-gray-700">
                          {showRemaining ? (
                            target > 0 ? (
                              <span
                                className={
                                  remaining > 0
                                    ? 'text-amber-600 font-medium'
                                    : 'text-emerald-600 font-medium'
                                }
                              >
                                {remaining > 0 ? remaining : 'Full'}
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )
                          ) : (
                            <>
                              {count > 0 ? count : <span className="text-gray-300">—</span>}
                              {target > 0 && (
                                <span className="text-gray-400">/{target}</span>
                              )}
                            </>
                          )}
                        </span>
                        {target > 0 && (
                          <div className="mt-1 h-1 w-full rounded-full bg-gray-100 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700 ease-out"
                              style={{ width: `${pct}%`, backgroundColor: barColor }}
                              aria-label={`${pct.toFixed(0)}% complete`}
                            />
                          </div>
                        )}
                      </td>
                    )
                  })}
                  <td className="px-4 py-2 text-right">
                    <span className="tabular-nums font-semibold text-gray-800">
                      {siteTotal?.count?.toLocaleString() ?? '—'}
                    </span>
                    {siteTotal?.target != null && siteTotal.target > 0 && (
                      <>
                        <span className="text-gray-400">
                          /{siteTotal.target.toLocaleString()}
                        </span>
                        <div className="mt-1 h-1 w-full rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700 ease-out"
                            style={{
                              width: `${sitePct}%`,
                              backgroundColor:
                                sitePct >= 100 ? COLORS.success : COLORS.primary,
                            }}
                            aria-label={`${sitePct.toFixed(0)}% of site target`}
                          />
                        </div>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="bg-gray-50 border-t border-gray-200">
            <tr>
              <td className="px-4 py-2.5 font-bold text-gray-700">Group Total</td>
              {group_codes.map(gc => {
                const groupTotal = totals.by_group[gc]
                return (
                  <td key={gc} className="px-3 py-2.5 text-center">
                    <span className="tabular-nums font-semibold text-gray-700">
                      {groupTotal?.count?.toLocaleString() ?? '—'}
                    </span>
                    {groupTotal?.target != null && groupTotal.target > 0 && (
                      <span className="text-gray-400">/{groupTotal.target.toLocaleString()}</span>
                    )}
                  </td>
                )
              })}
              <td className="px-4 py-2.5 text-right">
                <span className="tabular-nums font-bold text-gray-800">
                  {grand.count.toLocaleString()}
                </span>
                {grand.target > 0 && (
                  <>
                    <span className="text-gray-400">/{grand.target.toLocaleString()}</span>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{
                          width: `${grandPct}%`,
                          backgroundColor:
                            grandPct >= 100 ? COLORS.success : COLORS.primary,
                        }}
                        aria-label={`Overall ${grandPct.toFixed(0)}% of study target`}
                      />
                    </div>
                  </>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="px-4 py-2 text-[10px] text-gray-400 border-t border-gray-100">
        Group codes: first digit = age group (1=18-29, 2=30-44, 3=45-59, 4=60-74, 5=75+),
        letter = sex (A=male, B=female). Progress bar color: green = 100%, blue = 75%+,
        teal = 40%+, gray = &lt;40%.
      </p>
    </div>
  )
}

// ──── Ratio Card Row ────

interface RatioCardProps {
  title: string
  icon: React.ReactNode
  accentColor: string
  children: React.ReactNode
}

function RatioCard({ title, icon, accentColor, children }: RatioCardProps) {
  return (
    <div
      className="relative overflow-hidden rounded-xl bg-white border border-gray-100 p-5 transition-all duration-200 hover:shadow-[0_4px_12px_-2px_rgba(0,0,0,0.08)] hover:border-gray-200"
    >
      {/* Accent stripe */}
      <div
        className="absolute top-0 left-0 w-1 h-full rounded-r-full"
        style={{ backgroundColor: accentColor }}
      />
      {/* Subtle gradient background */}
      <div
        className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-[0.04] -translate-y-6 translate-x-6"
        style={{ backgroundColor: accentColor }}
      />
      <div className="flex items-start justify-between">
        <div className="space-y-1 min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-400">{title}</p>
          {children}
        </div>
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg opacity-90 flex-shrink-0 ml-3"
          style={{ backgroundColor: `${accentColor}12`, color: accentColor }}
        >
          {icon}
        </div>
      </div>
    </div>
  )
}

// ──── Main Page ────

export function EnrollmentDashboardPage() {
  const { data, isLoading, isError } = useDashboardEnrollment()

  const totalEnrolled = data?.total_participants ?? 0
  const activeSites = data?.by_site?.length ?? 0
  const demographics = data?.demographics
  const recent30d = data?.recent_30d ?? 0

  // M:F ratio
  const maleCount =
    demographics?.by_sex?.find(d => d.sex === 'M' || d.sex === 'A')?.count ?? 0
  const femaleCount =
    demographics?.by_sex?.find(d => d.sex === 'F' || d.sex === 'B')?.count ?? 0
  const ratioStr =
    femaleCount > 0
      ? `${(maleCount / femaleCount).toFixed(2)} : 1`
      : maleCount > 0
        ? `${maleCount} : 0`
        : '--'

  // Urban/Rural
  const urbanCount = demographics?.urban_rural?.urban ?? 0
  const ruralCount = demographics?.urban_rural?.rural ?? 0
  const urbanRuralTotal = urbanCount + ruralCount
  const urbanRuralRatio =
    ruralCount > 0
      ? `${(urbanCount / ruralCount).toFixed(2)} : 1`
      : urbanCount > 0
        ? `${urbanCount} : 0`
        : '--'

  // Age summary from continuous distribution — memoized to avoid reference churn
  const ageValues = useMemo(
    () => demographics?.age_distribution ?? [],
    [demographics?.age_distribution],
  )
  const { medianAge, minAge, maxAge } = useMemo(() => {
    if (ageValues.length === 0) return { medianAge: null, minAge: null, maxAge: null }
    const sorted = [...ageValues].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    const median =
      sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
    return {
      medianAge: median,
      minAge: sorted[0],
      maxAge: sorted[sorted.length - 1],
    }
  }, [ageValues])

  // ── Loading ──
  if (isLoading) {
    return (
      <div>
        <PageHeader
          title="Enrollment Analytics"
          subtitle="Participant enrollment statistics across collection sites"
          icon={<Users className="h-5 w-5" />}
          gradient
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
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
        <PageHeader
          title="Enrollment Analytics"
          subtitle="Participant enrollment statistics across collection sites"
          icon={<Users className="h-5 w-5" />}
          gradient
        />
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
          <p className="text-sm font-medium text-red-600">
            Failed to load enrollment data. Please try again later.
          </p>
        </div>
      </div>
    )
  }

  // ── Empty ──
  if (totalEnrolled === 0) {
    return (
      <div>
        <PageHeader
          title="Enrollment Analytics"
          subtitle="Participant enrollment statistics across collection sites"
          icon={<Users className="h-5 w-5" />}
          gradient
        />
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <Users className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-600">No participants enrolled yet</p>
          <p className="text-xs text-gray-400 mt-1">
            Enrollment data will appear here once participants are registered.
          </p>
        </div>
      </div>
    )
  }

  // ── Populated ──
  return (
    <div>
      <PageHeader
        title="Enrollment Analytics"
        subtitle="Participant enrollment statistics across collection sites"
        icon={<Users className="h-5 w-5" />}
        gradient
      />

      {/* Row 0: Top Stat Cards — 2 fixed + 2 summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard
          title="Total Enrolled"
          value={totalEnrolled.toLocaleString()}
          subtitle="All-time participants"
          icon={<Users className="h-5 w-5" />}
          accentColor={COLORS.primary}
        />
        <StatCard
          title="Active Sites"
          value={activeSites}
          subtitle="Collection sites with data"
          icon={<MapPin className="h-5 w-5" />}
          accentColor={COLORS.teal}
        />
        <StatCard
          title="Recent (30d)"
          value={recent30d > 0 ? `+${recent30d.toLocaleString()}` : '0'}
          subtitle="Enrolled in last 30 days"
          icon={<CalendarPlus className="h-5 w-5" />}
          accentColor={COLORS.success}
        />
        <StatCard
          title="HbA1c Tested"
          value={(
            (demographics?.hba1c_status.normal ?? 0) +
            (demographics?.hba1c_status.prediabetic ?? 0) +
            (demographics?.hba1c_status.diabetic ?? 0)
          ).toLocaleString()}
          subtitle={`${demographics?.hba1c_status.diabetic ?? 0} diabetic, ${demographics?.hba1c_status.prediabetic ?? 0} prediabetic`}
          icon={<Droplets className="h-5 w-5" />}
          accentColor={HBA1C_COLORS.Normal}
        />
      </div>

      {/* Row 1: Ratio Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        {/* M:F Ratio */}
        <RatioCard
          title="M : F Ratio"
          icon={<UserCheck className="h-5 w-5" />}
          accentColor="#8B5CF6"
        >
          <p className="text-2xl font-bold text-gray-900 tabular-nums">{ratioStr}</p>
          <p className="text-xs text-gray-500">
            {maleCount.toLocaleString()} male, {femaleCount.toLocaleString()} female
          </p>
        </RatioCard>

        {/* Urban:Rural Ratio */}
        <RatioCard
          title="Urban : Rural"
          icon={<MapPin className="h-5 w-5" />}
          accentColor="#059669"
        >
          <p className="text-2xl font-bold text-gray-900 tabular-nums">{urbanRuralRatio}</p>
          <p className="text-xs text-gray-500">
            {urbanRuralTotal > 0
              ? `${urbanCount.toLocaleString()} urban, ${ruralCount.toLocaleString()} rural`
              : 'Site classification pending'}
          </p>
        </RatioCard>

        {/* HbA1c Status */}
        <RatioCard
          title="HbA1c Status"
          icon={<Activity className="h-5 w-5" />}
          accentColor={HBA1C_COLORS.Normal}
        >
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-xs font-semibold tabular-nums" style={{ color: HBA1C_COLORS.Normal }}>
              {(demographics?.hba1c_status.normal ?? 0).toLocaleString()} Normal
            </span>
            <span className="text-gray-300 text-xs">|</span>
            <span className="text-xs font-semibold tabular-nums" style={{ color: HBA1C_COLORS.Prediabetic }}>
              {(demographics?.hba1c_status.prediabetic ?? 0).toLocaleString()} Pre
            </span>
            <span className="text-gray-300 text-xs">|</span>
            <span className="text-xs font-semibold tabular-nums" style={{ color: HBA1C_COLORS.Diabetic }}>
              {(demographics?.hba1c_status.diabetic ?? 0).toLocaleString()} DM
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Normal &lt;5.7%, Pre 5.7-6.4%, DM ≥6.5%
          </p>
        </RatioCard>

        {/* Age Summary */}
        <RatioCard
          title="Age Summary"
          icon={<Users className="h-5 w-5" />}
          accentColor={COLORS.primary}
        >
          {medianAge !== null ? (
            <>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">
                {medianAge.toFixed(0)} yrs
              </p>
              <p className="text-xs text-gray-500">
                Median age, range {minAge?.toFixed(0)}–{maxAge?.toFixed(0)} yrs
              </p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-gray-900">--</p>
              <p className="text-xs text-gray-500">Age data pending</p>
            </>
          )}
        </RatioCard>
      </div>

      {/* Row 2: Trend + Pyramid */}
      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <EnrollmentTrendChart data={data?.enrollment_over_time ?? []} />
        {demographics ? (
          <DemographicsPyramid demographics={demographics} />
        ) : (
          <ChartCard
            title="Demographics Pyramid"
            subtitle="Age-sex distribution"
            empty
            emptyMessage="Demographic data not yet available from the API"
          >
            {null}
          </ChartCard>
        )}
      </div>

      {/* Row 3: Site Distribution + Urban/Rural + HbA1c Donut */}
      <div className="grid gap-4 lg:grid-cols-3 mb-6">
        <SiteDistributionChart data={data?.by_site ?? []} />
        {demographics ? (
          <UrbanRuralChart data={demographics.urban_rural} />
        ) : (
          <ChartCard title="Urban vs Rural" empty emptyMessage="No data" height="h-72">
            {null}
          </ChartCard>
        )}
        {demographics ? (
          <HbA1cChart demographics={demographics} />
        ) : (
          <ChartCard title="HbA1c Status" empty emptyMessage="No data" height="h-72">
            {null}
          </ChartCard>
        )}
      </div>

      {/* Row 4: Age Distribution + Sex Distribution */}
      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        {demographics ? (
          <AgeGroupChart demographics={demographics} />
        ) : (
          <ChartCard title="Age Distribution" empty emptyMessage="No data" height="h-72">
            {null}
          </ChartCard>
        )}
        {demographics ? (
          <GenderChart data={demographics.by_sex} />
        ) : (
          <ChartCard title="Sex Distribution" empty emptyMessage="No data" height="h-72">
            {null}
          </ChartCard>
        )}
      </div>

      {/* Row 5: Enrollment Matrix */}
      <EnrollmentMatrixTable />
    </div>
  )
}
