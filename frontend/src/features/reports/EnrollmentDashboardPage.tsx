import { useDashboardEnrollment } from '@/api/dashboard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { PageSpinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { Users, TrendingUp, Layers, MapPin } from 'lucide-react'

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  accent,
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: typeof Users
  accent: string
}) {
  return (
    <Card className="relative overflow-hidden">
      <div className={cn('absolute top-0 left-0 w-1 h-full', accent)} />
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className={cn('rounded-lg p-2', accent.replace('bg-', 'bg-').replace('-500', '-50'))}>
          <Icon className={cn('h-4 w-4', accent.replace('bg-', 'text-'))} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold tracking-tight">{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  )
}

function EnrollmentChart({ data }: { data: Array<{ date: string; count: number; cumulative: number }> }) {
  if (!data.length) return null

  const maxCount = Math.max(...data.map((d) => d.count), 1)
  // Show last 12 periods
  const displayData = data.slice(-12)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Enrollment Over Time</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-1.5 h-48">
          {displayData.map((item, i) => {
            const heightPct = (item.count / maxCount) * 100
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
                  {item.count}
                </span>
                <div className="w-full relative flex-1 flex items-end">
                  <div
                    className="w-full rounded-t-sm bg-[#3674F6] transition-all duration-500 ease-out"
                    style={{
                      height: `${Math.max(heightPct, 2)}%`,
                      animationDelay: `${i * 50}ms`,
                    }}
                  />
                </div>
                <span className="text-[9px] text-muted-foreground truncate w-full text-center">
                  {formatDateLabel(item.date)}
                </span>
              </div>
            )
          })}
        </div>
        {displayData.length > 0 && (
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground border-t pt-3">
            <span>Cumulative total: <span className="font-semibold text-foreground">{displayData[displayData.length - 1].cumulative.toLocaleString()}</span></span>
            <span>{displayData.length} periods shown</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function formatDateLabel(date: string): string {
  try {
    const d = new Date(date)
    return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  } catch {
    return date
  }
}

function WaveBreakdown({ data }: { data: Array<{ wave: number; count: number }> }) {
  const total = data.reduce((sum, d) => sum + d.count, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Enrollment by Wave</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {data.map((wave) => {
            const pct = total > 0 ? (wave.count / total) * 100 : 0
            return (
              <div key={wave.wave} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Wave {wave.wave}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {wave.count.toLocaleString()} <span className="text-xs">({pct.toFixed(1)}%)</span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#3674F6] to-[#03B6D3] transition-all duration-700 ease-out"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function SiteTable({ data }: { data: Array<{ site_id: string; site_name: string; count: number }> }) {
  const total = data.reduce((sum, d) => sum + d.count, 0)
  const sorted = [...data].sort((a, b) => b.count - a.count)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">By Collection Site</CardTitle>
          <Badge variant="secondary" className="tabular-nums">
            {data.length} site{data.length !== 1 ? 's' : ''}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Site</TableHead>
              <TableHead className="text-right w-24">Enrolled</TableHead>
              <TableHead className="text-right w-20">%</TableHead>
              <TableHead className="w-32">Distribution</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((site) => {
              const pct = total > 0 ? (site.count / total) * 100 : 0
              return (
                <TableRow key={site.site_id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="font-medium">{site.site_name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {site.count.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {pct.toFixed(1)}%
                  </TableCell>
                  <TableCell>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#3674F6]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

export function EnrollmentDashboardPage() {
  const { data, isLoading, isError } = useDashboardEnrollment()

  if (isLoading) return <PageSpinner />

  if (isError) {
    return (
      <div className="rounded-lg border border-danger/20 bg-danger/5 p-8 text-center">
        <p className="text-sm text-danger">Failed to load enrollment data. Please try again.</p>
      </div>
    )
  }

  const totalEnrolled = data?.total ?? 0
  const totalWaves = data?.by_wave?.length ?? 0
  const totalSites = data?.by_site?.length ?? 0

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Enrollment Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Participant enrollment statistics across collection sites and waves.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard
          title="Total Enrolled"
          value={totalEnrolled.toLocaleString()}
          subtitle="All-time participants"
          icon={Users}
          accent="bg-[#3674F6]"
        />
        <StatCard
          title="Active Waves"
          value={totalWaves}
          subtitle="Collection waves"
          icon={Layers}
          accent="bg-[#03B6D3]"
        />
        <StatCard
          title="Collection Sites"
          value={totalSites}
          subtitle="Registered sites"
          icon={MapPin}
          accent="bg-emerald-500"
        />
        <StatCard
          title="Recent Trend"
          value={data?.enrollment_over_time?.length
            ? `+${data.enrollment_over_time[data.enrollment_over_time.length - 1]?.count ?? 0}`
            : '--'}
          subtitle="Latest period"
          icon={TrendingUp}
          accent="bg-amber-500"
        />
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-3 mb-6">
        <div className="lg:col-span-2">
          <EnrollmentChart data={data?.enrollment_over_time ?? []} />
        </div>
        <WaveBreakdown data={data?.by_wave ?? []} />
      </div>

      {/* Site Table */}
      <SiteTable data={data?.by_site ?? []} />
    </div>
  )
}
