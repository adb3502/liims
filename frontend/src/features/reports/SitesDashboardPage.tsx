import { useNavigate } from 'react-router-dom'
import { useCollectionSites } from '@/api/participants'
import { useDashboardEnrollment } from '@/api/dashboard'
import { useSamples } from '@/api/samples'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { MapPin, Users, FlaskConical, TrendingUp, AlertCircle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

export function SitesDashboardPage() {
  const navigate = useNavigate()

  // Fetch collection sites
  const { data: sites, isLoading: sitesLoading } = useCollectionSites(true)

  // Fetch enrollment stats
  const { data: enrollmentStats, isLoading: enrollmentLoading } = useDashboardEnrollment()

  // Fetch samples for counting — use max allowed per_page
  const { data: samplesData, isLoading: samplesLoading } = useSamples({
    per_page: 100,
  })

  const isLoading = sitesLoading || enrollmentLoading || samplesLoading
  const isError = !sitesLoading && !enrollmentLoading && !samplesLoading &&
    (sites === undefined && enrollmentStats === undefined)

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sites Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Overview of enrollment and sample collection across collection sites
          </p>
        </div>
        {/* Skeleton cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <div className="h-5 w-40 skeleton rounded mb-1" />
                <div className="h-3.5 w-24 skeleton rounded" />
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="space-y-1">
                    <div className="h-3.5 w-20 skeleton rounded" />
                    <div className="h-7 w-12 skeleton rounded" />
                  </div>
                  <div className="space-y-1">
                    <div className="h-3.5 w-16 skeleton rounded" />
                    <div className="h-7 w-12 skeleton rounded" />
                  </div>
                </div>
                <div className="pt-4 border-t border-border">
                  <div className="h-2 w-full skeleton rounded-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sites Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Overview of enrollment and sample collection across collection sites
          </p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
          <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-3" />
          <p className="text-sm font-medium text-red-600 mb-1">Failed to load sites data</p>
          <p className="text-xs text-red-400 mb-4">
            There was a problem fetching collection site information. Please try again.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-100 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-200 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      </div>
    )
  }

  const collectionSites = sites ?? []
  const bySite = enrollmentStats?.by_site ?? []
  const samples = samplesData?.data ?? []

  // Build site stats map
  const siteStatsMap = new Map<string, {
    participantCount: number
    sampleCount: number
  }>()

  bySite.forEach(({ site_code, count }) => {
    siteStatsMap.set(site_code, {
      participantCount: count,
      sampleCount: 0,
    })
  })

  // Count samples per site
  samples.forEach((sample) => {
    const siteId = sample.collection_site_id
    if (siteId && siteStatsMap.has(siteId)) {
      const stats = siteStatsMap.get(siteId)!
      stats.sampleCount++
    }
  })

  // Calculate completion rate placeholder (would need events data from backend)
  const getSiteCompletionRate = (siteId: string): number => {
    const stats = siteStatsMap.get(siteId)
    if (!stats || stats.participantCount === 0) return 0
    // Rough estimate: assume 8 samples per participant for 100% completion
    const expectedSamples = stats.participantCount * 8
    return Math.min(100, Math.round((stats.sampleCount / expectedSamples) * 100))
  }

  const handleSiteClick = (siteId: string) => {
    navigate(`/participants?collection_site_id=${siteId}`)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Sites Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Overview of enrollment and sample collection across collection sites
        </p>
      </div>

      {/* Site cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {collectionSites.map((site) => {
          const stats = siteStatsMap.get(site.code) ?? { participantCount: 0, sampleCount: 0 }
          const completionRate = getSiteCompletionRate(site.code)

          return (
            <Card
              key={site.id}
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => handleSiteClick(site.id)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1">
                    <CardTitle className="text-lg">{site.name}</CardTitle>
                    <CardDescription className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" />
                      {site.city}
                    </CardDescription>
                  </div>
                  <Badge variant="secondary">{site.code}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" />
                      Participants
                    </div>
                    <p className="text-2xl font-bold">{stats.participantCount}</p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <FlaskConical className="h-4 w-4" />
                      Samples
                    </div>
                    <p className="text-2xl font-bold">{stats.sampleCount}</p>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground" title="Estimated: samples collected / (participants × 8 expected). Not a confirmed protocol metric.">
                      Completion*
                    </span>
                    <span className={cn(
                      'font-semibold',
                      completionRate >= 80 ? 'text-green-600' :
                      completionRate >= 50 ? 'text-amber-600' :
                      'text-red-600'
                    )}>
                      {completionRate}%
                    </span>
                  </div>
                  <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full transition-all',
                        completionRate >= 80 ? 'bg-green-600' :
                        completionRate >= 50 ? 'bg-amber-600' :
                        'bg-red-600'
                      )}
                      style={{ width: `${completionRate}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Enrollment chart summary */}
      {bySite.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Enrollment by Site</CardTitle>
            </div>
            <CardDescription>
              Total participants enrolled across all sites
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {bySite.map(({ site_code, site_name, count }) => {
                const totalEnrollment = bySite.reduce((sum, s) => sum + s.count, 0)
                const percentage = totalEnrollment > 0 ? Math.round((count / totalEnrollment) * 100) : 0

                return (
                  <div key={site_code} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{site_name}</span>
                      <span className="text-muted-foreground">
                        {count} ({percentage}%)
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Site comparison table */}
      <Card>
        <CardHeader>
          <CardTitle>Site Comparison</CardTitle>
          <CardDescription>
            Detailed breakdown of enrollment and collection metrics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site Name</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">Total Participants</TableHead>
                <TableHead className="text-right">Total Samples</TableHead>
                <TableHead className="text-right">Completion Rate*</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {collectionSites.map((site) => {
                const stats = siteStatsMap.get(site.code) ?? { participantCount: 0, sampleCount: 0 }
                const completionRate = getSiteCompletionRate(site.code)

                return (
                  <TableRow
                    key={site.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSiteClick(site.id)}
                  >
                    <TableCell className="font-medium">{site.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {site.city}
                    </TableCell>
                    <TableCell className="text-right">
                      {stats.participantCount}
                    </TableCell>
                    <TableCell className="text-right">
                      {stats.sampleCount}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant={
                          completionRate >= 80 ? 'success' :
                          completionRate >= 50 ? 'warning' :
                          'destructive'
                        }
                      >
                        {completionRate}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <p className="px-4 py-2 text-[11px] text-muted-foreground border-t">
            * Completion rate is an estimate based on samples collected vs. 8 expected per participant. This is not a confirmed protocol metric and will be replaced with event-based data when available.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
