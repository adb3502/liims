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
import { PageSpinner } from '@/components/ui/spinner'
import { MapPin, Users, FlaskConical, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'

export function SitesDashboardPage() {
  const navigate = useNavigate()

  // Fetch collection sites
  const { data: sites, isLoading: sitesLoading } = useCollectionSites(true)

  // Fetch enrollment stats
  const { data: enrollmentStats, isLoading: enrollmentLoading } = useDashboardEnrollment()

  // Fetch samples for counting
  const { data: samplesData, isLoading: samplesLoading } = useSamples({
    per_page: 1000,
  })

  const isLoading = sitesLoading || enrollmentLoading || samplesLoading

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <PageSpinner />
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
          const stats = siteStatsMap.get(site.id) ?? { participantCount: 0, sampleCount: 0 }
          const completionRate = getSiteCompletionRate(site.id)

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
                    <span className="text-muted-foreground">Completion</span>
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
                <TableHead className="text-right">Completion Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {collectionSites.map((site) => {
                const stats = siteStatsMap.get(site.id) ?? { participantCount: 0, sampleCount: 0 }
                const completionRate = getSiteCompletionRate(site.id)

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
        </CardContent>
      </Card>
    </div>
  )
}
