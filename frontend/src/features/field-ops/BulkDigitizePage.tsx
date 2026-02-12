import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useFieldEvent, useBulkDigitize } from '@/api/field-events'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageSpinner, Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { FIELD_EVENT_STATUS_LABELS } from '@/types'
import type { FieldEventStatus, FieldEventParticipant } from '@/types'
import { ArrowLeft, Save, CheckCircle2 } from 'lucide-react'

const STATUS_BADGE_VARIANT: Record<FieldEventStatus, 'secondary' | 'warning' | 'success' | 'destructive'> = {
  planned: 'secondary',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'destructive',
}

interface DigitizeRow {
  participant_id: string
  participant_code: string
  check_in_time: string
  blood: boolean
  urine: boolean
  hair: boolean
  cheek: boolean
  stool_kit: boolean
  sst: boolean
  fluoride: boolean
  partner_barcode: string
  notes: string
}

function initRows(participants: FieldEventParticipant[]): DigitizeRow[] {
  return participants.map((p) => {
    const sc = p.samples_collected ?? {}
    return {
      participant_id: p.participant_id,
      participant_code: p.participant_code ?? p.participant_id.slice(0, 8),
      check_in_time: p.check_in_time
        ? new Date(p.check_in_time).toTimeString().slice(0, 5)
        : '',
      blood: sc.blood ?? false,
      urine: p.urine_collected ?? sc.urine ?? false,
      hair: sc.hair ?? false,
      cheek: sc.cheek ?? false,
      stool_kit: p.stool_kit_issued ?? sc.stool_kit ?? false,
      sst: sc.sst ?? false,
      fluoride: sc.fluoride ?? false,
      partner_barcode: (p.partner_samples?.barcode as string) ?? '',
      notes: p.notes ?? '',
    }
  })
}

export function BulkDigitizePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: event, isLoading, isError } = useFieldEvent(id!)
  const bulkDigitize = useBulkDigitize(id!)

  const [rows, setRows] = useState<DigitizeRow[]>([])
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (event?.event_participants) {
      setRows(initRows(event.event_participants))
    }
  }, [event])

  if (isLoading) return <PageSpinner />

  if (isError || !event) {
    return (
      <div className="rounded-lg border border-danger/20 bg-danger/5 p-8 text-center">
        <p className="text-sm text-danger">Failed to load event.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/field-ops/events')}>
          Back to events
        </Button>
      </div>
    )
  }

  const currentStatus = event.status ?? 'planned'

  function updateRow(index: number, field: keyof DigitizeRow, value: boolean | string) {
    setSaved(false)
    setRows((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  async function handleSaveAll() {
    const items = rows.map((r) => ({
      participant_id: r.participant_id,
      check_in_time: r.check_in_time || undefined,
      samples_collected: {
        blood: r.blood,
        urine: r.urine,
        hair: r.hair,
        cheek: r.cheek,
        stool_kit: r.stool_kit,
        sst: r.sst,
        fluoride: r.fluoride,
      },
      partner_samples: r.partner_barcode ? { barcode: r.partner_barcode } : undefined,
      stool_kit_issued: r.stool_kit,
      urine_collected: r.urine,
      notes: r.notes || undefined,
    }))

    try {
      await bulkDigitize.mutateAsync(items)
      setSaved(true)
    } catch {
      // handled by mutation
    }
  }

  const sampleColumns = [
    { key: 'blood' as const, label: 'Blood' },
    { key: 'urine' as const, label: 'Urine' },
    { key: 'hair' as const, label: 'Hair' },
    { key: 'cheek' as const, label: 'Cheek' },
    { key: 'stool_kit' as const, label: 'Stool Kit' },
    { key: 'sst' as const, label: 'SST' },
    { key: 'fluoride' as const, label: 'Fluoride' },
  ]

  return (
    <div>
      {/* Back button */}
      <button
        onClick={() => navigate(`/field-ops/events/${id}`)}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4 cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Event
      </button>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Bulk Digitize</h1>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{event.event_name}</span>
            <Badge variant={STATUS_BADGE_VARIANT[currentStatus]}>
              {FIELD_EVENT_STATUS_LABELS[currentStatus]}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="flex items-center gap-1 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" />
              Saved
            </span>
          )}
          <Button onClick={handleSaveAll} disabled={bulkDigitize.isPending || rows.length === 0}>
            {bulkDigitize.isPending ? (
              <>
                <Spinner size="sm" className="text-primary-foreground" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save All
              </>
            )}
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="text-sm font-medium text-foreground">No participants on the roster</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add participants to the event before digitizing.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-background z-10">Code</TableHead>
                <TableHead>Check-in</TableHead>
                {sampleColumns.map((col) => (
                  <TableHead key={col.key} className="text-center whitespace-nowrap">
                    {col.label}
                  </TableHead>
                ))}
                <TableHead>Partner Barcode</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, idx) => (
                <TableRow key={row.participant_id}>
                  <TableCell className="sticky left-0 bg-background z-10">
                    <span className="font-mono font-medium text-sm">{row.participant_code}</span>
                  </TableCell>
                  <TableCell>
                    <input
                      type="time"
                      value={row.check_in_time}
                      onChange={(e) => updateRow(idx, 'check_in_time', e.target.value)}
                      className="h-8 w-24 rounded border border-input bg-background px-2 text-sm font-mono"
                    />
                  </TableCell>
                  {sampleColumns.map((col) => (
                    <TableCell key={col.key} className="text-center">
                      <input
                        type="checkbox"
                        checked={row[col.key] as boolean}
                        onChange={(e) => updateRow(idx, col.key, e.target.checked)}
                        className="h-4 w-4 rounded border-input cursor-pointer"
                      />
                    </TableCell>
                  ))}
                  <TableCell>
                    <input
                      type="text"
                      value={row.partner_barcode}
                      onChange={(e) => updateRow(idx, 'partner_barcode', e.target.value)}
                      className="h-8 w-32 rounded border border-input bg-background px-2 text-sm font-mono"
                      placeholder="Barcode..."
                    />
                  </TableCell>
                  <TableCell>
                    <input
                      type="text"
                      value={row.notes}
                      onChange={(e) => updateRow(idx, 'notes', e.target.value)}
                      className="h-8 w-36 rounded border border-input bg-background px-2 text-sm"
                      placeholder="Notes..."
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Bottom save button */}
      {rows.length > 0 && (
        <div className="flex justify-end mt-6">
          <Button onClick={handleSaveAll} disabled={bulkDigitize.isPending}>
            {bulkDigitize.isPending ? (
              <>
                <Spinner size="sm" className="text-primary-foreground" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save All
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
