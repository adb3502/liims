import { useAuthStore } from '@/stores/auth'
import { useDashboardOverview } from '@/api/dashboard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  Users,
  FlaskConical,
  Snowflake,
  BarChart3,
  MapPin,
  Activity,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react'

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  lab_manager: 'Lab Manager',
  lab_technician: 'Lab Technician',
  field_coordinator: 'Field Coordinator',
  data_entry: 'Data Entry',
  collaborator: 'Collaborator',
  pi_researcher: 'PI / Researcher',
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  accent,
  loading,
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: typeof Users
  accent: string
  loading?: boolean
}) {
  return (
    <Card className="relative overflow-hidden">
      <div className={cn('absolute top-0 left-0 w-1 h-full', accent)} />
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={cn('h-4 w-4', accent.replace('bg-', 'text-'))} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{loading ? '--' : value}</div>
        <p className="text-xs text-muted-foreground">{loading ? 'Loading...' : subtitle}</p>
      </CardContent>
    </Card>
  )
}

export function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const { data, isLoading } = useDashboardOverview()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Welcome back, {user?.full_name}.{' '}
          {user?.role && (
            <span className="text-foreground font-medium">
              {ROLE_LABELS[user.role] ?? user.role}
            </span>
          )}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Participants"
          value={data?.enrollment?.total?.toLocaleString() ?? '--'}
          subtitle={data ? `+${data.enrollment.recent_30d} in last 30 days` : undefined}
          icon={Users}
          accent="bg-[#3674F6]"
          loading={isLoading}
        />
        <StatCard
          title="Total Samples"
          value={data?.samples?.total?.toLocaleString() ?? '--'}
          subtitle={data ? `${data.samples.in_storage.toLocaleString()} in storage` : undefined}
          icon={FlaskConical}
          accent="bg-[#03B6D3]"
          loading={isLoading}
        />
        <StatCard
          title="Storage Utilization"
          value={data ? `${data.storage.utilization_pct.toFixed(1)}%` : '--'}
          subtitle="Across all freezers"
          icon={Snowflake}
          accent="bg-emerald-500"
          loading={isLoading}
        />
        <StatCard
          title="QC Pass Rate"
          value={data ? `${data.quality.qc_pass_rate.toFixed(1)}%` : '--'}
          subtitle="Quality control"
          icon={ShieldCheck}
          accent="bg-amber-500"
          loading={isLoading}
        />
      </div>

      {/* Second row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Upcoming Field Events</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? '--' : data?.field_ops?.upcoming_count ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {isLoading
                ? 'Loading...'
                : data
                  ? `${(data.field_ops.completion_rate * 100).toFixed(1)}% completion rate`
                  : ''}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Instrument Runs</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? '--' : data?.instruments?.active_runs ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {isLoading ? 'Loading...' : 'Currently running'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Recent Enrollment</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? '--' : `+${data?.enrollment?.recent_30d ?? 0}`}
            </div>
            <p className="text-xs text-muted-foreground">
              {isLoading ? 'Loading...' : 'Last 30 days'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick links */}
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Enrollment', href: '/reports/enrollment', icon: Users, color: 'text-[#3674F6]' },
          { label: 'Inventory', href: '/reports/inventory', icon: FlaskConical, color: 'text-[#03B6D3]' },
          { label: 'Quality', href: '/reports/quality', icon: BarChart3, color: 'text-emerald-500' },
          { label: 'Query Builder', href: '/reports/query-builder', icon: Activity, color: 'text-amber-500' },
        ].map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="flex items-center gap-3 rounded-lg border border-border p-4 hover:bg-muted/50 hover:border-primary/30 transition-all group"
          >
            <link.icon className={cn('h-5 w-5', link.color)} />
            <div>
              <div className="text-sm font-medium group-hover:text-primary transition-colors">{link.label} Dashboard</div>
              <div className="text-xs text-muted-foreground">View details</div>
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
