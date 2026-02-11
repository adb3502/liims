import { useState } from 'react'
import { useReportTypes, useGenerateReport, type GenerateReportParams } from '@/api/reports'
import { useCollectionSites } from '@/api/participants'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageSpinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import {
  FileSpreadsheet,
  Download,
  Users,
  FlaskConical,
  Archive,
  MapPin,
  CalendarDays,
} from 'lucide-react'

const REPORT_ICONS: Record<string, typeof FileSpreadsheet> = {
  enrollment: Users,
  sample_tracking: FlaskConical,
  inventory_audit: Archive,
  field_event: MapPin,
}

const SAMPLE_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'blood', label: 'Blood' },
  { value: 'serum', label: 'Serum' },
  { value: 'plasma', label: 'Plasma' },
  { value: 'stool', label: 'Stool' },
  { value: 'urine', label: 'Urine' },
  { value: 'saliva', label: 'Saliva' },
]

const SAMPLE_STATUSES = [
  { value: '', label: 'All Statuses' },
  { value: 'in_storage', label: 'In Storage' },
  { value: 'in_transit', label: 'In Transit' },
  { value: 'processing', label: 'Processing' },
  { value: 'exhausted', label: 'Exhausted' },
  { value: 'discarded', label: 'Discarded' },
]

const EVENT_STATUSES = [
  { value: '', label: 'All Statuses' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

export function ReportGeneratorPage() {
  const { data: reportTypes, isLoading } = useReportTypes()
  const { data: sites } = useCollectionSites(true)
  const generateReport = useGenerateReport()

  const [selectedType, setSelectedType] = useState('')
  const [siteId, setSiteId] = useState('')
  const [wave, setWave] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sampleType, setSampleType] = useState('')
  const [sampleStatus, setSampleStatus] = useState('')
  const [eventStatus, setEventStatus] = useState('')

  const selectedReport = reportTypes?.find((r) => r.report_type === selectedType)
  const availableFilters = new Set(selectedReport?.filters ?? [])

  function handleGenerate() {
    if (!selectedType) return
    const params: GenerateReportParams = {
      report_type: selectedType,
    }
    if (siteId) params.site_id = siteId
    if (wave) params.wave = Number(wave)
    if (dateFrom) params.date_from = dateFrom
    if (dateTo) params.date_to = dateTo
    if (sampleType) params.sample_type = sampleType
    if (sampleStatus) params.sample_status = sampleStatus
    if (eventStatus) params.event_status = eventStatus

    generateReport.mutate(params)
  }

  if (isLoading) return <PageSpinner />

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Report Generator</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Generate and download CSV reports for enrollment, samples, inventory, and field events.
        </p>
      </div>

      {/* Report Type Selection */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Select Report Type</CardTitle>
          <CardDescription>Choose the type of report to generate.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {(reportTypes ?? []).map((rt) => {
              const Icon = REPORT_ICONS[rt.report_type] ?? FileSpreadsheet
              const isSelected = selectedType === rt.report_type
              return (
                <button
                  key={rt.report_type}
                  onClick={() => setSelectedType(rt.report_type)}
                  className={cn(
                    'flex items-start gap-3 p-4 rounded-lg border text-left transition-all',
                    isSelected
                      ? 'border-[#3674F6] bg-[#3674F6]/5 ring-1 ring-[#3674F6]/20'
                      : 'border-border hover:border-[#3674F6]/30 hover:bg-muted/30',
                  )}
                >
                  <div className={cn(
                    'rounded-lg p-2 flex-shrink-0',
                    isSelected ? 'bg-[#3674F6]/10' : 'bg-muted',
                  )}>
                    <Icon className={cn('h-5 w-5', isSelected ? 'text-[#3674F6]' : 'text-muted-foreground')} />
                  </div>
                  <div className="min-w-0">
                    <div className={cn('font-medium text-sm', isSelected && 'text-[#3674F6]')}>
                      {rt.label}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{rt.description}</div>
                  </div>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      {selectedType && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-[#03B6D3]" />
              <CardTitle className="text-base font-semibold">Report Filters</CardTitle>
            </div>
            <CardDescription>Optionally narrow down the report data.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Date Range - always available */}
              <div className="space-y-1.5">
                <Label className="text-xs">Date From</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Date To</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>

              {/* Site filter */}
              {availableFilters.has('site_id') && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Collection Site</Label>
                  <select
                    value={siteId}
                    onChange={(e) => setSiteId(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">All Sites</option>
                    {(sites ?? []).map((s) => (
                      <option key={s.id} value={s.id}>{s.site_name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Wave filter */}
              {availableFilters.has('wave') && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Wave</Label>
                  <Input
                    type="number"
                    min={1}
                    value={wave}
                    onChange={(e) => setWave(e.target.value)}
                    placeholder="All waves"
                  />
                </div>
              )}

              {/* Sample Type */}
              {availableFilters.has('sample_type') && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Sample Type</Label>
                  <select
                    value={sampleType}
                    onChange={(e) => setSampleType(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {SAMPLE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Sample Status */}
              {availableFilters.has('sample_status') && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Sample Status</Label>
                  <select
                    value={sampleStatus}
                    onChange={(e) => setSampleStatus(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {SAMPLE_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Event Status */}
              {availableFilters.has('event_status') && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Event Status</Label>
                  <select
                    value={eventStatus}
                    onChange={(e) => setEventStatus(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {EVENT_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="mt-6 flex gap-3">
              <Button onClick={handleGenerate} disabled={generateReport.isPending}>
                <Download className="h-4 w-4" />
                {generateReport.isPending ? 'Generating...' : 'Generate & Download CSV'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setSiteId('')
                  setWave('')
                  setDateFrom('')
                  setDateTo('')
                  setSampleType('')
                  setSampleStatus('')
                  setEventStatus('')
                }}
              >
                Clear Filters
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
