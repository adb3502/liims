import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  useFreezer,
  useRacks,
  useBoxes,
  useCreateRack,
  useBatchCreateRacks,
  useCreateBox,
  useTempEvents,
  type RackRead,
  type BoxRead,
  type TempEventRead,
} from '@/api/storage'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { PageSpinner } from '@/components/ui/spinner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type { FreezerType, BoxType } from '@/types'
import {
  ArrowLeft,
  Plus,
  Snowflake,
  MapPin,
  Box,
  Layers,
  Thermometer,
  AlertTriangle,
  CheckCircle,
  Clock,
} from 'lucide-react'

const FREEZER_TYPE_LABELS: Record<FreezerType, string> = {
  minus_150: '-150\u00B0C',
  minus_80: '-80\u00B0C',
  plus_4: '+4\u00B0C',
  room_temp: 'Room Temp',
}

const BOX_TYPE_LABELS: Record<string, string> = {
  cryo_81: 'Cryo 81',
  cryo_100: 'Cryo 100',
  abdos_81: 'Abdos 81',
  custom: 'Custom',
}

const EVENT_TYPE_CONFIG: Record<string, { label: string; color: string; icon: typeof AlertTriangle }> = {
  excursion: { label: 'Temperature Excursion', color: 'text-amber-600', icon: AlertTriangle },
  failure: { label: 'Freezer Failure', color: 'text-red-600', icon: AlertTriangle },
  maintenance: { label: 'Maintenance', color: 'text-blue-600', icon: Clock },
  recovery: { label: 'Recovery', color: 'text-emerald-600', icon: CheckCircle },
}

function getUtilizationColor(pct: number): string {
  if (pct > 90) return 'text-red-600'
  if (pct > 70) return 'text-amber-600'
  return 'text-emerald-600'
}

function getUtilizationBarColor(pct: number): string {
  if (pct > 90) return 'bg-red-500'
  if (pct > 70) return 'bg-amber-500'
  return 'bg-emerald-500'
}

export function FreezerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { hasRole } = useAuth()
  const [activeTab, setActiveTab] = useState('overview')
  const [showAddRack, setShowAddRack] = useState(false)
  const [showBatchRacks, setShowBatchRacks] = useState(false)
  const [showAddBox, setShowAddBox] = useState(false)
  const [selectedRackId, setSelectedRackId] = useState<string | null>(null)

  const { data: freezer, isLoading, isError } = useFreezer(id!)
  const { data: racks } = useRacks(id!)
  const { data: boxes } = useBoxes({ rack_id: undefined, per_page: 100 })
  const { data: tempData } = useTempEvents(id!, { per_page: 20 })

  const canWrite = hasRole('super_admin', 'lab_manager', 'lab_technician')

  if (isLoading) return <PageSpinner />

  if (isError || !freezer) {
    return (
      <div className="rounded-lg border border-danger/20 bg-danger/5 p-8 text-center">
        <p className="text-sm text-danger">Failed to load freezer details.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/storage/freezers')}>
          Back to Freezers
        </Button>
      </div>
    )
  }

  const pct = Math.round(freezer.utilization_pct)
  const available = freezer.total_positions - freezer.used_positions

  // Group boxes by rack
  const rackBoxMap: Record<string, BoxRead[]> = {}
  if (racks && boxes?.data) {
    for (const rack of racks) {
      rackBoxMap[rack.id] = boxes.data.filter((b) => b.rack_id === rack.id)
    }
  }

  return (
    <div>
      {/* Back nav */}
      <button
        onClick={() => navigate('/storage/freezers')}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Freezers
      </button>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
        <div className="flex items-start gap-4">
          <div className={cn(
            'rounded-xl p-3',
            freezer.freezer_type === 'minus_150' && 'bg-blue-50',
            freezer.freezer_type === 'minus_80' && 'bg-cyan-50',
            freezer.freezer_type === 'plus_4' && 'bg-amber-50',
            freezer.freezer_type === 'room_temp' && 'bg-stone-50',
          )}>
            <Snowflake className={cn(
              'h-7 w-7',
              freezer.freezer_type === 'minus_150' && 'text-blue-500',
              freezer.freezer_type === 'minus_80' && 'text-cyan-500',
              freezer.freezer_type === 'plus_4' && 'text-amber-500',
              freezer.freezer_type === 'room_temp' && 'text-stone-400',
            )} />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{freezer.name}</h1>
              <Badge className={cn(
                'text-[10px] font-bold uppercase tracking-wider',
                freezer.freezer_type === 'minus_150' && 'bg-blue-50 text-blue-700 border-blue-200',
                freezer.freezer_type === 'minus_80' && 'bg-cyan-50 text-cyan-700 border-cyan-200',
                freezer.freezer_type === 'plus_4' && 'bg-amber-50 text-amber-700 border-amber-200',
                freezer.freezer_type === 'room_temp' && 'bg-stone-50 text-stone-600 border-stone-200',
              )}>
                {FREEZER_TYPE_LABELS[freezer.freezer_type]}
              </Badge>
              {!freezer.is_active && (
                <Badge variant="secondary">Inactive</Badge>
              )}
            </div>
            {freezer.location && (
              <div className="flex items-center gap-1.5 mt-1">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{freezer.location}</span>
              </div>
            )}
          </div>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowBatchRacks(true)}>
              <Layers className="h-4 w-4" />
              Batch Add Racks
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowAddRack(true)}>
              <Plus className="h-4 w-4" />
              Add Rack
            </Button>
          </div>
        )}
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Positions"
          value={freezer.total_positions.toLocaleString()}
          icon={<Box className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          label="Occupied"
          value={freezer.used_positions.toLocaleString()}
          icon={<Box className="h-4 w-4 text-primary" />}
        />
        <StatCard
          label="Available"
          value={available.toLocaleString()}
          icon={<Box className="h-4 w-4 text-emerald-500" />}
        />
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground font-medium">Utilization</span>
            <span className={cn('text-2xl font-bold tabular-nums', getUtilizationColor(pct))}>
              {pct}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', getUtilizationBarColor(pct))}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Racks & Boxes</TabsTrigger>
          <TabsTrigger value="temperature">Temperature Events</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <RacksAndBoxesView
            racks={racks ?? []}
            rackBoxMap={rackBoxMap}
            canWrite={canWrite}
            onAddBox={(rackId) => {
              setSelectedRackId(rackId)
              setShowAddBox(true)
            }}
          />
        </TabsContent>

        <TabsContent value="temperature">
          <TemperatureEventsView events={tempData?.data ?? []} />
        </TabsContent>
      </Tabs>

      {/* Add Rack Dialog */}
      {showAddRack && (
        <AddRackDialog
          freezerId={id!}
          open={showAddRack}
          onClose={() => setShowAddRack(false)}
        />
      )}

      {/* Batch Create Racks Dialog */}
      {showBatchRacks && (
        <BatchRacksDialog
          freezerId={id!}
          open={showBatchRacks}
          onClose={() => setShowBatchRacks(false)}
        />
      )}

      {/* Add Box Dialog */}
      {showAddBox && selectedRackId && (
        <AddBoxDialog
          rackId={selectedRackId}
          open={showAddBox}
          onClose={() => {
            setShowAddBox(false)
            setSelectedRackId(null)
          }}
        />
      )}
    </div>
  )
}

// --- Stat Card ---

function StatCard({
  label,
  value,
  icon,
}: {
  label: string
  value: string
  icon: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>
      <span className="text-2xl font-bold text-foreground tabular-nums">{value}</span>
    </div>
  )
}

// --- Racks & Boxes View ---

function RacksAndBoxesView({
  racks,
  rackBoxMap,
  canWrite,
  onAddBox,
}: {
  racks: RackRead[]
  rackBoxMap: Record<string, BoxRead[]>
  canWrite: boolean
  onAddBox: (rackId: string) => void
}) {
  const navigate = useNavigate()

  if (racks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-12 text-center mt-4">
        <Layers className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
        <p className="text-sm font-medium text-foreground">No racks yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Add racks to organize storage boxes in this freezer.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4 mt-4">
      {racks.map((rack) => {
        const rackBoxes = rackBoxMap[rack.id] ?? []
        const totalOccupied = rackBoxes.reduce((s, b) => s + b.occupied_count, 0)
        const totalSlots = rackBoxes.reduce((s, b) => s + b.total_slots, 0)

        return (
          <div key={rack.id} className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between p-4 border-b border-border/60">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-muted p-1.5">
                  <Layers className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{rack.rack_name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {rackBoxes.length} box{rackBoxes.length !== 1 ? 'es' : ''}
                    {totalSlots > 0 && (
                      <span> &middot; {totalOccupied}/{totalSlots} positions</span>
                    )}
                  </p>
                </div>
              </div>
              {canWrite && (
                <Button variant="ghost" size="sm" onClick={() => onAddBox(rack.id)}>
                  <Plus className="h-3.5 w-3.5" />
                  Add Box
                </Button>
              )}
            </div>

            {rackBoxes.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
                {rackBoxes.map((box) => {
                  const boxPct = box.total_slots > 0
                    ? Math.round((box.occupied_count / box.total_slots) * 100)
                    : 0

                  return (
                    <button
                      key={box.id}
                      onClick={() => navigate(`/storage/boxes/${box.id}`)}
                      className="text-left rounded-lg border border-border/60 p-3 hover:border-primary/30 hover:bg-accent/30 transition-all cursor-pointer"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-foreground truncate">
                          {box.box_name}
                        </span>
                        <Badge variant="secondary" className="text-[10px] flex-shrink-0">
                          {BOX_TYPE_LABELS[box.box_type] ?? box.box_type}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                        <span>{box.rows}x{box.columns} grid</span>
                        <span className="font-medium tabular-nums">
                          {box.occupied_count}/{box.total_slots}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn('h-full rounded-full', getUtilizationBarColor(boxPct))}
                          style={{ width: `${Math.min(boxPct, 100)}%` }}
                        />
                      </div>
                      {box.group_code && (
                        <span className="inline-block mt-2 text-[10px] font-mono font-medium text-primary bg-primary/5 px-1.5 py-0.5 rounded">
                          {box.group_code}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-muted-foreground">
                No boxes in this rack yet.
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// --- Temperature Events View ---

function TemperatureEventsView({ events }: { events: TempEventRead[] }) {
  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-12 text-center mt-4">
        <Thermometer className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
        <p className="text-sm font-medium text-foreground">No temperature events</p>
        <p className="text-xs text-muted-foreground mt-1">
          Temperature excursions and maintenance events will appear here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3 mt-4">
      {events.map((event) => {
        const config = EVENT_TYPE_CONFIG[event.event_type] ?? {
          label: event.event_type,
          color: 'text-muted-foreground',
          icon: Clock,
        }
        const Icon = config.icon

        return (
          <div key={event.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start gap-3">
              <div className={cn('mt-0.5', config.color)}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn('text-sm font-semibold', config.color)}>
                    {config.label}
                  </span>
                  {event.requires_sample_review && (
                    <Badge variant="warning" className="text-[10px]">Review Required</Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    Started: {new Date(event.event_start).toLocaleString()}
                  </span>
                  {event.event_end && (
                    <span>
                      Ended: {new Date(event.event_end).toLocaleString()}
                    </span>
                  )}
                  {event.observed_temp_c != null && (
                    <span className="font-medium">
                      Observed: {event.observed_temp_c}\u00B0C
                    </span>
                  )}
                  {event.samples_affected_count != null && (
                    <span>
                      {event.samples_affected_count} sample{event.samples_affected_count !== 1 ? 's' : ''} affected
                    </span>
                  )}
                </div>
                {event.resolution_notes && (
                  <p className="text-xs text-foreground mt-2 bg-muted/50 rounded p-2">
                    {event.resolution_notes}
                  </p>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// --- Add Rack Dialog ---

function AddRackDialog({
  freezerId,
  open,
  onClose,
}: {
  freezerId: string
  open: boolean
  onClose: () => void
}) {
  const createRack = useCreateRack(freezerId)
  const [name, setName] = useState('')
  const [position, setPosition] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await createRack.mutateAsync({
      rack_name: name.trim(),
      position_in_freezer: position ? parseInt(position, 10) : undefined,
    })
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent onClose={onClose} className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Rack</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="rack-name">Rack Name</Label>
            <Input
              id="rack-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. R-01"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rack-pos">Position in Freezer</Label>
            <Input
              id="rack-pos"
              type="number"
              min={1}
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={createRack.isPending || !name.trim()}>
              {createRack.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// --- Batch Racks Dialog ---

function BatchRacksDialog({
  freezerId,
  open,
  onClose,
}: {
  freezerId: string
  open: boolean
  onClose: () => void
}) {
  const batchCreate = useBatchCreateRacks(freezerId)
  const [count, setCount] = useState('5')
  const [prefix, setPrefix] = useState('R')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const num = parseInt(count, 10)
    if (!num || num < 1) return
    await batchCreate.mutateAsync({
      count: num,
      label_prefix: prefix.trim() || 'R',
    })
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent onClose={onClose} className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Batch Create Racks</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="rack-count">Number of Racks</Label>
            <Input
              id="rack-count"
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rack-prefix">Label Prefix</Label>
            <Input
              id="rack-prefix"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder="R"
            />
            <p className="text-xs text-muted-foreground">
              Racks will be named {prefix || 'R'}-01, {prefix || 'R'}-02, etc.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={batchCreate.isPending}>
              {batchCreate.isPending ? 'Creating...' : `Create ${count} Racks`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// --- Add Box Dialog ---

const ALL_BOX_TYPES: { value: BoxType; label: string }[] = [
  { value: 'cryo_81', label: 'Cryo 81 (9x9)' },
  { value: 'cryo_100', label: 'Cryo 100 (10x10)' },
  { value: 'abdos_81', label: 'Abdos 81 (9x9)' },
  { value: 'custom', label: 'Custom' },
]

function AddBoxDialog({
  rackId,
  open,
  onClose,
}: {
  rackId: string
  open: boolean
  onClose: () => void
}) {
  const createBox = useCreateBox()
  const [name, setName] = useState('')
  const [boxType, setBoxType] = useState<BoxType>('cryo_81')
  const [groupCode, setGroupCode] = useState('')
  const [rows, setRows] = useState('9')
  const [cols, setCols] = useState('9')

  function handleTypeChange(type: BoxType) {
    setBoxType(type)
    if (type === 'cryo_81' || type === 'abdos_81') {
      setRows('9')
      setCols('9')
    } else if (type === 'cryo_100') {
      setRows('10')
      setCols('10')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await createBox.mutateAsync({
      rack_id: rackId,
      box_name: name.trim(),
      box_type: boxType,
      rows: parseInt(rows, 10) || 9,
      columns: parseInt(cols, 10) || 9,
      group_code: groupCode.trim() || undefined,
    })
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent onClose={onClose} className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Storage Box</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="box-name">Box Name</Label>
            <Input
              id="box-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. BOX-PLM-001"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="box-type">Box Type</Label>
            <select
              id="box-type"
              value={boxType}
              onChange={(e) => handleTypeChange(e.target.value as BoxType)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {ALL_BOX_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          {boxType === 'custom' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="box-rows">Rows</Label>
                <Input
                  id="box-rows"
                  type="number"
                  min={1}
                  max={20}
                  value={rows}
                  onChange={(e) => setRows(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="box-cols">Columns</Label>
                <Input
                  id="box-cols"
                  type="number"
                  min={1}
                  max={20}
                  value={cols}
                  onChange={(e) => setCols(e.target.value)}
                />
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="box-group">Group Code</Label>
            <Input
              id="box-group"
              value={groupCode}
              onChange={(e) => setGroupCode(e.target.value)}
              placeholder="e.g. DEL01"
              maxLength={5}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Collection site code for grouping boxes.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={createBox.isPending || !name.trim()}>
              {createBox.isPending ? 'Creating...' : 'Create Box'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
