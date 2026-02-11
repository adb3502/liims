import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useParticipant, useCollectionSites } from '@/api/participants'
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
import { cn } from '@/lib/utils'
import { AGE_GROUP_LABELS, type AgeGroup } from '@/types'
import { ArrowLeft, Edit, Calendar, MapPin, Hash } from 'lucide-react'
import { ConsentForm } from './ConsentForm'

const CONSENT_TYPE_LABELS: Record<string, string> = {
  household: 'Household',
  individual: 'Individual',
  dbs_storage: 'DBS Storage',
  proxy_interview: 'Proxy Interview',
}

const SAMPLE_STATUS_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'destructive' | 'secondary'> = {
  registered: 'secondary',
  collected: 'default',
  transported: 'default',
  received: 'default',
  processing: 'warning',
  stored: 'success',
  reserved: 'default',
  in_analysis: 'default',
  pending_discard: 'destructive',
  depleted: 'secondary',
  discarded: 'destructive',
}

export function ParticipantDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { hasRole } = useAuth()
  const [activeTab, setActiveTab] = useState('overview')
  const [showConsentForm, setShowConsentForm] = useState(false)

  const { data: participant, isLoading, isError } = useParticipant(id!)
  const { data: sites } = useCollectionSites(true)

  if (isLoading) return <PageSpinner />

  if (isError || !participant) {
    return (
      <div className="rounded-lg border border-danger/20 bg-danger/5 p-8 text-center">
        <p className="text-sm text-danger">
          Failed to load participant details.
        </p>
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

  return (
    <div>
      {/* Back button */}
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
          <TabsTrigger value="consents">
            Consents ({participant.consents?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="samples">Samples</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
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
                    />
                  </div>
                  <span className="text-lg font-bold">{pct}%</span>
                </div>

                {/* Sample counts */}
                {participant.sample_counts &&
                  Object.keys(participant.sample_counts).length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Sample Counts by Type
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(participant.sample_counts).map(
                          ([type, count]) => (
                            <div
                              key={type}
                              className="flex items-center justify-between rounded-md bg-muted px-3 py-1.5"
                            >
                              <span className="text-xs capitalize">
                                {type.replace('_', ' ')}
                              </span>
                              <span className="text-xs font-mono font-medium">
                                {count as number}
                              </span>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Consents Tab */}
        <TabsContent value="consents">
          <div className="mt-4">
            {canAddConsent && (
              <div className="mb-4">
                <Button onClick={() => setShowConsentForm(true)}>
                  Add Consent
                </Button>
              </div>
            )}

            {participant.consents && participant.consents.length > 0 ? (
              <div className="rounded-lg border border-border">
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
                        <TableCell className="text-sm">
                          {c.is_proxy ? 'Yes' : 'No'}
                        </TableCell>
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
              <div className="rounded-lg border border-dashed border-border p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No consents recorded yet.
                </p>
              </div>
            )}
          </div>

          {showConsentForm && (
            <ConsentForm
              participantId={id!}
              onClose={() => setShowConsentForm(false)}
            />
          )}
        </TabsContent>

        {/* Samples Tab */}
        <TabsContent value="samples">
          <div className="mt-4 rounded-lg border border-dashed border-border p-12 text-center">
            <p className="text-sm text-muted-foreground">
              Sample data will be displayed here once the sample list API hook is connected.
            </p>
          </div>
        </TabsContent>

        {/* Timeline Tab */}
        <TabsContent value="timeline">
          <div className="mt-4 rounded-lg border border-dashed border-border p-12 text-center">
            <p className="text-sm text-muted-foreground">
              Activity timeline will appear here when audit log integration is complete.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
