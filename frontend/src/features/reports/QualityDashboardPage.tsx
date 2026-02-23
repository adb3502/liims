import { useMemo } from 'react'
import { useDashboardQuality } from '@/api/dashboard'
import { StatCard, StatCardSkeleton } from '@/components/ui/stat-card'
import { ChartCard } from '@/components/ui/chart-card'
import { PageHeader } from '@/components/ui/page-header'
import {
  COLORS,
  RECHARTS_THEME,
  formatNumber,
} from '@/lib/chart-theme'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'
import { ShieldCheck, Microscope, Dna, CheckCircle2, XCircle, Clock } from 'lucide-react'

// ---- QC Donut ----

const QC_COLORS = {
  passed: COLORS.success,
  pending: COLORS.warning,
  failed: COLORS.danger,
}

function QCPassFailDonut({ data }: { data: { passed: number; failed: number; pending: number } }) {
  const total = data.passed + data.failed + data.pending
  const passRate = total > 0 ? (data.passed / total) * 100 : 0

  const chartData = [
    { name: 'Passed', value: data.passed, fill: QC_COLORS.passed },
    { name: 'Pending', value: data.pending, fill: QC_COLORS.pending },
    { name: 'Failed', value: data.failed, fill: QC_COLORS.failed },
  ].filter((d) => d.value > 0)

  return (
    <ChartCard
      title="QC Results"
      subtitle={`${passRate.toFixed(1)}% pass rate`}
      empty={total === 0}
      emptyMessage="No QC data available"
      height="h-72"
    >
      <div className="flex h-full gap-4 items-center">
        {/* Donut */}
        <div className="flex-1">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius="55%"
                outerRadius="78%"
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
        </div>

        {/* Count cards */}
        <div className="flex flex-col gap-2 flex-shrink-0">
          <div className="text-center px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-100">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto mb-1" />
            <div className="text-lg font-bold text-emerald-700 tabular-nums">{data.passed.toLocaleString()}</div>
            <div className="text-[10px] text-emerald-600 font-medium">Passed</div>
          </div>
          <div className="text-center px-4 py-3 rounded-lg bg-amber-50 border border-amber-100">
            <Clock className="h-4 w-4 text-amber-500 mx-auto mb-1" />
            <div className="text-lg font-bold text-amber-700 tabular-nums">{data.pending.toLocaleString()}</div>
            <div className="text-[10px] text-amber-600 font-medium">Pending</div>
          </div>
          <div className="text-center px-4 py-3 rounded-lg bg-red-50 border border-red-100">
            <XCircle className="h-4 w-4 text-red-500 mx-auto mb-1" />
            <div className="text-lg font-bold text-red-700 tabular-nums">{data.failed.toLocaleString()}</div>
            <div className="text-[10px] text-red-600 font-medium">Failed</div>
          </div>
        </div>
      </div>
    </ChartCard>
  )
}

// ---- ICC Completion Bar ----

const ICC_COLORS: Record<string, string> = {
  pending: COLORS.gray300,
  fixation: COLORS.primaryLight,
  staining: '#8B5CF6',
  imaging: COLORS.teal,
  analysis: COLORS.warning,
  completed: COLORS.success,
  failed: COLORS.danger,
}

function IccCompletionChart({ data }: { data: Array<{ status: string; count: number }> }) {
  const total = data.reduce((sum, d) => sum + d.count, 0)
  const completed = data.find((d) => d.status === 'completed')?.count ?? 0
  const completionRate = total > 0 ? (completed / total) * 100 : 0

  const chartData = useMemo(
    () =>
      [...data]
        .sort((a, b) => {
          const order = ['completed', 'analysis', 'imaging', 'staining', 'fixation', 'pending', 'failed']
          return order.indexOf(a.status) - order.indexOf(b.status)
        })
        .map((d) => ({
          ...d,
          label: d.status.charAt(0).toUpperCase() + d.status.slice(1),
          fill: ICC_COLORS[d.status] ?? COLORS.gray400,
          pct: total > 0 ? (d.count / total) * 100 : 0,
        })),
    [data, total],
  )

  return (
    <ChartCard
      title="ICC Workflow Completion"
      subtitle={`${completionRate.toFixed(0)}% complete — ${formatNumber(total)} total slides`}
      empty={total === 0}
      emptyMessage="No ICC data available"
      height="h-72"
    >
      <div className="flex h-full flex-col justify-between py-2">
        {/* SVG ring */}
        <div className="flex items-center gap-6">
          <div className="relative w-24 h-24 flex-shrink-0">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50" cy="50" r="42"
                fill="none" stroke="#F1F5F9" strokeWidth="8"
              />
              <circle
                cx="50" cy="50" r="42"
                fill="none"
                stroke={`url(#icc-ring-gradient)`}
                strokeWidth="8"
                strokeDasharray={`${completionRate * 2.64} ${264 - completionRate * 2.64}`}
                strokeLinecap="round"
                className="transition-all duration-1000 ease-out"
              />
              <defs>
                <linearGradient id="icc-ring-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor={COLORS.primary} />
                  <stop offset="100%" stopColor={COLORS.teal} />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-bold tabular-nums text-gray-900">
                {completionRate.toFixed(0)}%
              </span>
              <span className="text-[9px] text-gray-400">Done</span>
            </div>
          </div>

          {/* Status breakdown */}
          <div className="flex-1 space-y-2">
            {chartData.map((item) => (
              <div key={item.status} className="flex items-center gap-2 text-xs">
                <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.fill }} />
                <span className="flex-1 text-gray-600 capitalize">{item.label}</span>
                <span className="tabular-nums text-gray-500">{item.count.toLocaleString()}</span>
                <span className="tabular-nums text-gray-400 w-10 text-right">{item.pct.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Horizontal stacked bar */}
        {total > 0 && (
          <div className="h-3 rounded-full overflow-hidden flex mt-3">
            {chartData.filter((d) => d.count > 0).map((item) => (
              <div
                key={item.status}
                className="h-full transition-all duration-700"
                style={{ width: `${item.pct}%`, backgroundColor: item.fill }}
                title={`${item.label}: ${item.count}`}
              />
            ))}
          </div>
        )}
      </div>
    </ChartCard>
  )
}

// ---- Omics Coverage ----

function OmicsCoverageChart({
  data,
}: {
  data: { total_participants: number; proteomics_count: number; metabolomics_count: number }
}) {
  const chartData = [
    {
      name: 'Proteomics',
      count: data.proteomics_count,
      pct: data.total_participants > 0 ? (data.proteomics_count / data.total_participants) * 100 : 0,
      fill: '#8B5CF6',
    },
    {
      name: 'Metabolomics',
      count: data.metabolomics_count,
      pct: data.total_participants > 0 ? (data.metabolomics_count / data.total_participants) * 100 : 0,
      fill: COLORS.teal,
    },
  ]

  return (
    <ChartCard
      title="Omics Coverage"
      subtitle={`${data.total_participants.toLocaleString()} total participants`}
      empty={data.total_participants === 0}
      emptyMessage="No omics data available"
      height="h-72"
    >
      <div className="flex h-full flex-col justify-center gap-6 py-2">
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-900 tabular-nums">
            {formatNumber(data.total_participants)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">Total Participants</p>
        </div>

        <ResponsiveContainer width="100%" height={100}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 0, right: 60, left: 10, bottom: 0 }}
          >
            <CartesianGrid {...RECHARTS_THEME.grid} horizontal={false} />
            <XAxis
              type="number"
              domain={[0, 100]}
              tickFormatter={(v: number) => `${v}%`}
              {...RECHARTS_THEME.axis}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              {...RECHARTS_THEME.axis}
              tickLine={false}
              axisLine={false}
              width={80}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const d = payload[0]?.payload
                return (
                  <div style={RECHARTS_THEME.tooltip.contentStyle} className="px-3 py-2">
                    <p className="text-xs font-semibold text-gray-700">{d?.name}</p>
                    <p className="text-xs text-gray-500">
                      {d?.count?.toLocaleString()} participants ({d?.pct?.toFixed(1)}%)
                    </p>
                  </div>
                )
              }}
            />
            <Bar dataKey="pct" radius={[0, 4, 4, 0]} barSize={20}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}

// ---- Main Page ----

export function QualityDashboardPage() {
  const { data, isLoading, isError } = useDashboardQuality()

  const passRate = useMemo(() => {
    if (!data?.qc_pass_fail) return 0
    const t = data.qc_pass_fail.passed + data.qc_pass_fail.failed + data.qc_pass_fail.pending
    return t > 0 ? (data.qc_pass_fail.passed / t) * 100 : 0
  }, [data?.qc_pass_fail])

  const iccTotal = useMemo(
    () => (data?.icc_completion ?? []).reduce((s, d) => s + d.count, 0),
    [data?.icc_completion],
  )

  // ---- Loading ----
  if (isLoading) {
    return (
      <div>
        <PageHeader
          title="Quality Dashboard"
          subtitle="Quality control metrics, ICC completion, and omics data coverage"
          icon={<ShieldCheck className="h-5 w-5" />}
          gradient
        />
        <div className="grid gap-4 sm:grid-cols-3 mb-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="QC Results" loading>{null}</ChartCard>
          <ChartCard title="ICC Completion" loading>{null}</ChartCard>
        </div>
      </div>
    )
  }

  // ---- Error ----
  if (isError) {
    return (
      <div>
        <PageHeader
          title="Quality Dashboard"
          subtitle="Quality control metrics, ICC completion, and omics data coverage"
          icon={<ShieldCheck className="h-5 w-5" />}
          gradient
        />
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
          <p className="text-sm font-medium text-red-600">
            Failed to load quality data. Please try again later.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Quality Dashboard"
        subtitle="Quality control metrics, ICC completion, and omics data coverage"
        icon={<ShieldCheck className="h-5 w-5" />}
        gradient
      />

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <StatCard
          title="QC Pass Rate"
          value={`${passRate.toFixed(1)}%`}
          subtitle={`${data?.qc_pass_fail?.passed.toLocaleString() ?? 0} samples passed`}
          icon={<ShieldCheck className="h-5 w-5" />}
          accentColor={passRate >= 90 ? COLORS.success : passRate >= 75 ? COLORS.warning : COLORS.danger}
        />
        <StatCard
          title="ICC Slides"
          value={formatNumber(iccTotal)}
          subtitle="Total ICC workflow items"
          icon={<Microscope className="h-5 w-5" />}
          accentColor={COLORS.primary}
        />
        <StatCard
          title="Omics Participants"
          value={formatNumber(data?.omics_coverage?.total_participants ?? 0)}
          subtitle="With omics data"
          icon={<Dna className="h-5 w-5" />}
          accentColor={COLORS.teal}
        />
      </div>

      {/* QC + ICC row */}
      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <QCPassFailDonut
          data={data?.qc_pass_fail ?? { passed: 0, failed: 0, pending: 0 }}
        />
        <IccCompletionChart data={data?.icc_completion ?? []} />
      </div>

      {/* Omics coverage */}
      <OmicsCoverageChart
        data={data?.omics_coverage ?? { total_participants: 0, proteomics_count: 0, metabolomics_count: 0 }}
      />
    </div>
  )
}
