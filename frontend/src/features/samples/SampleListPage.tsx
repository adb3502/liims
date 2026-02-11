import { useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSamples } from '@/api/samples'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
import type { SampleStatus, SampleType } from '@/types'
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  ArrowUpDown,
  AlertTriangle,
} from 'lucide-react'

const PER_PAGE = 25

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

const ALL_SAMPLE_TYPES: SampleType[] = [
  'plasma', 'epigenetics', 'extra_blood', 'rbc_smear',
  'cheek_swab', 'hair', 'urine', 'stool_kit',
]

const ALL_STATUSES: SampleStatus[] = [
  'registered', 'collected', 'transported', 'received',
  'processing', 'stored', 'reserved', 'in_analysis',
  'pending_discard', 'depleted', 'discarded',
]

function useDebounce(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function SampleListPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { hasRole } = useAuth()

  const page = parseInt(searchParams.get('page') ?? '1', 10)
  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '')
  const debouncedSearch = useDebounce(searchInput, 300)

  const typeFilter = searchParams.get('sample_type') ?? ''
  const statusFilter = searchParams.get('status') ?? ''
  const participantFilter = searchParams.get('participant_id') ?? ''

  const queryParams = useMemo(
    () => ({
      page,
      per_page: PER_PAGE,
      search: debouncedSearch || undefined,
      sample_type: (typeFilter || undefined) as SampleType | undefined,
      sample_status: (statusFilter || undefined) as SampleStatus | undefined,
      participant_id: participantFilter || undefined,
      sort: searchParams.get('sort') ?? 'created_at',
      order: (searchParams.get('order') ?? 'desc') as 'asc' | 'desc',
    }),
    [page, debouncedSearch, typeFilter, statusFilter, participantFilter, searchParams]
  )

  const { data, isLoading, isError } = useSamples(queryParams)

  const totalPages = data?.meta
    ? Math.ceil(data.meta.total / data.meta.per_page)
    : 0

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const newParams = new URLSearchParams(searchParams)
      Object.entries(updates).forEach(([k, v]) => {
        if (v) newParams.set(k, v)
        else newParams.delete(k)
      })
      setSearchParams(newParams)
    },
    [searchParams, setSearchParams]
  )

  function handleSort(field: string) {
    const currentSort = searchParams.get('sort')
    const currentOrder = searchParams.get('order') ?? 'desc'
    if (currentSort === field) {
      updateParams({ order: currentOrder === 'asc' ? 'desc' : 'asc' })
    } else {
      updateParams({ sort: field, order: 'asc' })
    }
  }

  const canRegister = hasRole('super_admin', 'lab_manager', 'lab_technician', 'field_coordinator')

  function formatVolume(remaining: number | null, initial: number | null): string {
    if (remaining == null && initial == null) return '---'
    const r = remaining != null ? Number(remaining) : 0
    const i = initial != null ? Number(initial) : 0
    return `${r.toLocaleString()} / ${i.toLocaleString()} uL`
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Samples</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.meta.total != null
              ? `${data.meta.total.toLocaleString()} sample${data.meta.total !== 1 ? 's' : ''}`
              : 'Loading...'}
          </p>
        </div>
        {canRegister && (
          <Button onClick={() => navigate('/samples/register')}>
            <Plus className="h-4 w-4" />
            Register Sample
          </Button>
        )}
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by sample code..."
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value)
              updateParams({ page: '1' })
            }}
            className="pl-9 font-mono"
          />
        </div>

        {/* Sample type filter */}
        <select
          value={typeFilter}
          onChange={(e) => updateParams({ sample_type: e.target.value, page: '1' })}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All Types</option>
          {ALL_SAMPLE_TYPES.map((t) => (
            <option key={t} value={t}>
              {SAMPLE_TYPE_LABELS[t]}
            </option>
          ))}
        </select>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => updateParams({ status: e.target.value, page: '1' })}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All Statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {SAMPLE_STATUS_LABELS[s]}
            </option>
          ))}
        </select>

        {/* Participant ID filter */}
        <Input
          placeholder="Participant ID..."
          value={participantFilter}
          onChange={(e) => updateParams({ participant_id: e.target.value, page: '1' })}
          className="max-w-[200px] font-mono text-sm"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <PageSpinner />
      ) : isError ? (
        <div className="rounded-lg border border-danger/20 bg-danger/5 p-8 text-center">
          <p className="text-sm text-danger">
            Failed to load samples. Please try again.
          </p>
        </div>
      ) : data?.data.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <FlaskConical className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-foreground">No samples found</p>
          <p className="text-xs text-muted-foreground mt-1">
            {debouncedSearch || typeFilter || statusFilter
              ? 'Try adjusting your search or filters.'
              : 'No samples have been registered yet.'}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <button
                      onClick={() => handleSort('sample_code')}
                      className="flex items-center gap-1 cursor-pointer hover:text-foreground"
                    >
                      Sample Code <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Participant</TableHead>
                  <TableHead>Volume</TableHead>
                  <TableHead>
                    <button
                      onClick={() => handleSort('collection_datetime')}
                      className="flex items-center gap-1 cursor-pointer hover:text-foreground"
                    >
                      Collection Date <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>Wave</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.data.map((s) => (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/samples/${s.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium text-primary">
                          {s.sample_code}
                        </span>
                        {s.has_deviation && (
                          <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {SAMPLE_TYPE_LABELS[s.sample_type] ?? s.sample_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE_VARIANT[s.status] ?? 'default'}>
                        {SAMPLE_STATUS_LABELS[s.status] ?? s.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm text-muted-foreground">
                        {s.participant?.participant_code ?? s.participant_id.slice(0, 8)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatVolume(s.remaining_volume_ul, s.initial_volume_ul)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.collection_datetime
                        ? new Date(s.collection_datetime).toLocaleDateString()
                        : '---'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">W{s.wave}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => updateParams({ page: String(page - 1) })}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => updateParams({ page: String(page + 1) })}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
