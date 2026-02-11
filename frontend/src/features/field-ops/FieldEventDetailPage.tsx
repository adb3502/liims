import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  useFieldEvent,
  useUpdateFieldEvent,
  useCheckInParticipant,
} from '@/api/field-events'
import { useCollectionSites } from '@/api/participants'
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
import { PageSpinner, Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import type { FieldEventStatus, FieldEventParticipant } from '@/types'
import {
  FIELD_EVENT_STATUS_LABELS,
  FIELD_EVENT_TYPE_LABELS,
  PARTNER_LABELS,
} from '@/types'
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Users,
  Building2,
  User,
  CheckCircle2,
  XCircle,
  FileText,
  Printer,
  PenLine,
  Play,
  CheckCheck,
} from 'lucide-react'

const STATUS_BADGE_VARIANT: Record<FieldEventStatus, 'secondary' | 'warning' | 'success' | 'destructive'> = {
  planned: 'secondary',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'destructive',
}

const VALID_STATUS_TRANSITIONS: Record<FieldEventStatus, FieldEventStatus[]> = {
  planned: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

const STATUS_ACTION_ICONS: Record<string, typeof Play> = {
  in_progress: Play,
  completed: CheckCheck,
}

export function FieldEventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { hasRole } = useAuth()
  const [activeTab, setActiveTab] = useState('roster')

  const { data: event, isLoading, isError } = useFieldEvent(id!)
  const { data: sites } = useCollectionSites(true)
  const updateMutation = useUpdateFieldEvent(id!)
  const checkInMutation = useCheckInParticipant(id!)

  const canWrite = hasRole('super_admin', 'lab_manager', 'field_coordinator')

  if (isLoading) return <PageSpinner />

  if (isError || !event) {
    return (
      <div className="rounded-lg border border-danger/20 bg-danger/5 p-8 text-center">
        <p className="text-sm text-danger">Failed to load event details.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/field-ops/events')}>
          Back to events
        </Button>
      </div>
    )
  }

  const siteName = sites?.find((s) => s.id === event.collection_site_id)?.name ?? event.collection_site_id.slice(0, 8)
  const currentStatus = event.status ?? 'planned'
  const nextStatuses = VALID_STATUS_TRANSITIONS[currentStatus] ?? []
  const participants = event.event_participants ?? []
  const checkedIn = participants.filter((p) => p.check_in_time != null)

  async function handleStatusChange(newStatus: FieldEventStatus) {
    try {
      await updateMutation.mutateAsync({ status: newStatus })
    } catch {
      // handled by mutation
    }
  }

  async function handleCheckIn(participant: FieldEventParticipant, field: 'wrist_tag_issued' | 'consent_verified') {
    try {
      await checkInMutation.mutateAsync({
        participantId: participant.participant_id,
        data: { [field]: !participant[field] },
      })
    } catch {
      // handled by mutation
    }
  }

  async function handleQuickCheckIn(participant: FieldEventParticipant) {
    try {
      await checkInMutation.mutateAsync({
        participantId: participant.participant_id,
        data: {
          wrist_tag_issued: true,
          consent_verified: true,
        },
      })
    } catch {
      // handled by mutation
    }
  }

  return (
    <div>
      {/* Back button */}
      <button
        onClick={() => navigate('/field-ops/events')}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4 cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Field Events
      </button>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{event.event_name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_BADGE_VARIANT[currentStatus]}>
              {FIELD_EVENT_STATUS_LABELS[currentStatus]}
            </Badge>
            <Badge variant="secondary">
              {FIELD_EVENT_TYPE_LABELS[event.event_type]}
            </Badge>
            <Badge variant="secondary">Wave {event.wave}</Badge>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Status transitions */}
          {canWrite && nextStatuses.map((ns) => {
            const Icon = STATUS_ACTION_ICONS[ns]
            return (
              <Button
                key={ns}
                variant={ns === 'cancelled' ? 'destructive' : 'default'}
                size="sm"
                onClick={() => handleStatusChange(ns)}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? (
                  <Spinner size="sm" className="text-primary-foreground" />
                ) : Icon ? (
                  <Icon className="h-4 w-4" />
                ) : null}
                {ns === 'in_progress' ? 'Start Event' : ns === 'completed' ? 'Complete' : 'Cancel'}
              </Button>
            )
          })}
          {/* Digitize button */}
          {canWrite && currentStatus !== 'cancelled' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/field-ops/events/${id}/digitize`)}
            >
              <PenLine className="h-4 w-4" />
              Bulk Digitize
            </Button>
          )}
        </div>
      </div>

      {/* Info cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Date</p>
                <p className="font-medium">{new Date(event.event_date).toLocaleDateString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <MapPin className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Site</p>
                <p className="font-medium">{siteName}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Participants</p>
                <p className="font-medium font-mono">
                  {checkedIn.length} / {participants.length}
                  {event.expected_participants ? ` (${event.expected_participants} expected)` : ''}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Partner Lab</p>
                <p className="font-medium">
                  {event.partner_lab ? PARTNER_LABELS[event.partner_lab] : 'None'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="roster">
            Roster ({participants.length})
          </TabsTrigger>
          <TabsTrigger value="checkin">
            Check-in
          </TabsTrigger>
          <TabsTrigger value="documents">
            Documents
          </TabsTrigger>
        </TabsList>

        {/* Roster Tab */}
        <TabsContent value="roster">
          <div className="mt-4">
            {participants.length > 0 ? (
              <div className="rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Participant Code</TableHead>
                      <TableHead>Check-in Time</TableHead>
                      <TableHead>Wrist Tag</TableHead>
                      <TableHead>Consent</TableHead>
                      <TableHead>Stool Kit</TableHead>
                      <TableHead>Urine</TableHead>
                      <TableHead>Sync</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {participants.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <span className="font-mono font-medium text-primary">
                            {p.participant_code ?? p.participant_id.slice(0, 8)}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {p.check_in_time
                            ? new Date(p.check_in_time).toLocaleTimeString()
                            : <span className="text-muted-foreground">---</span>}
                        </TableCell>
                        <TableCell>
                          {p.wrist_tag_issued
                            ? <CheckCircle2 className="h-4 w-4 text-success" />
                            : <XCircle className="h-4 w-4 text-muted-foreground/40" />}
                        </TableCell>
                        <TableCell>
                          {p.consent_verified
                            ? <CheckCircle2 className="h-4 w-4 text-success" />
                            : <XCircle className="h-4 w-4 text-muted-foreground/40" />}
                        </TableCell>
                        <TableCell>
                          {p.stool_kit_issued
                            ? <CheckCircle2 className="h-4 w-4 text-success" />
                            : <XCircle className="h-4 w-4 text-muted-foreground/40" />}
                        </TableCell>
                        <TableCell>
                          {p.urine_collected
                            ? <CheckCircle2 className="h-4 w-4 text-success" />
                            : <XCircle className="h-4 w-4 text-muted-foreground/40" />}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              p.sync_status === 'synced' ? 'success'
                                : p.sync_status === 'conflict' ? 'destructive'
                                  : 'secondary'
                            }
                            className="text-xs"
                          >
                            {p.sync_status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-12 text-center">
                <Users className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-foreground">No participants added</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Add participants to this event roster.
                </p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Check-in Tab */}
        <TabsContent value="checkin">
          <div className="mt-4">
            {participants.length > 0 ? (
              <div className="space-y-2">
                {participants.map((p) => (
                  <div
                    key={p.id}
                    className={cn(
                      'flex items-center gap-4 rounded-lg border p-4',
                      p.check_in_time ? 'border-success/30 bg-success/5' : 'border-border',
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-mono font-medium">
                        {p.participant_code ?? p.participant_id.slice(0, 8)}
                      </p>
                      {p.check_in_time && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Checked in at {new Date(p.check_in_time).toLocaleTimeString()}
                        </p>
                      )}
                    </div>

                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={p.wrist_tag_issued}
                        onChange={() => handleCheckIn(p, 'wrist_tag_issued')}
                        disabled={checkInMutation.isPending}
                        className="h-4 w-4 rounded border-input"
                      />
                      Wrist Tag
                    </label>

                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={p.consent_verified}
                        onChange={() => handleCheckIn(p, 'consent_verified')}
                        disabled={checkInMutation.isPending}
                        className="h-4 w-4 rounded border-input"
                      />
                      Consent
                    </label>

                    {!p.check_in_time && canWrite && (
                      <Button
                        size="sm"
                        onClick={() => handleQuickCheckIn(p)}
                        disabled={checkInMutation.isPending}
                      >
                        {checkInMutation.isPending ? (
                          <Spinner size="sm" className="text-primary-foreground" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        Check In
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-12 text-center">
                <User className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-foreground">No participants to check in</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Add participants to the roster first.
                </p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents">
          <div className="mt-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: 'Check-in Sheet', description: 'Participant check-in form for field use' },
                { label: 'Collection Log', description: 'Sample collection tracking sheet' },
                { label: 'Processing Checklist', description: 'Lab processing step checklist' },
                { label: 'Barcode Labels', description: 'Participant and sample barcode labels' },
              ].map((doc) => (
                <Card key={doc.label}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      {doc.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground mb-3">{doc.description}</p>
                    <Button variant="outline" size="sm" className="w-full">
                      <Printer className="h-4 w-4" />
                      Generate PDF
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            {event.notes && (
              <div className="mt-6 rounded-lg border border-border p-4">
                <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Event Notes
                </h3>
                <p className="text-sm text-muted-foreground">{event.notes}</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
