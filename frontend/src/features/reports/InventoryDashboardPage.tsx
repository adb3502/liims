import { useMemo } from 'react'
import { useDashboardInventory } from '@/api/dashboard'
import { StatCard, StatCardSkeleton } from '@/components/ui/stat-card'
import { ChartCard } from '@/components/ui/chart-card'
import { PageHeader } from '@/components/ui/page-header'
import {
  COLORS,
  RECHARTS_THEME,
  SAMPLE_TYPE_COLORS,
  STATUS_COLORS,
  formatNumber,
} from '@/lib/chart-theme'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadialBarChart,
  RadialBar,
} from 'recharts'
import { FlaskConical, Snowflake, Archive, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

// ---- Freezer Utilization Gauges ----

function FreezerGauges({
  data,
}: {
  data: Array<{
    freezer_id: string
    freezer_name: string
    used: number
    capacity: number
    utilization_pct: number
  }>
}) {
  const sorted = useMemo(
    () => [...data].sort((a, b) => b.utilization_pct - a.utilization_pct),
    [data],
  )

  return (
    <ChartCard
      title="Freezer Utilization"
      subtitle={`${data.length} freezer${data.length !== 1 ? 's' : ''} registered`}
      empty={data.length === 0}
      emptyMessage="No freezers registered"
      height="h-auto"
    >
      <div className="space-y-4 py-2">
        {sorted.map((freezer) => {
          const pct = freezer.utilization_pct
          const isHigh = pct >= 90
          const isMed = pct >= 75 && pct < 90
          const barColor = isHigh ? COLORS.danger : isMed ? COLORS.warning : COLORS.primary
          const gaugeData = [{ name: freezer.freezer_name, value: pct, fill: barColor }]

          return (
            <div key={freezer.freezer_id} className="flex items-center gap-4">
              {/* Mini radial gauge */}
              <div className="w-14 h-14 flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart
                    cx="50%"
                    cy="50%"
                    innerRadius="60%"
                    outerRadius="100%"
                    startAngle={90}
                    endAngle={-270}
                    data={gaugeData}
                    barSize={6}
                  >
                    <RadialBar
                      background={{ fill: '#F1F5F9' }}
                      dataKey="value"
                      cornerRadius={3}
                    />
                  </RadialBarChart>
                </ResponsiveContainer>
              </div>

              {/* Label + bar */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Snowflake
                      className={cn('h-3 w-3 flex-shrink-0', isHigh ? 'text-red-500' : 'text-gray-400')}
                    />
                    <span className="text-xs font-medium text-gray-700 truncate">
                      {freezer.freezer_name}
                    </span>
                    {isHigh && <AlertTriangle className="h-3 w-3 text-red-500 flex-shrink-0" />}
                  </div>
                  <span
                    className={cn(
                      'text-xs font-semibold tabular-nums flex-shrink-0 ml-2',
                      isHigh ? 'text-red-500' : isMed ? 'text-amber-500' : 'text-gray-700',
                    )}
                  >
                    {pct.toFixed(1)}%
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${pct}%`, backgroundColor: barColor }}
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5 tabular-nums">
                  {freezer.used.toLocaleString()} / {freezer.capacity.toLocaleString()} slots
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </ChartCard>
  )
}

// ---- Sample Type Donut ----

function SampleTypeDonut({
  data,
}: {
  data: Array<{ sample_type: string; count: number }>
}) {
  const chartData = useMemo(
    () =>
      [...data]
        .sort((a, b) => b.count - a.count)
        .map((d) => ({
          name: d.sample_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          value: d.count,
          fill: SAMPLE_TYPE_COLORS[d.sample_type] ?? COLORS.gray400,
        })),
    [data],
  )

  const total = chartData.reduce((sum, d) => sum + d.value, 0)

  return (
    <ChartCard
      title="Samples by Type"
      subtitle={`${total.toLocaleString()} total samples`}
      empty={data.length === 0}
      emptyMessage="No sample type data"
      height="h-80"
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="45%"
            innerRadius="50%"
            outerRadius="72%"
            paddingAngle={2}
            dataKey="value"
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
              const pct = total > 0 ? (((d.value as number) / total) * 100).toFixed(1) : '0'
              return (
                <div style={RECHARTS_THEME.tooltip.contentStyle} className="px-3 py-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.payload?.fill }} />
                    <span className="font-semibold text-gray-700">{d.name}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {(d.value as number).toLocaleString()} ({pct}%)
                  </p>
                </div>
              )
            }}
          />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            iconSize={7}
            formatter={(value: string) => (
              <span className="text-[11px] text-gray-600">{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

// ---- Sample Status Donut ----

function SampleStatusDonut({
  data,
}: {
  data: Array<{ status: string; count: number }>
}) {
  const chartData = useMemo(
    () =>
      [...data]
        .sort((a, b) => b.count - a.count)
        .map((d) => ({
          name: d.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          value: d.count,
          fill: STATUS_COLORS[d.status] ?? COLORS.gray400,
        })),
    [data],
  )

  const total = chartData.reduce((sum, d) => sum + d.value, 0)

  return (
    <ChartCard
      title="Samples by Status"
      subtitle={`${total.toLocaleString()} total samples`}
      empty={data.length === 0}
      emptyMessage="No sample status data"
      height="h-80"
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="45%"
            innerRadius="50%"
            outerRadius="72%"
            paddingAngle={2}
            dataKey="value"
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
              const pct = total > 0 ? (((d.value as number) / total) * 100).toFixed(1) : '0'
              return (
                <div style={RECHARTS_THEME.tooltip.contentStyle} className="px-3 py-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.payload?.fill }} />
                    <span className="font-semibold text-gray-700">{d.name}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {(d.value as number).toLocaleString()} ({pct}%)
                  </p>
                </div>
              )
            }}
          />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            iconSize={7}
            formatter={(value: string) => (
              <span className="text-[11px] text-gray-600">{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

// ---- Main Page ----

export function InventoryDashboardPage() {
  const { data, isLoading, isError } = useDashboardInventory()

  const totalSamples = data?.total_samples ?? 0
  const inStorage = data?.by_status?.find((s) => s.status === 'in_storage')?.count ?? 0
  const avgUtilization = data?.freezer_utilization?.length
    ? data.freezer_utilization.reduce((sum, f) => sum + f.utilization_pct, 0) /
      data.freezer_utilization.length
    : 0
  const highUtilization = data?.freezer_utilization?.filter((f) => f.utilization_pct >= 90).length ?? 0

  // ---- Loading ----
  if (isLoading) {
    return (
      <div>
        <PageHeader
          title="Inventory Dashboard"
          subtitle="Sample inventory and storage capacity across all freezers"
          icon={<FlaskConical className="h-5 w-5" />}
          gradient
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Freezer Utilization" loading>{null}</ChartCard>
          <ChartCard title="Samples by Type" loading>{null}</ChartCard>
        </div>
      </div>
    )
  }

  // ---- Error ----
  if (isError) {
    return (
      <div>
        <PageHeader
          title="Inventory Dashboard"
          subtitle="Sample inventory and storage capacity across all freezers"
          icon={<FlaskConical className="h-5 w-5" />}
          gradient
        />
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
          <p className="text-sm font-medium text-red-600">
            Failed to load inventory data. Please try again later.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Inventory Dashboard"
        subtitle="Sample inventory and storage capacity across all freezers"
        icon={<FlaskConical className="h-5 w-5" />}
        gradient
      />

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard
          title="Total Samples"
          value={formatNumber(totalSamples)}
          subtitle="Across all sample types"
          icon={<FlaskConical className="h-5 w-5" />}
          accentColor={COLORS.primary}
        />
        <StatCard
          title="In Storage"
          value={formatNumber(inStorage)}
          subtitle="Currently stored"
          icon={<Archive className="h-5 w-5" />}
          accentColor={COLORS.success}
        />
        <StatCard
          title="Avg Utilization"
          value={`${avgUtilization.toFixed(1)}%`}
          subtitle="Mean freezer usage"
          icon={<Snowflake className="h-5 w-5" />}
          accentColor={COLORS.teal}
        />
        <StatCard
          title="Near Capacity"
          value={highUtilization}
          subtitle="Freezers at 90%+"
          icon={<AlertTriangle className="h-5 w-5" />}
          accentColor={highUtilization > 0 ? COLORS.danger : COLORS.success}
        />
      </div>

      {/* Freezer utilization */}
      <div className="mb-6">
        <FreezerGauges data={data?.freezer_utilization ?? []} />
      </div>

      {/* Sample breakdown donuts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SampleTypeDonut data={data?.by_type ?? []} />
        <SampleStatusDonut data={data?.by_status ?? []} />
      </div>
    </div>
  )
}
