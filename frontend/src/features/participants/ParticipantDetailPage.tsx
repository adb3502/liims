import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useParticipant, useCollectionSites } from '@/api/participants'
import { useSamples } from '@/api/samples'
import { usePartnerResults } from '@/api/partner'
import { useAuth } from '@/hooks/useAuth'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { PageSpinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { AGE_GROUP_LABELS, type AgeGroup, SAMPLE_TYPE_LABELS, SAMPLE_STATUS_LABELS } from '@/types'
import {
  ArrowLeft,
  Edit,
  Calendar,
  MapPin,
  Hash,
  FlaskConical,
  Activity,
  FileText,
  ClipboardList,
  AlertTriangle,
} from 'lucide-react'
import { ConsentForm } from './ConsentForm'

const CONSENT_TYPE_LABELS: Record<string, string> = {
  household: 'Household',
  individual: 'Individual',
  dbs_storage: 'DBS Storage',
  proxy_interview: 'Proxy Interview',
}

// ──── Clinical data section labels ────────────────────────────────────────
// The backend clinical_data JSON blob has nested sections. We render
// whatever keys are present without assuming a fixed schema.

const SECTION_DISPLAY_NAMES: Record<string, string> = {
  vitals: 'Vitals',
  anthropometry: 'Anthropometry',
  scores: 'Questionnaire Scores',
  blood_pressure: 'Blood Pressure',
  glucose: 'Glucose',
  haematology: 'Haematology',
}

function formatClinicalValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function ClinicalDataSection({
  label,
  data,
}: {
  label: string
  data: Record<string, unknown>
}) {
  const entries = Object.entries(data)
  if (entries.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2">
          {entries.map(([key, value]) => (
            <div key={key} className="flex flex-col">
              <dt className="text-xs text-muted-foreground capitalize">
                {key.replace(/_/g, ' ')}
              </dt>
              <dd className="text-sm font-medium text-foreground font-mono">
                {formatClinicalValue(value)}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

// ──── Main component ──────────────────────────────────────────────────────

export function ParticipantDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { hasRole } = useAuth()
  const [activeTab, setActiveTab] = useState('overview')
  const [showConsentForm, setShowConsentForm] = useState(false)

  const { data: participant, isLoading, isError } = useParticipant(id!)
  const { data: sites } = useCollectionSites(true)

  // Lazy-load samples and lab results only when tab is active
  const { data: samplesData, isLoading: samplesLoading } = useSamples(
    activeTab === 'samples' ? { participant_id: id!, per_page: 100 } : {}
  )
  const { data: partnerResults, isLoading: labResultsLoading } = usePartnerResults(
    activeTab === 'lab-results' ? (id ?? '') : ''
  )

  if (isLoading) return <PageSpinner />

  if (isError || !participant) {
    return (
      <div className="rounded-lg border border-danger/20 bg-danger/5 p-8 text-center">
        <p className="text-sm text-danger">Failed to load participant details.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/participants')}>
          Back to list
        </Button>
      </div>
    )
  }

  const siteName =
    participant.collection_site?.name ??
    sites?.find((s) => s.id === participant.collection_site_id)?.name ??
    '---'

  const pct = Number(participant.completion_pct) || 0
  const canEdit = hasRole('super_admin', 'lab_manager', 'data_entry')
  const canAddConsent = hasRole('super_admin', 'lab_manager', 'data_entry', 'field_coordinator')

  // Clinical data — it's stored as a JSONB blob; may be null
  const clinicalData = (participant as unknown as { clinical_data?: Record<string, unknown> | null })
    .clinical_data

  // Count abnormal lab results for badge
  const abnormalCount = partnerResults?.filter((r) => r.is_abnormal).length ?? 0

  return (
    <div>
      {/* Back */}
      <button
        onClick={() => navigate('/participants')}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4 cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Participants
      </button>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold font-mono text-foreground">
            {participant.participant_code}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {AGE_GROUP_LABELS[participant.age_group as AgeGroup] ?? participant.age_group}
            </Badge>
            <Badge variant={participant.sex === 'M' ? 'outline' : 'secondary'}>
              {participant.sex === 'M' ? 'Male' : 'Female'}
            </Badge>
            <Badge variant="secondary">Wave {participant.wave}</Badge>
            <span className="text-sm text-muted-foreground capitalize">
              {participant.enrollment_source.replace('_', ' ')}
            </span>
          </div>
        </div>
        {canEdit && (
          <Button variant="outline" onClick={() => navigate(`/participants/${id}/edit`)}>
            <Edit className="h-4 w-4" />
            Edit
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="clinical">
            Clinical Data
          </TabsTrigger>
          <TabsTrigger value="lab-results">
            Lab Results
            {abnormalCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-danger/15 text-danger text-xs font-bold min-w-[18px] px-1">
                {abnormalCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="samples">
            Samples ({samplesData?.data.length ?? participant.sample_counts
              ? Object.values(participant.sample_counts ?? {}).reduce(
                  (a: number, b) => a + (b as number),
                  0
                )
              : 0})
          </TabsTrigger>
          <TabsTrigger value="consents">
            Consents ({participant.consents?.length ?? 0})
          </TabsTrigger>
        </TabsList>

        {/* ── Overview Tab ──────────────────────────────────────────────── */}
        <TabsContent value="overview">
          <div className="grid gap-4 md:grid-cols-2 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Enrollment Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Group:</span>
                  <span className="font-mono font-medium">{participant.group_code}</span>
                  <span className="text-muted-foreground ml-2">Number:</span>
                  <span className="font-mono font-medium">{participant.participant_number}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Site:</span>
                  <span className="font-medium">{siteName}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Enrolled:</span>
                  <span>{new Date(participant.enrollment_date).toLocaleDateString()}</span>
                </div>
                {participant.date_of_birth && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">DOB:</span>
                    <span>{new Date(participant.date_of_birth).toLocaleDateString()}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Completion Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-3 flex-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        pct < 30 && 'bg-danger',
                        pct >= 30 && pct < 70 && 'bg-warning',
                        pct >= 70 && 'bg-success'
                      )}
                      style={{ width: `${Math.min(100, pct)}%` }}
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Completion: ${pct}%`}
                    />
                  </div>
                  <span className="text-lg font-bold">{pct}%</span>
                </div>

                {participant.sample_counts &&
                  Object.keys(participant.sample_counts).length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Sample Counts by Type
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(participant.sample_counts).map(([type, count]) => (
                          <div
                            key={type}
                            className="flex items-center justify-between rounded-md bg-muted px-3 py-1.5"
                          >
                            <span className="text-xs capitalize">{type.replace('_', ' ')}</span>
                            <span className="text-xs font-mono font-medium">{count as number}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Clinical Data Tab ─────────────────────────────────────────── */}
        <TabsContent value="clinical">
          <div className="mt-4">
            {!clinicalData ? (
              <EmptyState
                icon={<ClipboardList className="h-6 w-6" />}
                title="No clinical data recorded"
                description="Clinical metadata such as vitals, anthropometry, and questionnaire scores will appear here once collected."
              />
            ) : Object.keys(clinicalData).length === 0 ? (
              <EmptyState
                icon={<ClipboardList className="h-6 w-6" />}
                title="Clinical data is empty"
                description="The clinical data record exists but contains no values yet."
              />
            ) : (
              <div className="space-y-4">
                {Object.entries(clinicalData).map(([section, sectionData]) => {
                  const label =
                    SECTION_DISPLAY_NAMES[section] ??
                    section.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

                  // Each section is expected to be a flat object of key→value pairs.
                  // If it's a primitive, wrap it.
                  const data: Record<string, unknown> =
                    typeof sectionData === 'object' && sectionData !== null
                      ? (sectionData as Record<string, unknown>)
                      : { value: sectionData }

                  return (
                    <ClinicalDataSection key={section} label={label} data={data} />
                  )
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Lab Results Tab ───────────────────────────────────────────── */}
        <TabsContent value="lab-results">
          <div className="mt-4">
            {labResultsLoading ? (
              <PageSpinner />
            ) : !partnerResults || partnerResults.length === 0 ? (
              <EmptyState
                icon={<Activity className="h-6 w-6" />}
                title="No lab results yet"
                description="Partner lab results (Healthians, 1mg, Lal Path Labs, DecodeAge) will appear here once imported."
              />
            ) : (
              <>
                {abnormalCount > 0 && (
                  <div className="flex items-center gap-2 mb-4 rounded-lg border border-danger/20 bg-danger/5 px-4 py-3">
                    <AlertTriangle className="h-4 w-4 text-danger flex-shrink-0" />
                    <p className="text-sm text-danger">
                      <span className="font-semibold">{abnormalCount}</span> abnormal result
                      {abnormalCount !== 1 ? 's' : ''} flagged for review.
                    </p>
                  </div>
                )}
                <div className="rounded-lg border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Test Name</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Value</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead>Reference Range</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {partnerResults.map((result) => (
                        <TableRow
                          key={result.id}
                          className={cn(result.is_abnormal && 'bg-danger/5')}
                        >
                          <TableCell className="font-medium">
                            {result.canonical_test_name ?? result.test_name_raw ?? '—'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {result.test_date
                              ? new Date(result.test_date).toLocaleDateString()
                              : '—'}
                          </TableCell>
                          <TableCell
                            className={cn(
                              'font-mono text-sm font-semibold',
                              result.is_abnormal && 'text-danger'
                            )}
                          >
                            {result.test_value ?? '—'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {result.test_unit ?? '—'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {result.reference_range ?? '—'}
                          </TableCell>
                          <TableCell>
                            {result.is_abnormal === null ? (
                              <span className="text-xs text-muted-foreground">N/A</span>
                            ) : result.is_abnormal ? (
                              <Badge variant="destructive">Abnormal</Badge>
                            ) : (
                              <Badge variant="success">Normal</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </div>
        </TabsContent>

        {/* ── Samples Tab ───────────────────────────────────────────────── */}
        <TabsContent value="samples">
          <div className="mt-4">
            {samplesLoading ? (
              <PageSpinner />
            ) : !samplesData?.data.length ? (
              <EmptyState
                icon={<FlaskConical className="h-6 w-6" />}
                title="No samples registered"
                description="Samples registered for this participant will appear here."
              />
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sample Code</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Volume (µL)</TableHead>
                      <TableHead>Collected</TableHead>
                      <TableHead>Wave</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {samplesData.data.map((sample) => (
                      <TableRow
                        key={sample.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/samples/${sample.id}`)}
                      >
                        <TableCell>
                          <span className="font-mono text-sm font-medium text-primary">
                            {sample.sample_code}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {SAMPLE_TYPE_LABELS[sample.sample_type] ?? sample.sample_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              sample.status === 'discarded' || sample.status === 'depleted'
                                ? 'destructive'
                                : sample.status === 'stored'
                                ? 'success'
                                : 'secondary'
                            }
                          >
                            {SAMPLE_STATUS_LABELS[sample.status] ?? sample.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm font-mono">
                          {sample.remaining_volume_ul != null
                            ? `${sample.remaining_volume_ul} / ${sample.initial_volume_ul ?? '?'}`
                            : sample.initial_volume_ul != null
                            ? sample.initial_volume_ul
                            : '—'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {sample.collection_datetime
                            ? new Date(sample.collection_datetime).toLocaleDateString()
                            : '—'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {sample.wave}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Consents Tab ──────────────────────────────────────────────── */}
        <TabsContent value="consents">
          <div className="mt-4">
            {canAddConsent && (
              <div className="mb-4">
                <Button onClick={() => setShowConsentForm(true)}>Add Consent</Button>
              </div>
            )}

            {participant.consents && participant.consents.length > 0 ? (
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Given</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Proxy</TableHead>
                      <TableHead>Witness</TableHead>
                      <TableHead>Withdrawn</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {participant.consents.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">
                          {CONSENT_TYPE_LABELS[c.consent_type] ?? c.consent_type}
                        </TableCell>
                        <TableCell>
                          <Badge variant={c.consent_given ? 'success' : 'destructive'}>
                            {c.consent_given ? 'Yes' : 'No'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(c.consent_date).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-sm">{c.is_proxy ? 'Yes' : 'No'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {c.witness_name ?? '---'}
                        </TableCell>
                        <TableCell>
                          {c.withdrawal_date ? (
                            <Badge variant="destructive">
                              {new Date(c.withdrawal_date).toLocaleDateString()}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">---</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState
                icon={<FileText className="h-6 w-6" />}
                title="No consents recorded"
                description="Consent records for this participant will appear here."
              />
            )}
          </div>

          {showConsentForm && (
            <ConsentForm participantId={id!} onClose={() => setShowConsentForm(false)} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
