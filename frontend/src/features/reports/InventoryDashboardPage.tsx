import { useDashboardInventory } from '@/api/dashboard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageSpinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { FlaskConical, Snowflake, Archive, AlertTriangle } from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  in_storage: 'bg-emerald-500',
  in_transit: 'bg-amber-500',
  processing: 'bg-[#3674F6]',
  exhausted: 'bg-slate-400',
  discarded: 'bg-red-400',
  quarantined: 'bg-orange-500',
}

const TYPE_COLORS: Record<string, string> = {
  blood: 'bg-red-500',
  serum: 'bg-amber-500',
  plasma: 'bg-orange-400',
  stool: 'bg-yellow-600',
  urine: 'bg-yellow-400',
  saliva: 'bg-cyan-400',
  tissue: 'bg-pink-500',
  dna: 'bg-violet-500',
  rna: 'bg-purple-500',
}

function FreezerUtilizationCard({
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
  const sorted = [...data].sort((a, b) => b.utilization_pct - a.utilization_pct)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">Freezer Utilization</CardTitle>
          <Badge variant="secondary" className="tabular-nums">
            {data.length} freezer{data.length !== 1 ? 's' : ''}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {sorted.map((freezer) => {
            const isHigh = freezer.utilization_pct >= 90
            const isMedium = freezer.utilization_pct >= 75 && freezer.utilization_pct < 90
            return (
              <div key={freezer.freezer_id} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Snowflake className={cn('h-3.5 w-3.5', isHigh ? 'text-red-500' : 'text-muted-foreground')} />
                    <span className="font-medium">{freezer.freezer_name}</span>
                    {isHigh && (
                      <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                    )}
                  </div>
                  <span className="tabular-nums text-muted-foreground">
                    {freezer.used.toLocaleString()} / {freezer.capacity.toLocaleString()}
                    <span className={cn(
                      'ml-2 font-semibold',
                      isHigh ? 'text-red-500' : isMedium ? 'text-amber-500' : 'text-foreground',
                    )}>
                      {freezer.utilization_pct.toFixed(1)}%
                    </span>
                  </span>
                </div>
                <div className="h-3 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-700 ease-out',
                      isHigh
                        ? 'bg-gradient-to-r from-red-400 to-red-500'
                        : isMedium
                          ? 'bg-gradient-to-r from-amber-400 to-amber-500'
                          : 'bg-gradient-to-r from-[#03B6D3] to-[#3674F6]',
                    )}
                    style={{ width: `${freezer.utilization_pct}%` }}
                  />
                </div>
              </div>
            )
          })}
          {data.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No freezers registered.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function BreakdownDonut({
  title,
  data,
  colorMap,
}: {
  title: string
  data: Array<{ label: string; count: number }>
  colorMap: Record<string, string>
}) {
  const total = data.reduce((sum, d) => sum + d.count, 0)
  const sorted = [...data].sort((a, b) => b.count - a.count)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Stacked horizontal bar */}
        {total > 0 && (
          <div className="h-4 rounded-full overflow-hidden flex mb-4">
            {sorted.map((item, i) => (
              <div
                key={i}
                className={cn('h-full transition-all duration-500', colorMap[item.label] ?? 'bg-slate-300')}
                style={{ width: `${(item.count / total) * 100}%` }}
              />
            ))}
          </div>
        )}
        <div className="space-y-2">
          {sorted.map((item, i) => {
            const pct = total > 0 ? (item.count / total) * 100 : 0
            return (
              <div key={i} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className={cn('h-2.5 w-2.5 rounded-full', colorMap[item.label] ?? 'bg-slate-300')} />
                  <span className="capitalize">{item.label.replace(/_/g, ' ')}</span>
                </div>
                <span className="tabular-nums text-muted-foreground">
                  {item.count.toLocaleString()}
                  <span className="text-xs ml-1">({pct.toFixed(1)}%)</span>
                </span>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

export function InventoryDashboardPage() {
  const { data, isLoading, isError } = useDashboardInventory()

  if (isLoading) return <PageSpinner />

  if (isError) {
    return (
      <div className="rounded-lg border border-danger/20 bg-danger/5 p-8 text-center">
        <p className="text-sm text-danger">Failed to load inventory data. Please try again.</p>
      </div>
    )
  }

  const totalSamples = data?.total_samples ?? 0
  const inStorage = data?.by_status?.find((s) => s.status === 'in_storage')?.count ?? 0
  const avgUtilization =
    data?.freezer_utilization?.length
      ? data.freezer_utilization.reduce((sum, f) => sum + f.utilization_pct, 0) / data.freezer_utilization.length
      : 0
  const highUtilization = data?.freezer_utilization?.filter((f) => f.utilization_pct >= 90).length ?? 0

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Inventory Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sample inventory and storage capacity across all freezers.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-[#3674F6]" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Samples</CardTitle>
            <FlaskConical className="h-4 w-4 text-[#3674F6]" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight">{totalSamples.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Across all types</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">In Storage</CardTitle>
            <Archive className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight">{inStorage.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Currently stored</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-[#03B6D3]" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Utilization</CardTitle>
            <Snowflake className="h-4 w-4 text-[#03B6D3]" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight">{avgUtilization.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-1">Mean freezer usage</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className={cn('absolute top-0 left-0 w-1 h-full', highUtilization > 0 ? 'bg-red-500' : 'bg-emerald-500')} />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Near Capacity</CardTitle>
            <AlertTriangle className={cn('h-4 w-4', highUtilization > 0 ? 'text-red-500' : 'text-emerald-500')} />
          </CardHeader>
          <CardContent>
            <div className={cn('text-3xl font-bold tracking-tight', highUtilization > 0 && 'text-red-500')}>
              {highUtilization}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Freezers at 90%+</p>
          </CardContent>
        </Card>
      </div>

      {/* Freezer Utilization */}
      <div className="mb-6">
        <FreezerUtilizationCard data={data?.freezer_utilization ?? []} />
      </div>

      {/* Sample Breakdowns */}
      <div className="grid gap-4 lg:grid-cols-2">
        <BreakdownDonut
          title="Samples by Type"
          data={(data?.by_type ?? []).map((d) => ({ label: d.sample_type, count: d.count }))}
          colorMap={TYPE_COLORS}
        />
        <BreakdownDonut
          title="Samples by Status"
          data={(data?.by_status ?? []).map((d) => ({ label: d.status, count: d.count }))}
          colorMap={STATUS_COLORS}
        />
      </div>
    </div>
  )
}
