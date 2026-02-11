import { useDashboardQuality } from '@/api/dashboard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageSpinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { ShieldCheck, Microscope, Dna, CheckCircle2, XCircle, Clock } from 'lucide-react'

function QCPassFailCard({ data }: { data: { passed: number; failed: number; pending: number } }) {
  const total = data.passed + data.failed + data.pending
  const passRate = total > 0 ? (data.passed / total) * 100 : 0

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">QC Pass / Fail</CardTitle>
          <Badge
            variant={passRate >= 90 ? 'success' : passRate >= 75 ? 'warning' : 'destructive'}
            className="tabular-nums"
          >
            {passRate.toFixed(1)}% pass rate
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* Stacked bar */}
        {total > 0 && (
          <div className="h-5 rounded-full overflow-hidden flex mb-5">
            {data.passed > 0 && (
              <div
                className="h-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${(data.passed / total) * 100}%` }}
              />
            )}
            {data.pending > 0 && (
              <div
                className="h-full bg-amber-400 transition-all duration-500"
                style={{ width: `${(data.pending / total) * 100}%` }}
              />
            )}
            {data.failed > 0 && (
              <div
                className="h-full bg-red-500 transition-all duration-500"
                style={{ width: `${(data.failed / total) * 100}%` }}
              />
            )}
          </div>
        )}

        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 rounded-lg bg-emerald-50 border border-emerald-100">
            <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto mb-1" />
            <div className="text-xl font-bold text-emerald-700 tabular-nums">{data.passed.toLocaleString()}</div>
            <div className="text-xs text-emerald-600">Passed</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-amber-50 border border-amber-100">
            <Clock className="h-5 w-5 text-amber-500 mx-auto mb-1" />
            <div className="text-xl font-bold text-amber-700 tabular-nums">{data.pending.toLocaleString()}</div>
            <div className="text-xs text-amber-600">Pending</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-red-50 border border-red-100">
            <XCircle className="h-5 w-5 text-red-500 mx-auto mb-1" />
            <div className="text-xl font-bold text-red-700 tabular-nums">{data.failed.toLocaleString()}</div>
            <div className="text-xs text-red-600">Failed</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

const ICC_STATUS_COLORS: Record<string, { bg: string; bar: string; text: string }> = {
  pending: { bg: 'bg-slate-50', bar: 'bg-slate-400', text: 'text-slate-600' },
  fixation: { bg: 'bg-blue-50', bar: 'bg-blue-500', text: 'text-blue-600' },
  staining: { bg: 'bg-violet-50', bar: 'bg-violet-500', text: 'text-violet-600' },
  imaging: { bg: 'bg-cyan-50', bar: 'bg-cyan-500', text: 'text-cyan-600' },
  analysis: { bg: 'bg-amber-50', bar: 'bg-amber-500', text: 'text-amber-600' },
  completed: { bg: 'bg-emerald-50', bar: 'bg-emerald-500', text: 'text-emerald-600' },
  failed: { bg: 'bg-red-50', bar: 'bg-red-500', text: 'text-red-600' },
}

function IccCompletionCard({ data }: { data: Array<{ status: string; count: number }> }) {
  const total = data.reduce((sum, d) => sum + d.count, 0)
  const completed = data.find((d) => d.status === 'completed')?.count ?? 0
  const completionRate = total > 0 ? (completed / total) * 100 : 0

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">ICC Completion</CardTitle>
          <Badge variant="secondary" className="tabular-nums">
            {total.toLocaleString()} total
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* Completion ring indicator */}
        <div className="flex items-center justify-center mb-5">
          <div className="relative w-28 h-28">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/30" />
              <circle
                cx="50" cy="50" r="42" fill="none" stroke="url(#icc-gradient)" strokeWidth="8"
                strokeDasharray={`${completionRate * 2.64} ${264 - completionRate * 2.64}`}
                strokeLinecap="round"
                className="transition-all duration-1000 ease-out"
              />
              <defs>
                <linearGradient id="icc-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#3674F6" />
                  <stop offset="100%" stopColor="#03B6D3" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold tabular-nums">{completionRate.toFixed(0)}%</span>
              <span className="text-[10px] text-muted-foreground">Complete</span>
            </div>
          </div>
        </div>

        {/* Status breakdown */}
        <div className="space-y-2.5">
          {data.map((item) => {
            const pct = total > 0 ? (item.count / total) * 100 : 0
            const colors = ICC_STATUS_COLORS[item.status] ?? ICC_STATUS_COLORS.pending
            return (
              <div key={item.status} className="flex items-center gap-3 text-sm">
                <div className={cn('h-2 w-2 rounded-full flex-shrink-0', colors.bar)} />
                <span className="capitalize flex-1">{item.status.replace(/_/g, ' ')}</span>
                <span className="tabular-nums text-muted-foreground">{item.count}</span>
                <span className="tabular-nums text-xs text-muted-foreground w-12 text-right">
                  {pct.toFixed(1)}%
                </span>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function OmicsCoverageCard({
  data,
}: {
  data: { total_participants: number; proteomics_count: number; metabolomics_count: number }
}) {
  const protPct = data.total_participants > 0 ? (data.proteomics_count / data.total_participants) * 100 : 0
  const metPct = data.total_participants > 0 ? (data.metabolomics_count / data.total_participants) * 100 : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Omics Coverage</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-center mb-5">
          <div className="text-3xl font-bold tabular-nums">{data.total_participants.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Total Participants</div>
        </div>

        <div className="space-y-5">
          {/* Proteomics */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div className="rounded-md p-1.5 bg-violet-50">
                  <Dna className="h-4 w-4 text-violet-500" />
                </div>
                <span className="font-medium">Proteomics</span>
              </div>
              <span className="tabular-nums">
                <span className="font-semibold">{data.proteomics_count.toLocaleString()}</span>
                <span className="text-muted-foreground ml-1 text-xs">({protPct.toFixed(1)}%)</span>
              </span>
            </div>
            <div className="h-3 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-400 to-violet-600 transition-all duration-700"
                style={{ width: `${protPct}%` }}
              />
            </div>
          </div>

          {/* Metabolomics */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div className="rounded-md p-1.5 bg-teal-50">
                  <Microscope className="h-4 w-4 text-teal-500" />
                </div>
                <span className="font-medium">Metabolomics</span>
              </div>
              <span className="tabular-nums">
                <span className="font-semibold">{data.metabolomics_count.toLocaleString()}</span>
                <span className="text-muted-foreground ml-1 text-xs">({metPct.toFixed(1)}%)</span>
              </span>
            </div>
            <div className="h-3 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-teal-400 to-teal-600 transition-all duration-700"
                style={{ width: `${metPct}%` }}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function QualityDashboardPage() {
  const { data, isLoading, isError } = useDashboardQuality()

  if (isLoading) return <PageSpinner />

  if (isError) {
    return (
      <div className="rounded-lg border border-danger/20 bg-danger/5 p-8 text-center">
        <p className="text-sm text-danger">Failed to load quality data. Please try again.</p>
      </div>
    )
  }

  const passRate =
    data?.qc_pass_fail
      ? (() => {
          const t = data.qc_pass_fail.passed + data.qc_pass_fail.failed + data.qc_pass_fail.pending
          return t > 0 ? (data.qc_pass_fail.passed / t) * 100 : 0
        })()
      : 0

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Quality Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Quality control metrics, ICC completion, and omics data coverage.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <Card className="relative overflow-hidden">
          <div className={cn('absolute top-0 left-0 w-1 h-full', passRate >= 90 ? 'bg-emerald-500' : passRate >= 75 ? 'bg-amber-500' : 'bg-red-500')} />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">QC Pass Rate</CardTitle>
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight">{passRate.toFixed(1)}%</div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-[#3674F6]" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">ICC Slides</CardTitle>
            <Microscope className="h-4 w-4 text-[#3674F6]" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight">
              {(data?.icc_completion ?? []).reduce((s, d) => s + d.count, 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-[#03B6D3]" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Omics Participants</CardTitle>
            <Dna className="h-4 w-4 text-[#03B6D3]" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight">
              {data?.omics_coverage?.total_participants?.toLocaleString() ?? '--'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* QC Pass/Fail */}
      <div className="mb-6">
        <QCPassFailCard
          data={data?.qc_pass_fail ?? { passed: 0, failed: 0, pending: 0 }}
        />
      </div>

      {/* ICC + Omics */}
      <div className="grid gap-4 lg:grid-cols-2">
        <IccCompletionCard data={data?.icc_completion ?? []} />
        <OmicsCoverageCard
          data={data?.omics_coverage ?? { total_participants: 0, proteomics_count: 0, metabolomics_count: 0 }}
        />
      </div>
    </div>
  )
}
