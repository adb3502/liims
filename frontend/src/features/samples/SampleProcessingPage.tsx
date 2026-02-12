import { useState, useEffect } from 'react'
import { useSamples } from '@/api/samples'
import { useQueryClient } from '@tanstack/react-query'
import { sampleKeys } from '@/api/samples'
import api from '@/lib/api'
import { toast } from '@/components/ui/toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageSpinner } from '@/components/ui/spinner'
import { Clock, ArrowRight, Package } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Sample, SampleType } from '@/types'

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

function formatElapsedTime(seconds: number): { text: string; color: string } {
  const hours = seconds / 3600
  const days = hours / 24

  if (days > 7) {
    return { text: `${Math.floor(days)}d ${Math.floor(hours % 24)}h`, color: 'text-red-600' }
  } else if (hours >= 4) {
    return { text: `${Math.floor(hours)}h ${Math.floor((seconds % 3600) / 60)}m`, color: 'text-amber-600' }
  } else {
    return { text: `${Math.floor(hours)}h ${Math.floor((seconds % 3600) / 60)}m`, color: 'text-green-600' }
  }
}

interface SampleCardProps {
  sample: Sample
  onStartProcessing?: (id: string) => void
  onComplete?: (id: string) => void
  processingElapsed?: number
}

function SampleCard({ sample, onStartProcessing, onComplete, processingElapsed }: SampleCardProps) {
  const elapsed = processingElapsed ? formatElapsedTime(processingElapsed) : null

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="space-y-2">
        <div className="flex items-start justify-between">
          <code className="text-sm font-mono font-semibold text-foreground">
            {sample.sample_code}
          </code>
          <Badge variant="secondary" className="text-xs">
            {SAMPLE_TYPE_LABELS[sample.sample_type]}
          </Badge>
        </div>

        <div className="text-sm text-muted-foreground">
          Participant: <span className="font-medium text-foreground">{sample.participant?.participant_code ?? 'N/A'}</span>
        </div>

        {elapsed && (
          <div className="flex items-center gap-1.5 text-sm">
            <Clock className="h-4 w-4" />
            <span className={cn('font-medium', elapsed.color)}>{elapsed.text}</span>
          </div>
        )}

        {onStartProcessing && (
          <Button
            size="sm"
            className="w-full mt-3"
            onClick={() => onStartProcessing(sample.id)}
          >
            Start Processing
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        )}

        {onComplete && (
          <Button
            size="sm"
            variant="outline"
            className="w-full mt-3"
            onClick={() => onComplete(sample.id)}
          >
            Complete
            <Package className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}

export function SampleProcessingPage() {
  const [selectedType, setSelectedType] = useState<SampleType | ''>('')
  const [currentTime, setCurrentTime] = useState(Date.now())
  const queryClient = useQueryClient()

  // Fetch samples by status
  const { data: receivedData, isLoading: receivedLoading, refetch: refetchReceived } = useSamples({
    sample_status: 'received',
    sample_type: selectedType || undefined,
    per_page: 100,
  })

  const { data: processingData, isLoading: processingLoading, refetch: refetchProcessing } = useSamples({
    sample_status: 'processing',
    sample_type: selectedType || undefined,
    per_page: 100,
  })

  const { data: storedData, isLoading: storedLoading, refetch: refetchStored } = useSamples({
    sample_status: 'stored',
    sample_type: selectedType || undefined,
    per_page: 100,
  })

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refetchReceived()
      refetchProcessing()
      refetchStored()
      setCurrentTime(Date.now())
    }, 30000)

    return () => clearInterval(interval)
  }, [refetchReceived, refetchProcessing, refetchStored])

  const handleStartProcessing = async (sampleId: string) => {
    try {
      await api.post(`/samples/${sampleId}/status`, { status: 'processing' })
      queryClient.invalidateQueries({ queryKey: sampleKeys.lists() })
      toast({ description: 'Sample status updated to processing.', variant: 'success' })
      refetchReceived()
      refetchProcessing()
    } catch (error) {
      toast({ description: 'Failed to update sample status.', variant: 'destructive' })
    }
  }

  const handleComplete = async (sampleId: string) => {
    try {
      await api.post(`/samples/${sampleId}/status`, { status: 'stored' })
      queryClient.invalidateQueries({ queryKey: sampleKeys.lists() })
      toast({ description: 'Sample status updated to stored.', variant: 'success' })
      refetchProcessing()
      refetchStored()
    } catch (error) {
      toast({ description: 'Failed to update sample status.', variant: 'destructive' })
    }
  }

  const receivedSamples = receivedData?.data ?? []
  const processingSamples = processingData?.data ?? []
  const storedSamples = storedData?.data ?? []

  const isLoading = receivedLoading || processingLoading || storedLoading

  // Calculate elapsed time for processing samples
  const getProcessingElapsed = (sample: Sample): number | undefined => {
    if (!sample.processing_started_at) return undefined
    const startedAt = new Date(sample.processing_started_at).getTime()
    return Math.floor((currentTime - startedAt) / 1000)
  }

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
          <h1 className="text-2xl font-bold text-foreground">Sample Processing</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track samples through the processing pipeline
          </p>
        </div>
      </div>

      {/* Filter by sample type */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={selectedType === '' ? 'default' : 'outline'}
          onClick={() => setSelectedType('')}
        >
          All Types
        </Button>
        {ALL_SAMPLE_TYPES.map((type) => (
          <Button
            key={type}
            size="sm"
            variant={selectedType === type ? 'default' : 'outline'}
            onClick={() => setSelectedType(type)}
          >
            {SAMPLE_TYPE_LABELS[type]}
          </Button>
        ))}
      </div>

      {/* Kanban columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Received Column */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Received</CardTitle>
                <Badge variant="secondary">{receivedSamples.length}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {receivedSamples.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No samples in this stage
                </p>
              ) : (
                receivedSamples.map((sample) => (
                  <SampleCard
                    key={sample.id}
                    sample={sample}
                    onStartProcessing={handleStartProcessing}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Processing Column */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Processing</CardTitle>
                <Badge variant="warning">{processingSamples.length}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {processingSamples.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No samples in this stage
                </p>
              ) : (
                processingSamples.map((sample) => (
                  <SampleCard
                    key={sample.id}
                    sample={sample}
                    onComplete={handleComplete}
                    processingElapsed={getProcessingElapsed(sample)}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Stored Column */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Stored</CardTitle>
                <Badge variant="success">{storedSamples.length}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {storedSamples.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No samples in this stage
                </p>
              ) : (
                storedSamples.slice(0, 10).map((sample) => (
                  <SampleCard
                    key={sample.id}
                    sample={sample}
                  />
                ))
              )}
              {storedSamples.length > 10 && (
                <p className="text-xs text-muted-foreground text-center pt-2">
                  + {storedSamples.length - 10} more
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
