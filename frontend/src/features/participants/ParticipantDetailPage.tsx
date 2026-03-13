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
import {
  AGE_GROUP_LABELS,
  type AgeGroup,
  SAMPLE_TYPE_LABELS,
  SAMPLE_STATUS_LABELS,
  type ClinicalData,
} from '@/types'
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

// ──── Metadata (clinical data) display helpers ────────────────────────────

function MetaField({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground capitalize">{label}</dt>
      <dd className={cn('text-sm font-medium text-foreground', mono && 'font-mono')}>{value}</dd>
    </div>
  )
}

function MetaCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2">{children}</dl>
      </CardContent>
    </Card>
  )
}

function BoolBadge({ value, label }: { value: boolean | null | undefined; label: string }) {
  if (value === null || value === undefined) return null
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium',
        value
          ? 'bg-danger/10 text-danger'
          : 'bg-success/10 text-success',
      )}
    >
      {value ? '+ ' : '- '}{label}
    </span>
  )
}

function MetadataContent({ cd }: { cd: ClinicalData }) {
  const d = cd.demographics
  const v = cd.vitals
  const a = cd.anthropometry
  const s = cd.scores
  const c = cd.comorbidities
  const fh = cd.family_history
  const lf = cd.lifestyle
  const ad = cd.addiction
  const fs = cd.female_specific

  return (
    <div className="space-y-4">
      {/* Demographics */}
      {d && (
        <MetaCard title="Demographics">
          <MetaField label="Residential Area" value={d.residential_area} />
          <MetaField label="Education" value={d.education} />
          <MetaField label="Occupation" value={d.occupation} />
          <MetaField label="Marital Status" value={d.marital_status} />
          <MetaField label="Religion" value={d.religion} />
          <MetaField label="Language" value={d.language} />
          <MetaField label="Monthly Income" value={d.monthly_income} />
          <MetaField label="Socioeconomic Status" value={d.socioeconomic_status} />
          <MetaField label="Family Members" value={d.no_of_family_members} mono />
          <MetaField label="Living Arrangement" value={d.living_arrangement} />
        </MetaCard>
      )}

      {/* Vitals */}
      {v && (
        <MetaCard title="Vitals">
          {(v.bp_sbp != null || v.bp_dbp != null) && (
            <MetaField label="BP (SBP / DBP)" value={`${v.bp_sbp ?? '?'} / ${v.bp_dbp ?? '?'} mmHg`} mono />
          )}
          <MetaField label="Pulse Rate" value={v.pulse_rate != null ? `${v.pulse_rate} bpm` : null} mono />
          <MetaField label="SpO2" value={v.spo2 != null ? `${v.spo2}%` : null} mono />
          <MetaField label="Temperature" value={v.temperature != null ? `${v.temperature} °C` : null} mono />
          <MetaField label="Resp. Rate" value={v.resp_rate != null ? `${v.resp_rate} /min` : null} mono />
        </MetaCard>
      )}

      {/* Anthropometry */}
      {a && (
        <MetaCard title="Anthropometry">
          <MetaField label="Height" value={a.height_cm != null ? `${a.height_cm} cm` : null} mono />
          <MetaField label="Weight" value={a.weight_kg != null ? `${a.weight_kg} kg` : null} mono />
          <MetaField label="BMI" value={a.bmi != null ? `${a.bmi} kg/m²` : null} mono />
        </MetaCard>
      )}

      {/* Questionnaire Scores */}
      {s && (
        <MetaCard title="Questionnaire Scores">
          {s.dass_depression != null && (
            <MetaField label="DASS Depression" value={`${s.dass_depression}${s.depression_level ? ` (${s.depression_level})` : ''}`} mono />
          )}
          {s.dass_anxiety != null && (
            <MetaField label="DASS Anxiety" value={`${s.dass_anxiety}${s.anxiety_level ? ` (${s.anxiety_level})` : ''}`} mono />
          )}
          {s.dass_stress != null && (
            <MetaField label="DASS Stress" value={`${s.dass_stress}${s.stress_level ? ` (${s.stress_level})` : ''}`} mono />
          )}
          <MetaField label="DASS Total" value={s.dass_total} mono />
          <MetaField label="MMSE Total" value={s.mmse_total} mono />
          {s.frail_score != null && (
            <MetaField label="FRAIL Score" value={`${s.frail_score}${s.frail_category ? ` (${s.frail_category})` : ''}`} mono />
          )}
          <MetaField label="Sleep Hours" value={s.sleep_hours != null ? `${s.sleep_hours} h` : null} mono />
          <MetaField label="Sleep Latency" value={s.sleep_latency != null ? `${s.sleep_latency} min` : null} mono />
        </MetaCard>
      )}

      {/* Comorbidities */}
      {c && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Comorbidities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <BoolBadge value={c.dm} label={`DM${c.dm && c.dm_type ? ` (${c.dm_type})` : ''}${c.dm && c.dm_duration ? `, ${c.dm_duration}` : ''}`} />
              <BoolBadge value={c.htn} label={`HTN${c.htn && c.htn_duration ? ` (${c.htn_duration})` : ''}`} />
              <BoolBadge value={c.bronchial_asthma} label="Bronchial Asthma" />
              <BoolBadge value={c.ihd} label="IHD" />
              <BoolBadge value={c.hypothyroid} label="Hypothyroid" />
              <BoolBadge value={c.epilepsy} label="Epilepsy" />
              <BoolBadge value={c.psychiatric} label="Psychiatric" />
              <BoolBadge
                value={c.covid_history}
                label={`COVID${c.covid_history && c.covid_vaccinated != null ? ` (vacc: ${c.covid_vaccinated ? 'Yes' : 'No'}${c.covid_doses ? `, ${c.covid_doses} doses` : ''})` : ''}`}
              />
              {c.other && (
                <span className="text-xs text-muted-foreground">Other: {c.other}</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Family History */}
      {fh && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Family History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <BoolBadge value={fh.dm} label="DM" />
              <BoolBadge value={fh.ihd} label="IHD" />
              <BoolBadge value={fh.cancer} label="Cancer" />
              <BoolBadge value={fh.neurodegenerative} label="Neurodegenerative" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lifestyle */}
      {lf && (
        <MetaCard title="Lifestyle">
          <MetaField label="Dietary Pattern" value={lf.dietary_pattern} />
          <MetaField label="Exercise" value={lf.exercise} />
          <MetaField label="Bowel Frequency" value={lf.bowel_frequency} />
          <MetaField label="Water per Day" value={lf.water_per_day} />
          {lf.probiotics_use != null && (
            <MetaField label="Probiotics Use" value={lf.probiotics_use ? 'Yes' : 'No'} />
          )}
          {lf.supplement_use != null && (
            <MetaField label="Supplement Use" value={lf.supplement_use ? 'Yes' : 'No'} />
          )}
        </MetaCard>
      )}

      {/* Addiction */}
      {ad && (
        <MetaCard title="Addiction">
          <MetaField label="Smoking" value={ad.smoking_status} />
          <MetaField label="Smokeless Tobacco" value={ad.smokeless_status} />
          <MetaField label="Alcohol" value={ad.alcohol_status} />
          {ad.passive_smoke != null && (
            <MetaField label="Passive Smoke" value={ad.passive_smoke ? 'Yes' : 'No'} />
          )}
        </MetaCard>
      )}

      {/* Female Specific */}
      {fs && (
        <MetaCard title="Female Specific">
          <MetaField label="Menopausal Status" value={fs.menopausal_status} />
          <MetaField label="LMP" value={fs.lmp} />
          {fs.pcos_history != null && (
            <MetaField label="PCOS History" value={fs.pcos_history ? 'Yes' : 'No'} />
          )}
        </MetaCard>
      )}

      {/* Systemic Exam — raw JSON in collapsible */}
      {cd.systemic && Object.keys(cd.systemic).length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-muted-foreground uppercase tracking-wider list-none flex items-center gap-2">
                <span>Systemic Examination (raw)</span>
              </summary>
              <pre className="mt-2 text-xs text-muted-foreground overflow-auto max-h-48 bg-muted rounded p-2">
                {JSON.stringify(cd.systemic, null, 2)}
              </pre>
            </details>
          </CardContent>
        </Card>
      )}

      {/* WHO QoL — raw JSON in collapsible */}
      {cd.who_qol && Object.keys(cd.who_qol).length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-muted-foreground uppercase tracking-wider list-none flex items-center gap-2">
                <span>WHO Quality of Life (raw)</span>
              </summary>
              <pre className="mt-2 text-xs text-muted-foreground overflow-auto max-h-48 bg-muted rounded p-2">
                {JSON.stringify(cd.who_qol, null, 2)}
              </pre>
            </details>
          </CardContent>
        </Card>
      )}
    </div>
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
  const canEdit = hasRole('super_admin', 'lii_pi_researcher', 'icmr_car_jrf')
  const canAddConsent = hasRole('super_admin', 'lii_pi_researcher', 'icmr_car_jrf', 'field_operative')

  // Clinical data — typed via the Participant interface
  const clinicalData: ClinicalData | null | undefined = participant.clinical_data

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
            Metadata
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
                <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Age at Collection:</span>
                    {participant.computed_age != null ? (
                      <>
                        <span className="font-medium">{participant.computed_age} yrs</span>
                        <span className="text-xs text-muted-foreground">
                          ({
                            participant.age_source === 'dob_blood' ? 'DOB + blood date' :
                            participant.age_source === 'dob_enrollment' ? 'from DOB' :
                            participant.age_source === 'blood_import' ? 'blood import' :
                            'from ODK form'
                          })
                        </span>
                        {participant.age_group_mismatch && (
                          <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium bg-warning/15 text-warning">
                            <AlertTriangle className="h-3 w-3" />
                            Age group mismatch
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">N/A</span>
                    )}
                  </div>
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

        {/* ── Metadata Tab ──────────────────────────────────────────────── */}
        <TabsContent value="clinical">
          <div className="mt-4">
            {activeTab === 'clinical' && (
              !clinicalData ? (
                <EmptyState
                  icon={<ClipboardList className="h-6 w-6" />}
                  title="No metadata recorded"
                  description="Clinical metadata such as vitals, anthropometry, and questionnaire scores will appear here once collected."
                />
              ) : Object.values(clinicalData).every((v) => v === null || v === undefined) ? (
                <EmptyState
                  icon={<ClipboardList className="h-6 w-6" />}
                  title="Metadata is empty"
                  description="The metadata record exists but contains no values yet."
                />
              ) : (
                <MetadataContent cd={clinicalData} />
              )
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
