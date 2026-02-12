import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSamples } from '@/api/samples'
import { useRuns, usePlates } from '@/api/instruments'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { PageSpinner } from '@/components/ui/spinner'
import { FlaskConical, Calendar, Grid3x3, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import type { SampleType } from '@/types'

const SAMPLE_TYPE_LABELS: Record<SampleType, string> = {
  plasma: 'Plasma',
  epigenetics: 'Epigenetics',
  extra_blood: 'Extra Blood',
  rbc_smear: 'RBC Smear',
  cheek_swab: 'Cheek Swab',
  hair: 'Hair',
  urine: 'Urine',
  stool_kit: 'Stool Kit',
}

const ALL_SAMPLE_TYPES: SampleType[] = [
  'plasma', 'epigenetics', 'extra_blood', 'rbc_smear',
  'cheek_swab', 'hair', 'urine', 'stool_kit',
]

const PER_PAGE = 25

export function SampleQueuePage() {
  const navigate = useNavigate()
  const [selectedType, setSelectedType] = useState<SampleType | ''>('')
  const [page, setPage] = useState(1)

  // Fetch stored samples not yet assigned to runs/plates
  const { data: samplesData, isLoading: samplesLoading } = useSamples({
    sample_status: 'stored',
    sample_type: selectedType || undefined,
    page,
    per_page: PER_PAGE,
  })

  // Fetch planned runs
  const { data: runsData, isLoading: runsLoading } = useRuns({
    status: 'planned',
    per_page: 100,
  })

  // Fetch all plates
  const { data: platesData, isLoading: platesLoading } = usePlates({
    per_page: 100,
  })

  const samples = samplesData?.data ?? []
  const totalSamples = samplesData?.meta.total ?? 0
  const plannedRuns = runsData?.data ?? []
  const plates = platesData?.data ?? []

  // Calculate available wells across all plates
  const totalPlates = plates.length

  const isLoading = samplesLoading || runsLoading || platesLoading

  const totalPages = Math.ceil(totalSamples / PER_PAGE)

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <PageSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sample Queue</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Samples ready for instrument analysis
          </p>
        </div>
        <Button onClick={() => navigate('/instruments/plates')}>
          <Grid3x3 className="mr-2 h-4 w-4" />
          Plate Designer
        </Button>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription>Samples Awaiting Analysis</CardDescription>
              <FlaskConical className="h-5 w-5 text-muted-foreground" />
            </div>
            <CardTitle className="text-3xl">{totalSamples}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription>Planned Runs</CardDescription>
              <Calendar className="h-5 w-5 text-muted-foreground" />
            </div>
            <CardTitle className="text-3xl">{plannedRuns.length}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription>Available Plates</CardDescription>
              <Grid3x3 className="h-5 w-5 text-muted-foreground" />
            </div>
            <CardTitle className="text-3xl">{totalPlates}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Filter by sample type */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={selectedType === '' ? 'default' : 'outline'}
          onClick={() => {
            setSelectedType('')
            setPage(1)
          }}
        >
          All Types
        </Button>
        {ALL_SAMPLE_TYPES.map((type) => (
          <Button
            key={type}
            size="sm"
            variant={selectedType === type ? 'default' : 'outline'}
            onClick={() => {
              setSelectedType(type)
              setPage(1)
            }}
          >
            {SAMPLE_TYPE_LABELS[type]}
          </Button>
        ))}
      </div>

      {/* Samples table */}
      <Card>
        <CardHeader>
          <CardTitle>Stored Samples</CardTitle>
          <CardDescription>
            Samples ready to be assigned to plates for analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          {samples.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground">
                No samples awaiting analysis
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sample Code</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Participant</TableHead>
                    <TableHead>Stored Date</TableHead>
                    <TableHead>Storage Location</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {samples.map((sample) => (
                    <TableRow key={sample.id}>
                      <TableCell>
                        <code className="text-sm font-mono font-semibold">
                          {sample.sample_code}
                        </code>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {SAMPLE_TYPE_LABELS[sample.sample_type]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {sample.participant?.participant_code ?? 'N/A'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {sample.storage_datetime
                          ? new Date(sample.storage_datetime).toLocaleDateString()
                          : 'N/A'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {sample.storage_location_id ? (
                          <span className="flex items-center gap-1">
                            Storage
                            <ExternalLink className="h-3 w-3" />
                          </span>
                        ) : (
                          'Not assigned'
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate('/instruments/plates')}
                        >
                          Assign to Plate
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                  <p className="text-sm text-muted-foreground">
                    Page {page} of {totalPages} ({totalSamples} total samples)
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
