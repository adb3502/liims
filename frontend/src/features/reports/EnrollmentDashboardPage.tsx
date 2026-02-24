import { useMemo } from 'react'
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
import { Users, MapPin, UserCheck, CalendarPlus } from 'lucide-react'

// ──── Helpers ────

function formatDateLabel(date: string): string {
  try {
    const d = new Date(date)
    return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  } catch {
    return date
  }
}

function formatMonth(date: string): string {
  try {
    const d = new Date(date)
    return d.toLocaleDateString('en-US', { month: 'short' })
  } catch {
    return date
  }
}

// ──── Custom Tooltip ────

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={RECHARTS_THEME.tooltip.contentStyle} className="px-3 py-2">
      <p className="text-xs font-medium text-gray-700 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
          <span className="text-gray-500">{entry.name}:</span>
          <span className="font-semibold text-gray-800 tabular-nums">{entry.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

// ──── Enrollment Trend Chart ────

function EnrollmentTrendChart({ data }: { data: Array<{ date: string; count: number }> }) {
  const chartData = useMemo(() => {
    let cumulative = 0
    return data.slice(-12).map(d => {
      cumulative += d.count
      return {
        ...d,
        cumulative,
        label: formatDateLabel(d.date),
        month: formatMonth(d.date),
      }
    })
  }, [data])

  const latestCumulative = chartData.length > 0 ? chartData[chartData.length - 1].cumulative : 0

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
            tick={{ ...RECHARTS_THEME.axis, fill: COLORS.gray400 }}
            axisLine={{ stroke: COLORS.gray200 }}
            tickLine={false}
          />
          <YAxis
            tick={{ ...RECHARTS_THEME.axis, fill: COLORS.gray400 }}
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
            name="New This Period"
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
    return ageGroups.map(ag => {
      const maleEntry = demographics.by_age_sex.find(d => d.age_group === ag && (d.sex === 'M' || d.sex === 'A'))
      const femaleEntry = demographics.by_age_sex.find(d => d.age_group === ag && (d.sex === 'F' || d.sex === 'B'))
      return {
        ageGroup: AGE_GROUP_LABELS[ag] || ag,
        male: -(maleEntry?.count ?? 0), // negative for left side
        female: femaleEntry?.count ?? 0,
        maleAbs: maleEntry?.count ?? 0,
        femaleAbs: femaleEntry?.count ?? 0,
      }
    }).reverse() // 75+ on top
  }, [demographics])

  const maxVal = Math.max(
    ...pyramidData.map(d => Math.max(d.maleAbs, d.femaleAbs)),
    1
  )
  // Round up to next nice number for domain
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
            tick={{ ...RECHARTS_THEME.axis, fill: COLORS.gray400 }}
            axisLine={{ stroke: COLORS.gray200 }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="ageGroup"
            tick={{ ...RECHARTS_THEME.axis, fill: COLORS.gray500, fontWeight: 600 }}
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
          <Legend
            verticalAlign="bottom"
            formatter={(value: string) => <span className="text-xs text-gray-600">{value}</span>}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

// ──── Site Distribution Chart ────

function SiteDistributionChart({ data }: { data: Array<{ site_code: string; site_name: string; count: number }> }) {
  const chartData = useMemo(() =>
    [...data]
      .sort((a, b) => b.count - a.count)
      .map((s, i) => ({
        ...s,
        fill: SITE_COLORS[i % SITE_COLORS.length],
        shortName: s.site_name.length > 25 ? s.site_name.slice(0, 22) + '...' : s.site_name,
      })),
    [data]
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
            tick={{ ...RECHARTS_THEME.axis, fill: COLORS.gray400 }}
            axisLine={{ stroke: COLORS.gray200 }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="shortName"
            tick={{ ...RECHARTS_THEME.axis, fill: COLORS.gray500 }}
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
                    <span className="font-semibold tabular-nums">{d?.count?.toLocaleString()}</span>
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

// ──── Age Group Donut ────

function AgeGroupDonut({ data }: { data: Array<{ age_group: string; count: number }> }) {
  const chartData = useMemo(() =>
    data.map(d => ({
      name: AGE_GROUP_LABELS[d.age_group] || d.age_group,
      value: d.count,
      fill: AGE_GROUP_COLORS[d.age_group] || COLORS.gray400,
    })),
    [data]
  )

  const total = chartData.reduce((sum, d) => sum + d.value, 0)

  return (
    <ChartCard
      title="Age Distribution"
      subtitle={`${total.toLocaleString()} total participants`}
      empty={data.length === 0}
      emptyMessage="No age group data available"
      height="h-72"
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius="55%"
            outerRadius="80%"
            paddingAngle={2}
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
              const pct = total > 0 ? ((d?.value as number) / total * 100).toFixed(1) : '0'
              return (
                <div style={RECHARTS_THEME.tooltip.contentStyle} className="px-3 py-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d?.payload?.fill }} />
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
            formatter={(value: string) => <span className="text-xs text-gray-600">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

// ──── Gender Distribution Donut ────

function GenderDonut({ data }: { data: Array<{ sex: string; count: number }> }) {
  const chartData = useMemo(() =>
    data.map(d => ({
      name: SEX_LABELS[d.sex] || d.sex,
      value: d.count,
      fill: SEX_COLORS[d.sex] || COLORS.gray400,
    })),
    [data]
  )

  const total = chartData.reduce((sum, d) => sum + d.value, 0)

  return (
    <ChartCard
      title="Sex Distribution"
      subtitle="Male vs Female enrollment"
      empty={data.length === 0}
      emptyMessage="No sex distribution data available"
      height="h-72"
    >
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
              const pct = total > 0 ? ((d?.value as number) / total * 100).toFixed(1) : '0'
              return (
                <div style={RECHARTS_THEME.tooltip.contentStyle} className="px-3 py-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d?.payload?.fill }} />
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
            formatter={(value: string) => <span className="text-xs text-gray-600">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

// ──── Enrollment Matrix Table ────

function EnrollmentMatrixTable() {
  const { data, isLoading, isError } = useDashboardEnrollmentMatrix()

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
  // Compute grand totals from by_site if backend doesn't provide totals.grand
  const grand = (totals as Record<string, unknown>).grand as { count: number; target: number } | undefined
    ?? Object.values(totals.by_site ?? {}).reduce(
      (acc, s) => ({ count: acc.count + (s?.count ?? 0), target: acc.target + (s?.target ?? 0) }),
      { count: 0, target: 0 }
    )
  const grandPct = grand.target > 0 ? Math.min((grand.count / grand.target) * 100, 100) : 0

  return (
    <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-800">Enrollment Matrix</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          Count / target per site and participant group. Progress bars show completion rate.
        </p>
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
              {group_codes.map((gc) => (
                <th key={gc} className="px-3 py-2.5 text-center font-semibold text-gray-600 whitespace-nowrap">
                  {gc}
                </th>
              ))}
              <th className="px-4 py-2.5 text-right font-semibold text-gray-600 whitespace-nowrap">
                Site Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sites.map((site) => {
              const siteCode = typeof site === 'string' ? site : site.code
              const siteName = typeof site === 'string' ? site : (site.name || site.code)
              const siteTotal = totals.by_site[siteCode]
              const sitePct = siteTotal && siteTotal.target > 0
                ? Math.min((siteTotal.count / siteTotal.target) * 100, 100)
                : 0
              return (
                <tr key={siteCode} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2 font-semibold text-gray-800 whitespace-nowrap">
                    {siteName}
                  </td>
                  {group_codes.map((gc) => {
                    const cell = matrix[siteCode]?.[gc]
                    const count = cell?.count ?? 0
                    const target = cell?.target ?? 0
                    const pct = target > 0 ? Math.min((count / target) * 100, 100) : 0
                    const barColor = pct >= 100
                      ? COLORS.success
                      : pct >= 75
                        ? COLORS.primary
                        : pct >= 40
                          ? COLORS.teal
                          : COLORS.gray400
                    return (
                      <td key={gc} className="px-3 py-2 text-center">
                        <span className="tabular-nums text-gray-700">
                          {count > 0 ? count : (
                            <span className="text-gray-300">—</span>
                          )}
                          {target > 0 && (
                            <span className="text-gray-400">/{target}</span>
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
                        <span className="text-gray-400">/{siteTotal.target.toLocaleString()}</span>
                        <div className="mt-1 h-1 w-full rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700 ease-out"
                            style={{
                              width: `${sitePct}%`,
                              backgroundColor: sitePct >= 100 ? COLORS.success : COLORS.primary,
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
              {group_codes.map((gc) => {
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
                          backgroundColor: grandPct >= 100 ? COLORS.success : COLORS.primary,
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
        Group codes: first digit = age group (1=18-29, 2=30-44, 3=45-59, 4=60-74, 5=75+), letter = sex (A=male, B=female).
        Progress bar color: green = 100%, blue = 75%+, teal = 40%+, gray = &lt;40%.
      </p>
    </div>
  )
}

// ──── Main Page ────

export function EnrollmentDashboardPage() {
  const { data, isLoading, isError } = useDashboardEnrollment()

  // Derive stat card values
  const totalEnrolled = data?.total_participants ?? 0
  const activeSites = data?.by_site?.length ?? 0
  const demographics = data?.demographics

  const maleCount = demographics?.by_sex?.find(d => d.sex === 'M' || d.sex === 'A')?.count ?? 0
  const femaleCount = demographics?.by_sex?.find(d => d.sex === 'F' || d.sex === 'B')?.count ?? 0
  const ratioStr = femaleCount > 0
    ? `${(maleCount / femaleCount).toFixed(2)} : 1`
    : maleCount > 0 ? `${maleCount} : 0` : '--'

  const recent30d = data?.recent_30d ?? 0

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
          <p className="text-xs text-gray-400 mt-1">Enrollment data will appear here once participants are registered.</p>
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

      {/* Stat Cards */}
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
          title="M : F Ratio"
          value={ratioStr}
          subtitle={`${maleCount.toLocaleString()} male, ${femaleCount.toLocaleString()} female`}
          icon={<UserCheck className="h-5 w-5" />}
          accentColor="#8B5CF6"
        />
        <StatCard
          title="Recent (30d)"
          value={recent30d > 0 ? `+${recent30d.toLocaleString()}` : '0'}
          subtitle="Enrolled in last 30 days"
          icon={<CalendarPlus className="h-5 w-5" />}
          accentColor={COLORS.success}
        />
      </div>

      {/* Row 1: Trend + Pyramid */}
      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <EnrollmentTrendChart data={data?.enrollment_rate_30d ?? []} />
        {demographics ? (
          <DemographicsPyramid demographics={demographics} />
        ) : (
          <ChartCard
            title="Demographics Pyramid"
            subtitle="Age-sex distribution"
            empty
            emptyMessage="Demographic data not yet available from the API"
          >{null}</ChartCard>
        )}
      </div>

      {/* Row 2: Site Distribution + Age Donut + Gender Donut */}
      <div className="grid gap-4 lg:grid-cols-3 mb-6">
        <SiteDistributionChart data={data?.by_site ?? []} />
        {demographics ? (
          <AgeGroupDonut data={demographics.by_age_group} />
        ) : (
          <ChartCard title="Age Distribution" empty emptyMessage="No data" height="h-72">{null}</ChartCard>
        )}
        {demographics ? (
          <GenderDonut data={demographics.by_sex} />
        ) : (
          <ChartCard title="Sex Distribution" empty emptyMessage="No data" height="h-72">{null}</ChartCard>
        )}
      </div>

      {/* Row 3: Enrollment Matrix */}
      <EnrollmentMatrixTable />
    </div>
  )
}
