import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useInstruments, useCreateInstrument } from '@/api/instruments'
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
import { cn } from '@/lib/utils'
import type { InstrumentType, Instrument } from '@/types'
import { INSTRUMENT_TYPE_LABELS } from '@/types'
import {
  Plus,
  Search,
  Cpu,
  MapPin,
  Pipette,
  Microscope,
  Settings2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

const PER_PAGE = 24

const ALL_INSTRUMENT_TYPES: InstrumentType[] = ['liquid_handler', 'mass_spec', 'other']

const TYPE_VISUAL: Record<InstrumentType, { icon: typeof Cpu; gradient: string; iconColor: string; badgeBg: string; badgeText: string; badgeBorder: string }> = {
  liquid_handler: {
    icon: Pipette,
    gradient: 'from-sky-500 to-cyan-400',
    iconColor: 'text-sky-500',
    badgeBg: 'bg-sky-50',
    badgeText: 'text-sky-700',
    badgeBorder: 'border-sky-200',
  },
  mass_spec: {
    icon: Microscope,
    gradient: 'from-violet-500 to-purple-400',
    iconColor: 'text-violet-500',
    badgeBg: 'bg-violet-50',
    badgeText: 'text-violet-700',
    badgeBorder: 'border-violet-200',
  },
  other: {
    icon: Settings2,
    gradient: 'from-slate-500 to-slate-400',
    iconColor: 'text-slate-500',
    badgeBg: 'bg-slate-50',
    badgeText: 'text-slate-600',
    badgeBorder: 'border-slate-200',
  },
}

function InstrumentCard({ instrument, onClick }: { instrument: Instrument; onClick: () => void }) {
  const visual = TYPE_VISUAL[instrument.instrument_type] ?? TYPE_VISUAL.other
  const Icon = visual.icon

  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative w-full text-left rounded-xl border bg-card p-0 overflow-hidden',
        'shadow-sm hover:shadow-md transition-all duration-200',
        'hover:border-primary/30 cursor-pointer',
        !instrument.is_active && 'opacity-55',
      )}
    >
      {/* Top accent stripe */}
      <div className={cn('h-1.5 w-full bg-gradient-to-r', visual.gradient)} />

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn('flex-shrink-0 rounded-lg p-2', visual.badgeBg)}>
              <Icon className={cn('h-5 w-5', visual.iconColor)} />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                {instrument.name}
              </h3>
              {instrument.location && (
                <div className="flex items-center gap-1 mt-0.5">
                  <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs text-muted-foreground truncate">
                    {instrument.location}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <Badge
              className={cn(
                'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border',
                visual.badgeBg,
                visual.badgeText,
                visual.badgeBorder,
              )}
            >
              {INSTRUMENT_TYPE_LABELS[instrument.instrument_type]}
            </Badge>
            {!instrument.is_active && (
              <Badge variant="secondary" className="text-[10px]">Inactive</Badge>
            )}
          </div>
        </div>

        {/* Details */}
        <div className="space-y-1.5 pt-3 border-t border-border/60">
          {instrument.manufacturer && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Manufacturer</span>
              <span className="font-medium text-foreground truncate ml-2 max-w-[60%] text-right">
                {instrument.manufacturer}
              </span>
            </div>
          )}
          {instrument.model && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Model</span>
              <span className="font-mono font-medium text-foreground truncate ml-2 max-w-[60%] text-right">
                {instrument.model}
              </span>
            </div>
          )}
          {instrument.software && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Software</span>
              <span className="text-foreground truncate ml-2 max-w-[60%] text-right">
                {instrument.software}
              </span>
            </div>
          )}
          {!instrument.manufacturer && !instrument.model && !instrument.software && (
            <div className="text-xs text-muted-foreground italic">No details recorded</div>
          )}
        </div>
      </div>
    </button>
  )
}

export function InstrumentDashboardPage() {
  const navigate = useNavigate()
  const { hasRole } = useAuth()
  const [searchInput, setSearchInput] = useState('')
  const [typeFilter, setTypeFilter] = useState<InstrumentType | ''>('')
  const [activeFilter, setActiveFilter] = useState<'' | 'true' | 'false'>('')
  const [page, setPage] = useState(1)
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  const queryParams = useMemo(() => ({
    page,
    per_page: PER_PAGE,
    instrument_type: typeFilter || undefined,
    is_active: activeFilter === '' ? undefined : activeFilter === 'true',
  }), [page, typeFilter, activeFilter])

  const { data, isLoading, isError } = useInstruments(queryParams)

  const totalPages = data?.meta
    ? Math.ceil(data.meta.total / data.meta.per_page)
    : 0

  const canCreate = hasRole('super_admin', 'lab_manager')

  // Client-side search filter on name
  const instruments = useMemo(() => {
    const items = data?.data ?? []
    if (!searchInput.trim()) return items
    const q = searchInput.toLowerCase()
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.manufacturer?.toLowerCase().includes(q) ||
        i.model?.toLowerCase().includes(q)
    )
  }, [data?.data, searchInput])

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Instruments</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.meta.total != null
              ? `${data.meta.total} instrument${data.meta.total !== 1 ? 's' : ''} registered`
              : 'Loading...'}
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4" />
            Register Instrument
          </Button>
        )}
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, manufacturer, model..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>

        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value as InstrumentType | '')
            setPage(1)
          }}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All Types</option>
          {ALL_INSTRUMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {INSTRUMENT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>

        <select
          value={activeFilter}
          onChange={(e) => {
            setActiveFilter(e.target.value as '' | 'true' | 'false')
            setPage(1)
          }}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      {/* Content */}
      {isLoading ? (
        <PageSpinner />
      ) : isError ? (
        <div className="rounded-lg border border-danger/20 bg-danger/5 p-8 text-center">
          <p className="text-sm text-danger">Failed to load instruments. Please try again.</p>
        </div>
      ) : instruments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Cpu className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-foreground">No instruments found</p>
          <p className="text-xs text-muted-foreground mt-1">
            {searchInput || typeFilter || activeFilter
              ? 'Try adjusting your search or filters.'
              : 'No instruments have been registered yet.'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {instruments.map((instrument) => (
              <InstrumentCard
                key={instrument.id}
                instrument={instrument}
                onClick={() => navigate(`/instruments/runs?instrument_id=${instrument.id}`)}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create Instrument Dialog */}
      {showCreateDialog && (
        <CreateInstrumentDialog
          open={showCreateDialog}
          onClose={() => setShowCreateDialog(false)}
        />
      )}
    </div>
  )
}

// --- Create Instrument Dialog ---

function CreateInstrumentDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const createInstrument = useCreateInstrument()
  const [name, setName] = useState('')
  const [instrumentType, setInstrumentType] = useState<InstrumentType>('liquid_handler')
  const [manufacturer, setManufacturer] = useState('')
  const [model, setModel] = useState('')
  const [software, setSoftware] = useState('')
  const [location, setLocation] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    await createInstrument.mutateAsync({
      name: name.trim(),
      instrument_type: instrumentType,
      manufacturer: manufacturer.trim() || undefined,
      model: model.trim() || undefined,
      software: software.trim() || undefined,
      location: location.trim() || undefined,
    })
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent onClose={onClose} className="max-w-md">
        <DialogHeader>
          <DialogTitle>Register Instrument</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="inst-name">Instrument Name</Label>
            <Input
              id="inst-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Hamilton STAR"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inst-type">Type</Label>
            <select
              id="inst-type"
              value={instrumentType}
              onChange={(e) => setInstrumentType(e.target.value as InstrumentType)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {ALL_INSTRUMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {INSTRUMENT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="inst-manufacturer">Manufacturer</Label>
              <Input
                id="inst-manufacturer"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                placeholder="e.g. Hamilton"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inst-model">Model</Label>
              <Input
                id="inst-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g. STAR"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inst-software">Software</Label>
            <Input
              id="inst-software"
              value={software}
              onChange={(e) => setSoftware(e.target.value)}
              placeholder="e.g. Venus v4.6"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inst-location">Location</Label>
            <Input
              id="inst-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Lab Room 302"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createInstrument.isPending || !name.trim()}>
              {createInstrument.isPending ? 'Creating...' : 'Register'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
