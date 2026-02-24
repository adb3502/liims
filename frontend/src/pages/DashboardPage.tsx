import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth'
import api from '@/lib/api'
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
// jitteredCoord removed — now using pin code geocoding from backend API

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

  return (
    <MapContainer
      center={[13.1, 77.6]}
      zoom={8}
      className="h-full w-full rounded-lg z-0"
      scrollWheelZoom={false}
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
      />

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

                {/* Enrollment progress bar — per-site targets from study design */}
                {(() => {
                  const SITE_TARGETS: Record<string, number> = { BBH: 2000, RMH: 1000, SSSSMH: 1000, CHAF: 1000, BMC: 0, JSS: 0 }
                  const target = SITE_TARGETS[site.code] ?? 1000
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
  )
}

// ──── Map Tabs: Sites (Karnataka) | Participants (India) ────

function MapTabs({ siteMarkers, enrollmentLoading }: {
  siteMarkers: SiteMarker[]
  enrollmentLoading: boolean
}) {
  const [tab, setTab] = useState<'sites' | 'participants'>('sites')

  const { data: locationData, isLoading: locLoading } = useQuery({
    queryKey: ['participant-locations'],
    queryFn: async () => {
      const res = await api.get<{ success: true; data: { locations: Array<{ lat: number; lng: number; pin_code: string | null; site_code: string; source: string }>; summary: { total: number; pin_code_matched: number; site_fallback: number } } }>('/participant-locations/')
      return res.data.data
    },
    enabled: tab === 'participants',
    staleTime: 5 * 60_000,
  })

  // Group participants by pin code + site → bubble plot (bigger = more participants)
  const pinCodeBubbles = useMemo(() => {
    if (!locationData?.locations) return []
    const groups = new Map<string, { lat: number; lng: number; count: number; pinCode: string; siteCode: string; source: string }>()
    for (const loc of locationData.locations) {
      // Group by pin+site so same PIN from different sites = separate bubbles
      const key = loc.pin_code ? `${loc.pin_code}-${loc.site_code}` : `site-${loc.site_code}`
      const existing = groups.get(key)
      if (existing) {
        existing.count++
      } else {
        groups.set(key, {
          lat: loc.lat,
          lng: loc.lng,
          count: 1,
          pinCode: loc.pin_code || loc.site_code,
          siteCode: loc.site_code,
          source: loc.source,
        })
      }
    }
    // Offset bubbles that share the same coordinates so they don't stack
    const coordCounts = new Map<string, number>()
    const result = Array.from(groups.values())
    for (const b of result) {
      const coordKey = `${b.lat},${b.lng}`
      const idx = coordCounts.get(coordKey) || 0
      if (idx > 0) {
        // Spread in a small circle (~0.01° ≈ 1km offset)
        const angle = (idx * 2 * Math.PI) / 6
        b.lat += Math.cos(angle) * 0.015
        b.lng += Math.sin(angle) * 0.015
      }
      coordCounts.set(coordKey, idx + 1)
    }
    return result
  }, [locationData])

  return (
    <div className="rounded-xl bg-white border border-gray-100 overflow-hidden">
      {/* Tab header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">
            {tab === 'sites' ? 'Collection Sites' : 'Participant Locations'}
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {tab === 'sites'
              ? 'Bubble size = participant count. Click site for details.'
              : locationData
                ? `${locationData.summary.pin_code_matched} geocoded from pin code, ${locationData.summary.site_fallback} from site`
                : 'Loading participant locations...'}
          </p>
        </div>
        <div className="flex gap-0.5 rounded-lg border border-gray-200 bg-gray-50 p-0.5">
          <button
            onClick={() => setTab('sites')}
            className={cn(
              'rounded-md px-3 py-1 text-[11px] font-medium transition-all',
              tab === 'sites'
                ? 'bg-white text-primary shadow-sm border border-gray-200'
                : 'text-gray-500 hover:text-gray-700',
            )}
          >
            Sites
          </button>
          <button
            onClick={() => setTab('participants')}
            className={cn(
              'rounded-md px-3 py-1 text-[11px] font-medium transition-all',
              tab === 'participants'
                ? 'bg-white text-primary shadow-sm border border-gray-200'
                : 'text-gray-500 hover:text-gray-700',
            )}
          >
            Participants
          </button>
        </div>
      </div>

      {/* Map content */}
      <div className="h-[400px] px-5 pb-5">
        {tab === 'sites' ? (
          enrollmentLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-8 w-8 rounded-full border-2 border-gray-200 border-t-primary animate-spin" />
            </div>
          ) : (
            <SiteMap markers={siteMarkers} />
          )
        ) : locLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <div className="h-8 w-8 rounded-full border-2 border-gray-200 border-t-primary animate-spin" />
              <span className="text-xs text-gray-400">Loading {siteMarkers.reduce((s, m) => s + m.count, 0)} participant locations...</span>
            </div>
          </div>
        ) : (
          <MapContainer
            center={[22.5, 78.9]}
            zoom={5}
            className="h-full w-full rounded-lg z-0"
            scrollWheelZoom={false}
            attributionControl={false}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            />
            {/* Pin code bubble plot — size = participant count */}
            {pinCodeBubbles.map((bubble, i) => {
              const siteIdx = Object.keys(SITE_COORDINATES).indexOf(bubble.siteCode)
              const color = SITE_COLORS[siteIdx >= 0 ? siteIdx % SITE_COLORS.length : 0]
              const radius = Math.min(25, Math.max(4, Math.log2(bubble.count + 1) * 3))
              return (
                <CircleMarker
                  key={`pin-${i}`}
                  center={[bubble.lat, bubble.lng]}
                  radius={radius}
                  pathOptions={{
                    fillColor: color,
                    fillOpacity: 0.65,
                    color: color,
                    weight: 1.5,
                    opacity: 0.8,
                  }}
                >
                  <Popup>
                    <div className="text-xs space-y-1">
                      <p className="font-semibold text-gray-900">
                        {bubble.source === 'pin_code' ? `PIN ${bubble.pinCode}` : `${SITE_COORDINATES[bubble.siteCode]?.name || bubble.siteCode} area`}
                      </p>
                      <p className="text-gray-600">
                        <span className="font-bold tabular-nums">{bubble.count}</span> participant{bubble.count !== 1 ? 's' : ''}
                      </p>
                      <p className="text-gray-400 text-[10px]">
                        Site: {SITE_COORDINATES[bubble.siteCode]?.name || bubble.siteCode}
                      </p>
                    </div>
                  </Popup>
                </CircleMarker>
              )
            })}
          </MapContainer>
        )}
      </div>
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
    const timeData = enrollment?.enrollment_over_time ?? enrollment?.enrollment_rate_30d
    if (!timeData) return []
    let cumulative = 0
    return timeData.map((d) => {
      cumulative += d.count
      return {
        ...d,
        cumulative,
        dateLabel: formatDate(d.date),
      }
    })
  }, [enrollment?.enrollment_over_time, enrollment?.enrollment_rate_30d])

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
          height="h-[420px]"
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
                tick={{ fontSize: 11, fill: '#000000', fontFamily: '"Red Hat Display", sans-serif' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#000000', fontFamily: '"Red Hat Display", sans-serif' }}
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

        {/* Map with tabs: Sites (Karnataka) | Participants (India) */}
        <MapTabs siteMarkers={siteMarkers} enrollmentLoading={enrollmentLoading} />
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
              tick={{ fontSize: 11, fill: '#000000', fontFamily: '"Red Hat Display", sans-serif' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => formatNumber(v)}
            />
            <YAxis
              type="category"
              dataKey="site_name"
              tick={{ fontSize: 11, fill: '#000000', fontFamily: '"Red Hat Display", sans-serif' }}
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
