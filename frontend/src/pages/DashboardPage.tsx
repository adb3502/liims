import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { useDashboardOverview, useDashboardEnrollment } from '@/api/dashboard'
import { StatCard, StatCardSkeleton } from '@/components/ui/stat-card'
import { ChartCard } from '@/components/ui/chart-card'
import {
  COLORS,
  SITE_COORDINATES,
  SITE_COLORS,
  RECHARTS_THEME,
  formatNumber,
} from '@/lib/chart-theme'
import { cn } from '@/lib/utils'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  LabelList,
} from 'recharts'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  Users,
  FlaskConical,
  Snowflake,
  ShieldCheck,
  BarChart3,
  Calendar,
  ArrowRight,
} from 'lucide-react'

// Fix default marker icon (leaflet's default icon paths break in bundlers)
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})
L.Marker.prototype.options.icon = defaultIcon

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  lab_manager: 'Lab Manager',
  lab_technician: 'Lab Technician',
  field_coordinator: 'Field Coordinator',
  data_entry: 'Data Entry',
  collaborator: 'Collaborator',
  pi_researcher: 'PI / Researcher',
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={RECHARTS_THEME.tooltip.contentStyle} className="px-3 py-2">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-sm font-semibold text-gray-900">
        {payload[0].value.toLocaleString()} participants
      </p>
    </div>
  )
}

export function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const { data: overview, isLoading: overviewLoading, error: overviewError } = useDashboardOverview()
  const { data: enrollment, isLoading: enrollmentLoading, error: enrollmentError } = useDashboardEnrollment()

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  // Build site distribution data sorted by count descending
  const siteData = useMemo(() => {
    if (!enrollment?.by_site) return []
    return [...enrollment.by_site]
      .sort((a, b) => b.count - a.count)
      .map((s, i) => ({
        ...s,
        short_name: s.site_code || s.site_name,
        color: SITE_COLORS[i % SITE_COLORS.length],
      }))
  }, [enrollment?.by_site])

  // Build map markers from enrollment data
  const siteMarkers = useMemo(() => {
    if (!enrollment?.by_site) return []
    const siteCountMap = new Map(enrollment.by_site.map((s) => [s.site_code, s.count]))
    return Object.entries(SITE_COORDINATES).map(([code, coord]) => ({
      code,
      ...coord,
      count: siteCountMap.get(code) ?? 0,
    }))
  }, [enrollment?.by_site])

  // Enrollment time series
  const enrollmentTimeSeries = useMemo(() => {
    if (!enrollment?.enrollment_rate_30d) return []
    let cumulative = 0
    return enrollment.enrollment_rate_30d.map((d) => {
      cumulative += d.count
      return {
        ...d,
        cumulative,
        dateLabel: formatDate(d.date),
      }
    })
  }, [enrollment?.enrollment_rate_30d])

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div className="relative overflow-hidden rounded-xl bg-white border border-gray-100 px-6 py-5">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-primary" />
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-gradient-primary opacity-[0.03] -translate-y-32 translate-x-16" />
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Welcome back, {user?.full_name?.split(' ')[0] ?? 'Researcher'}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {today}
              {user?.role && (
                <span className="ml-2 inline-flex items-center rounded-full bg-primary/8 px-2.5 py-0.5 text-xs font-medium text-primary">
                  {ROLE_LABELS[user.role] ?? user.role}
                </span>
              )}
            </p>
          </div>
          <p className="text-xs text-gray-400 max-w-xs text-right hidden sm:block">
            Longevity India (BHARAT) Study<br />
            Biomarker Health Assessment for Research on Aging Trajectories
          </p>
        </div>
      </div>

      {/* KPI Stat Cards */}
      {overviewLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      ) : overviewError ? (
        <div className="rounded-xl bg-red-50 border border-red-100 p-4 text-sm text-red-600">
          Failed to load dashboard overview. Please try refreshing.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Participants"
            value={overview ? formatNumber(overview.enrollment.total) : '--'}
            subtitle={overview ? `+${overview.enrollment.recent_30d} in last 30 days` : undefined}
            icon={<Users className="h-5 w-5" />}
            accentColor={COLORS.primary}
            trend={overview?.enrollment.recent_30d ? {
              value: overview.enrollment.recent_30d,
              label: `new in last 30 days`,
            } : undefined}
          />
          <StatCard
            title="Total Samples"
            value={overview ? formatNumber(overview.samples.total) : '--'}
            subtitle={overview ? `${overview.samples.in_storage.toLocaleString()} in storage` : undefined}
            icon={<FlaskConical className="h-5 w-5" />}
            accentColor={COLORS.teal}
          />
          <StatCard
            title="Storage Utilization"
            value={overview ? `${overview.storage.utilization_pct.toFixed(1)}%` : '--'}
            subtitle="Across all freezers"
            icon={<Snowflake className="h-5 w-5" />}
            accentColor={COLORS.success}
          />
          <StatCard
            title="QC Pass Rate"
            value={overview ? `${overview.quality.qc_pass_rate.toFixed(1)}%` : '--'}
            subtitle="Quality control"
            icon={<ShieldCheck className="h-5 w-5" />}
            accentColor={COLORS.warning}
          />
        </div>
      )}

      {/* Charts row: Enrollment trend + Site map */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Enrollment Trend */}
        <ChartCard
          title="Enrollment Trend"
          subtitle="Cumulative participant enrollment over time"
          loading={enrollmentLoading}
          error={enrollmentError ? 'Failed to load enrollment data' : undefined}
          empty={!enrollmentLoading && !enrollmentError && enrollmentTimeSeries.length === 0}
          emptyMessage="No enrollment data yet"
          height="h-72"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={enrollmentTimeSeries} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="enrollGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.primary} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={COLORS.teal} stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid {...RECHARTS_THEME.grid} />
              <XAxis
                dataKey="dateLabel"
                {...RECHARTS_THEME.axis}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                {...RECHARTS_THEME.axis}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => formatNumber(v)}
              />
              <RechartsTooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="cumulative"
                stroke={COLORS.primary}
                strokeWidth={2}
                fill="url(#enrollGradient)"
                dot={false}
                activeDot={{ r: 4, fill: COLORS.primary, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Site Map */}
        <ChartCard
          title="Collection Sites"
          subtitle="Karnataka study sites"
          loading={enrollmentLoading}
          error={enrollmentError ? 'Failed to load site data' : undefined}
          empty={!enrollmentLoading && !enrollmentError && siteMarkers.length === 0}
          emptyMessage="No site data available"
          height="h-72"
        >
          <MapContainer
            center={[12.97, 77.59]}
            zoom={9}
            className="h-full w-full rounded-lg z-0"
            scrollWheelZoom={false}
            attributionControl={false}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            />
            {siteMarkers.map((site) => (
              <Marker key={site.code} position={[site.lat, site.lng]}>
                <Popup>
                  <div className="text-xs">
                    <p className="font-semibold text-gray-900">{site.name}</p>
                    <p className="text-gray-500">{site.city}</p>
                    <p className="mt-1 font-medium text-primary">{site.count.toLocaleString()} participants</p>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </ChartCard>
      </div>

      {/* Site Distribution bar chart */}
      <ChartCard
        title="Enrollment by Site"
        subtitle="Participant distribution across collection sites"
        loading={enrollmentLoading}
        error={enrollmentError ? 'Failed to load site data' : undefined}
        empty={!enrollmentLoading && !enrollmentError && siteData.length === 0}
        emptyMessage="No enrollment data by site"
        height="h-64"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={siteData}
            layout="vertical"
            margin={{ top: 4, right: 40, left: 8, bottom: 4 }}
          >
            <CartesianGrid {...RECHARTS_THEME.grid} horizontal={false} />
            <XAxis
              type="number"
              {...RECHARTS_THEME.axis}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => formatNumber(v)}
            />
            <YAxis
              type="category"
              dataKey="site_name"
              {...RECHARTS_THEME.axis}
              tickLine={false}
              axisLine={false}
              width={160}
            />
            <RechartsTooltip
              contentStyle={RECHARTS_THEME.tooltip.contentStyle}
              formatter={(value: number | string) => [Number(value).toLocaleString(), 'Participants']}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={28}>
              {siteData.map((entry) => (
                <Cell key={entry.site_name} fill={entry.color} />
              ))}
              <LabelList
                dataKey="count"
                position="right"
                formatter={(v: number | string) => Number(v).toLocaleString()}
                style={{ fontSize: 11, fill: COLORS.gray600, fontWeight: 500 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-semibold text-gray-800 mb-3">Quick Actions</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Enrollment Analytics', to: '/reports/enrollment', icon: Users, color: COLORS.primary, desc: 'Enrollment trends and demographics' },
            { label: 'Inventory Overview', to: '/reports/inventory', icon: FlaskConical, color: COLORS.teal, desc: 'Sample counts and storage' },
            { label: 'Quality Dashboard', to: '/reports/quality', icon: BarChart3, color: COLORS.success, desc: 'QC metrics and ICC results' },
            { label: 'Field Operations', to: '/reports/field-ops', icon: Calendar, color: COLORS.warning, desc: 'Upcoming events and check-ins' },
          ].map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={cn(
                'group flex items-start gap-3 rounded-xl bg-white border border-gray-100 p-4',
                'hover:shadow-[0_4px_12px_-2px_rgba(0,0,0,0.06)] hover:border-gray-200 transition-all duration-200'
              )}
            >
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${link.color}12`, color: link.color }}
              >
                <link.icon className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-800 group-hover:text-primary transition-colors">
                    {link.label}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{link.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
