import { useMemo, useState } from 'react'
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
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import {
  Users,
  FlaskConical,
  Snowflake,
  ShieldCheck,
  BarChart3,
  Calendar,
  ArrowRight,
  MapPin,
} from 'lucide-react'

// ── Site bubble radius: perceptually accurate (area ∝ count) ──
// Minimum 8px so zero-enrollment sites are still visible.
function bubbleRadius(count: number): number {
  return Math.max(8, Math.sqrt(count) * 2.5)
}

// ── Deterministic jitter: seeded from participant index + axis ──
// ODK clinical_data JSONB contains demographics.residential_area (urban/rural) but
// NO lat/lng coordinates. Dots are always site-approximate — never implying real location.
// Spread of 0.005° ≈ 550m, appropriate for a collection site catchment area.
function jitteredCoord(
  base: number,
  index: number,
  spread: number,
  axis: number,
): number {
  // Deterministic pseudo-random using sin — stable across re-renders
  const h = Math.sin(index * 127.1 + axis * 311.7) * 43758.5453
  return base + (h - Math.floor(h) - 0.5) * spread
}

interface SiteMarker {
  code: string
  lat: number
  lng: number
  name: string
  city: string
  count: number
  color: string
}

interface SiteMapProps {
  markers: SiteMarker[]
}

function SiteMap({ markers }: SiteMapProps) {
  const [showParticipants, setShowParticipants] = useState(false)

  // Generate one dot per participant jittered within ~0.005° (~550m) of site center.
  // urban flag from SITE_COORDINATES is used as a site-level proxy for residential_area
  // (participant.clinical_data.demographics.residential_area is per-participant but not
  // available at this layer without a dedicated API endpoint).
  const participantDots = useMemo(() => {
    if (!showParticipants) return []
    const dots: Array<{ lat: number; lng: number; color: string; urban: boolean }> = []
    for (const marker of markers) {
      const coord = SITE_COORDINATES[marker.code]
      if (!coord) continue
      // 0.005° ≈ 550m — reflects realistic scatter without implying GPS precision
      const spread = 0.005
      for (let i = 0; i < marker.count; i++) {
        dots.push({
          lat: jitteredCoord(marker.lat, i, spread, 0),
          lng: jitteredCoord(marker.lng, i, spread, 1),
          color: marker.color,
          urban: coord.urban,
        })
      }
    }
    return dots
  }, [showParticipants, markers])

  return (
    <div className="relative h-full w-full">
      {/* Toggle control */}
      <div className="absolute top-2 right-2 z-[500] flex items-center gap-1.5 rounded-lg bg-white/90 backdrop-blur-sm border border-gray-200 px-2.5 py-1.5 shadow-sm">
        <label className="flex items-center gap-1.5 cursor-pointer select-none text-[11px] text-gray-600">
          <input
            type="checkbox"
            checked={showParticipants}
            onChange={(e) => setShowParticipants(e.target.checked)}
            className="h-3 w-3 rounded border-gray-300 accent-primary"
            aria-label="Show individual participant locations"
          />
          <MapPin className="h-3 w-3 text-gray-400" />
          Participants
        </label>
      </div>

      {showParticipants && (
        <div className="absolute bottom-2 left-2 z-[500] rounded-lg bg-amber-50/90 backdrop-blur-sm border border-amber-200 px-2.5 py-1.5 text-[10px] text-amber-700 max-w-[220px] space-y-0.5">
          <p className="font-medium">Individual locations approximated from collection site</p>
          <p className="text-amber-600">Filled = urban site &nbsp;&bull;&nbsp; Hollow = rural site</p>
        </div>
      )}

      <MapContainer
        center={[13.1, 77.6]}
        zoom={8}
        className="h-full w-full rounded-lg z-0"
        scrollWheelZoom={false}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        />

        {/* Individual participant dots (jittered around site center) */}
        {showParticipants && participantDots.map((dot, i) => (
          <CircleMarker
            key={`pt-${i}`}
            center={[dot.lat, dot.lng]}
            radius={3}
            pathOptions={{
              fillColor: dot.color,
              fillOpacity: 0.5,
              stroke: false,
            }}
          />
        ))}

        {/* Site bubble markers */}
        {markers.map((site) => (
          <CircleMarker
            key={site.code}
            center={[site.lat, site.lng]}
            radius={bubbleRadius(site.count)}
            pathOptions={{
              fillColor: site.color,
              fillOpacity: 0.75,
              color: site.color,
              weight: 2,
            }}
          >
            <Popup minWidth={200}>
              <div className="text-xs space-y-2 py-0.5">
                {/* Header */}
                <div>
                  <p className="font-semibold text-gray-900 leading-tight">{site.name}</p>
                  <p className="text-gray-500 text-[11px]">{SITE_COORDINATES[site.code]?.city}</p>
                </div>

                {/* Count */}
                <div className="flex items-center justify-between border-t border-gray-100 pt-1.5">
                  <span className="text-gray-500">Enrolled</span>
                  <span className="font-bold text-gray-900 tabular-nums">
                    {site.count.toLocaleString()}
                  </span>
                </div>

                {/* Enrollment progress bar (target: 200 per site as study default) */}
                {(() => {
                  const target = 200
                  const pct = Math.min(100, Math.round((site.count / target) * 100))
                  return (
                    <div>
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="text-gray-400">Progress to target ({target})</span>
                        <span className="font-medium" style={{ color: site.color }}>{pct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: site.color }}
                        />
                      </div>
                    </div>
                  )
                })()}

                {/* Site metadata */}
                <div className="border-t border-gray-100 pt-1.5 space-y-0.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-gray-400">Code</span>
                    <span className="font-mono font-medium text-gray-700">{site.code}</span>
                  </div>
                  {SITE_COORDINATES[site.code]?.address && (
                    <p className="text-[10px] text-gray-400 leading-tight mt-1">
                      {SITE_COORDINATES[site.code].address}
                    </p>
                  )}
                </div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  )
}

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

  // Build map markers from enrollment data — include color per site, keyed to stable order
  const siteMarkers = useMemo((): SiteMarker[] => {
    if (!enrollment?.by_site) return []
    const siteCountMap = new Map(enrollment.by_site.map((s) => [s.site_code, s.count]))
    const codes = Object.keys(SITE_COORDINATES)
    return codes.map((code, i) => {
      const coord = SITE_COORDINATES[code]
      return {
        code,
        lat: coord.lat,
        lng: coord.lng,
        name: coord.name,
        city: coord.city,
        count: siteCountMap.get(code) ?? 0,
        color: SITE_COLORS[i % SITE_COLORS.length],
      }
    })
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
          subtitle="Bubble size = participant count. Click a site for details."
          loading={enrollmentLoading}
          error={enrollmentError ? 'Failed to load site data' : undefined}
          empty={!enrollmentLoading && !enrollmentError && siteMarkers.length === 0}
          emptyMessage="No site data available"
          height="h-72"
        >
          <SiteMap markers={siteMarkers} />
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
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any) => [Number(value).toLocaleString(), 'Participants'] as any}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={28}>
              {siteData.map((entry) => (
                <Cell key={entry.site_name} fill={entry.color} />
              ))}
              <LabelList
                dataKey="count"
                position="right"
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(v: any) => Number(v).toLocaleString() as any}
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
            { label: 'Field Operations', to: '/field-ops/events', icon: Calendar, color: COLORS.warning, desc: 'Upcoming events and check-ins' },
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
