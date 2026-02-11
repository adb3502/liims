import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  useSample,
  useUpdateSampleStatus,
  useGenerateAliquots,
  useWithdrawVolume,
  useRequestDiscard,
} from '@/api/samples'
import { useAuth } from '@/hooks/useAuth'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import type { SampleStatus } from '@/types'
import {
  ArrowLeft,
  Clock,
  MapPin,
  User,
  FileText,
  AlertTriangle,
  Beaker,
  Trash2,
  ArrowRightLeft,
  Droplets,
} from 'lucide-react'

// --- Constants ---

const SAMPLE_TYPE_LABELS: Record<string, string> = {
  plasma: 'Plasma',
  epigenetics: 'Epigenetics',
  extra_blood: 'Extra Blood',
  rbc_smear: 'RBC Smear',
  cheek_swab: 'Cheek Swab',
  hair: 'Hair',
  urine: 'Urine',
  stool_kit: 'Stool Kit',
}

const SAMPLE_STATUS_LABELS: Record<SampleStatus, string> = {
  registered: 'Registered',
  collected: 'Collected',
  transported: 'Transported',
  received: 'Received',
  processing: 'Processing',
  stored: 'Stored',
  reserved: 'Reserved',
  in_analysis: 'In Analysis',
  pending_discard: 'Pending Discard',
  depleted: 'Depleted',
  discarded: 'Discarded',
}

const STATUS_BADGE_VARIANT: Record<SampleStatus, 'default' | 'success' | 'warning' | 'destructive' | 'secondary'> = {
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

// Valid transitions from the backend
const VALID_TRANSITIONS: Record<SampleStatus, SampleStatus[]> = {
  registered: ['collected'],
  collected: ['transported', 'processing'],
  transported: ['received'],
  received: ['processing', 'stored'],
  processing: ['stored'],
  stored: ['reserved', 'in_analysis', 'pending_discard'],
  reserved: ['in_analysis', 'stored'],
  in_analysis: ['stored', 'depleted'],
  pending_discard: ['discarded', 'stored'],
  depleted: [],
  discarded: [],
}

const DISCARD_REASONS = [
  { value: 'contamination', label: 'Contamination' },
  { value: 'depleted', label: 'Depleted' },
  { value: 'consent_withdrawal', label: 'Consent Withdrawal' },
  { value: 'expired', label: 'Expired' },
  { value: 'other', label: 'Other' },
]

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function SampleDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { hasRole } = useAuth()
  const [activeTab, setActiveTab] = useState('overview')

  const { data: sample, isLoading, isError } = useSample(id!)

  const statusMutation = useUpdateSampleStatus(id!)
  const aliquotMutation = useGenerateAliquots(id!)
  const withdrawMutation = useWithdrawVolume(id!)
  const discardMutation = useRequestDiscard(id!)

  // Action form state
  const [newStatus, setNewStatus] = useState<SampleStatus | ''>('')
  const [statusNotes, setStatusNotes] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawReason, setWithdrawReason] = useState('')
  const [discardReason, setDiscardReason] = useState('')
  const [discardNotes, setDiscardNotes] = useState('')

  const canWrite = hasRole('super_admin', 'lab_manager', 'lab_technician', 'field_coordinator')

  if (isLoading) return <PageSpinner />

  if (isError || !sample) {
    return (
      <div className="rounded-lg border border-danger/20 bg-danger/5 p-8 text-center">
        <p className="text-sm text-danger">Failed to load sample details.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/samples')}>
          Back to list
        </Button>
      </div>
    )
  }

  const validNext = VALID_TRANSITIONS[sample.status] ?? []
  const hasAliquots = sample.aliquots && sample.aliquots.length > 0

  const volumePct =
    sample.initial_volume_ul != null && Number(sample.initial_volume_ul) > 0
      ? Math.round((Number(sample.remaining_volume_ul ?? 0) / Number(sample.initial_volume_ul)) * 100)
      : null

  async function handleStatusUpdate() {
    if (!newStatus) return
    try {
      await statusMutation.mutateAsync({ status: newStatus as SampleStatus, notes: statusNotes || undefined })
      setNewStatus('')
      setStatusNotes('')
    } catch { /* handled by mutation */ }
  }

  async function handleGenerateAliquots() {
    try {
      await aliquotMutation.mutateAsync()
    } catch { /* handled by mutation */ }
  }

  async function handleWithdraw() {
    const amount = parseFloat(withdrawAmount)
    if (isNaN(amount) || amount <= 0) return
    try {
      await withdrawMutation.mutateAsync({ volume_ul: amount, reason: withdrawReason || undefined })
      setWithdrawAmount('')
      setWithdrawReason('')
    } catch { /* handled by mutation */ }
  }

  async function handleDiscardRequest() {
    if (!discardReason) return
    try {
      await discardMutation.mutateAsync({ reason: discardReason, reason_notes: discardNotes || undefined })
      setDiscardReason('')
      setDiscardNotes('')
    } catch { /* handled by mutation */ }
  }

  return (
    <div>
      {/* Back button */}
      <button
        onClick={() => navigate('/samples')}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4 cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Samples
      </button>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold font-mono text-foreground">
            {sample.sample_code}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {SAMPLE_TYPE_LABELS[sample.sample_type] ?? sample.sample_type}
            </Badge>
            <Badge variant={STATUS_BADGE_VARIANT[sample.status] ?? 'default'}>
              {SAMPLE_STATUS_LABELS[sample.status] ?? sample.status}
            </Badge>
            <Badge variant="secondary">Wave {sample.wave}</Badge>
            {sample.has_deviation && (
              <Badge variant="warning">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Deviation
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="history">
            Status History ({sample.status_history?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="aliquots">
            Aliquots ({sample.aliquots?.length ?? 0})
          </TabsTrigger>
          {canWrite && <TabsTrigger value="actions">Actions</TabsTrigger>}
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid gap-4 md:grid-cols-2 mt-4">
            {/* Left card: Collection info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Collection Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Participant:</span>
                  <Link
                    to={`/participants/${sample.participant_id}`}
                    className="font-mono font-medium text-primary hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {sample.participant?.participant_code ?? sample.participant_id.slice(0, 8)}
                  </Link>
                </div>
                {sample.collection_site_id && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Collection Site:</span>
                    <span className="font-mono text-xs">{sample.collection_site_id.slice(0, 8)}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Collected:</span>
                  <span>
                    {sample.collection_datetime
                      ? new Date(sample.collection_datetime).toLocaleString()
                      : 'Not yet collected'}
                  </span>
                </div>
                {sample.notes && (
                  <div className="flex items-start gap-2 text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <span className="text-muted-foreground">Notes:</span>
                    <span className="text-foreground">{sample.notes}</span>
                  </div>
                )}
                {sample.has_deviation && (
                  <div className="flex items-start gap-2 text-sm">
                    <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
                    <span className="text-muted-foreground">Deviation:</span>
                    <span className="text-warning">
                      {sample.deviation_notes ?? 'Flagged'}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Right card: Volume and storage */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Volume & Storage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {sample.initial_volume_ul != null ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Remaining Volume</span>
                      <span className="font-mono font-medium">
                        {Number(sample.remaining_volume_ul ?? 0).toLocaleString()} / {Number(sample.initial_volume_ul).toLocaleString()} uL
                      </span>
                    </div>
                    {volumePct != null && (
                      <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            volumePct < 20 && 'bg-danger',
                            volumePct >= 20 && volumePct < 50 && 'bg-warning',
                            volumePct >= 50 && 'bg-success'
                          )}
                          style={{ width: `${Math.min(100, volumePct)}%` }}
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    This sample type does not track volume.
                  </p>
                )}

                {sample.storage_location_id && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Storage Location:</span>
                    <span className="font-mono text-xs">{sample.storage_location_id.slice(0, 8)}</span>
                  </div>
                )}

                {/* Processing timer */}
                {sample.status === 'processing' && sample.processing_elapsed_seconds != null && (
                  <div className="rounded-md bg-warning/10 border border-warning/20 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-warning" />
                      <span className="text-muted-foreground">Processing Time:</span>
                      <span className="font-mono font-medium text-warning">
                        {formatElapsed(sample.processing_elapsed_seconds)}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Status History Tab */}
        <TabsContent value="history">
          <div className="mt-4">
            {sample.status_history && sample.status_history.length > 0 ? (
              <div className="relative pl-6">
                {/* Timeline line */}
                <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />

                <div className="space-y-4">
                  {sample.status_history.map((entry, idx) => (
                    <div key={entry.id} className="relative flex items-start gap-4">
                      {/* Timeline dot */}
                      <div
                        className={cn(
                          'absolute -left-6 top-1.5 h-3 w-3 rounded-full border-2 border-background',
                          idx === 0 ? 'bg-primary' : 'bg-muted-foreground/40'
                        )}
                      />
                      <div className="flex-1 rounded-lg border border-border p-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          {entry.previous_status && (
                            <>
                              <Badge variant={STATUS_BADGE_VARIANT[entry.previous_status] ?? 'secondary'} className="text-xs">
                                {SAMPLE_STATUS_LABELS[entry.previous_status] ?? entry.previous_status}
                              </Badge>
                              <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
                            </>
                          )}
                          <Badge variant={STATUS_BADGE_VARIANT[entry.new_status] ?? 'default'} className="text-xs">
                            {SAMPLE_STATUS_LABELS[entry.new_status] ?? entry.new_status}
                          </Badge>
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{new Date(entry.changed_at).toLocaleString()}</span>
                          <span className="font-mono">{entry.changed_by.slice(0, 8)}</span>
                        </div>
                        {entry.notes && (
                          <p className="mt-1 text-xs text-foreground">{entry.notes}</p>
                        )}
                        {entry.location_context && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Location: {entry.location_context}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-8 text-center">
                <p className="text-sm text-muted-foreground">No status history recorded.</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Aliquots Tab */}
        <TabsContent value="aliquots">
          <div className="mt-4">
            {hasAliquots ? (
              <div className="rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sample Code</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Volume</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sample.aliquots.map((a) => (
                      <TableRow
                        key={a.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/samples/${a.id}`)}
                      >
                        <TableCell>
                          <span className="font-mono font-medium text-primary">
                            {a.sample_code}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {SAMPLE_TYPE_LABELS[a.sample_type] ?? a.sample_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_BADGE_VARIANT[a.status] ?? 'default'}>
                            {SAMPLE_STATUS_LABELS[a.status] ?? a.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground font-mono">
                          {a.initial_volume_ul != null
                            ? `${Number(a.remaining_volume_ul ?? 0)} / ${Number(a.initial_volume_ul)} uL`
                            : '---'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-8 text-center">
                <Beaker className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No aliquots generated yet.</p>
                {canWrite && (
                  <Button
                    variant="outline"
                    className="mt-3"
                    onClick={handleGenerateAliquots}
                    disabled={aliquotMutation.isPending}
                  >
                    {aliquotMutation.isPending ? (
                      <>
                        <Spinner size="sm" /> Generating...
                      </>
                    ) : (
                      'Generate Aliquots'
                    )}
                  </Button>
                )}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Actions Tab */}
        {canWrite && (
          <TabsContent value="actions">
            <div className="mt-4 space-y-6">
              {/* Update Status */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ArrowRightLeft className="h-4 w-4" />
                    Update Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {validNext.length > 0 ? (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label>New Status</Label>
                        <select
                          value={newStatus}
                          onChange={(e) => setNewStatus(e.target.value as SampleStatus)}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                          <option value="">Select a status...</option>
                          {validNext.map((s) => (
                            <option key={s} value={s}>
                              {SAMPLE_STATUS_LABELS[s]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label>Notes (optional)</Label>
                        <Input
                          value={statusNotes}
                          onChange={(e) => setStatusNotes(e.target.value)}
                          placeholder="Transition notes..."
                        />
                      </div>
                      <Button
                        onClick={handleStatusUpdate}
                        disabled={!newStatus || statusMutation.isPending}
                      >
                        {statusMutation.isPending ? (
                          <>
                            <Spinner size="sm" className="text-primary-foreground" /> Updating...
                          </>
                        ) : (
                          'Update Status'
                        )}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No further status transitions available from "{SAMPLE_STATUS_LABELS[sample.status]}".
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Generate Aliquots */}
              {!hasAliquots && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Beaker className="h-4 w-4" />
                      Generate Aliquots
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-3">
                      Auto-generate aliquots based on the configured rules for this sample type.
                    </p>
                    <Button
                      onClick={handleGenerateAliquots}
                      disabled={aliquotMutation.isPending}
                    >
                      {aliquotMutation.isPending ? (
                        <>
                          <Spinner size="sm" className="text-primary-foreground" /> Generating...
                        </>
                      ) : (
                        'Generate Aliquots'
                      )}
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Withdraw Volume */}
              {sample.initial_volume_ul != null && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Droplets className="h-4 w-4" />
                      Withdraw Volume
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                        Remaining: <span className="font-mono font-medium text-foreground">{Number(sample.remaining_volume_ul ?? 0).toLocaleString()} uL</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label>Amount (uL)</Label>
                          <Input
                            type="number"
                            min={1}
                            max={Number(sample.remaining_volume_ul ?? 0)}
                            value={withdrawAmount}
                            onChange={(e) => setWithdrawAmount(e.target.value)}
                            placeholder="0"
                            className="font-mono"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Reason (optional)</Label>
                          <Input
                            value={withdrawReason}
                            onChange={(e) => setWithdrawReason(e.target.value)}
                            placeholder="e.g. Analysis"
                          />
                        </div>
                      </div>
                      <Button
                        onClick={handleWithdraw}
                        disabled={!withdrawAmount || withdrawMutation.isPending}
                      >
                        {withdrawMutation.isPending ? (
                          <>
                            <Spinner size="sm" className="text-primary-foreground" /> Processing...
                          </>
                        ) : (
                          'Withdraw Volume'
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Request Discard */}
              {sample.status !== 'depleted' && sample.status !== 'discarded' && sample.status !== 'pending_discard' && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2 text-danger">
                      <Trash2 className="h-4 w-4" />
                      Request Discard
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label>Reason</Label>
                        <select
                          value={discardReason}
                          onChange={(e) => setDiscardReason(e.target.value)}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                          <option value="">Select a reason...</option>
                          {DISCARD_REASONS.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label>Additional Notes (optional)</Label>
                        <textarea
                          value={discardNotes}
                          onChange={(e) => setDiscardNotes(e.target.value)}
                          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          placeholder="Additional details..."
                        />
                      </div>
                      <Button
                        variant="destructive"
                        onClick={handleDiscardRequest}
                        disabled={!discardReason || discardMutation.isPending}
                      >
                        {discardMutation.isPending ? (
                          <>
                            <Spinner size="sm" /> Submitting...
                          </>
                        ) : (
                          'Submit Discard Request'
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
