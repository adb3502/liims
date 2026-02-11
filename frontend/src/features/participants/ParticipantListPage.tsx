import { useState, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useParticipants, useCollectionSites } from '@/api/participants'
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
import { AGE_GROUP_LABELS, type AgeGroup } from '@/types'
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Users,
  ArrowUpDown,
} from 'lucide-react'

const PER_PAGE = 25

function useDebounce(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value)
  useMemo(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function ParticipantListPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { hasRole } = useAuth()

  // Parse URL search params
  const page = parseInt(searchParams.get('page') ?? '1', 10)
  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '')
  const debouncedSearch = useDebounce(searchInput, 300)

  const siteFilter = searchParams.get('site') ?? ''
  const ageFilter = searchParams.get('age_group') ?? ''
  const sexFilter = searchParams.get('sex') ?? ''

  // Build query params
  const queryParams = useMemo(
    () => ({
      page,
      per_page: PER_PAGE,
      search: debouncedSearch || undefined,
      collection_site_id: siteFilter || undefined,
      age_group: ageFilter ? (parseInt(ageFilter) as AgeGroup) : undefined,
      sex: sexFilter as 'M' | 'F' | undefined,
      sort: searchParams.get('sort') ?? 'created_at',
      order: (searchParams.get('order') ?? 'desc') as 'asc' | 'desc',
    }),
    [page, debouncedSearch, siteFilter, ageFilter, sexFilter, searchParams]
  )

  const { data, isLoading, isError } = useParticipants(queryParams)
  const { data: sites } = useCollectionSites(true)

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

  const canCreate = hasRole('super_admin', 'lab_manager', 'data_entry', 'field_coordinator')

  const siteLookup = useMemo(() => {
    const map = new Map<string, string>()
    sites?.forEach((s) => map.set(s.id, s.name))
    return map
  }, [sites])

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Participants</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.meta.total != null
              ? `${data.meta.total.toLocaleString()} participant${data.meta.total !== 1 ? 's' : ''}`
              : 'Loading...'}
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => navigate('/participants/create')}>
            <Plus className="h-4 w-4" />
            Add Participant
          </Button>
        )}
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by code, group, or number..."
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value)
              updateParams({ page: '1' })
            }}
            className="pl-9"
          />
        </div>

        {/* Site filter */}
        <select
          value={siteFilter}
          onChange={(e) => updateParams({ site: e.target.value, page: '1' })}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All Sites</option>
          {sites?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        {/* Age group filter */}
        <select
          value={ageFilter}
          onChange={(e) => updateParams({ age_group: e.target.value, page: '1' })}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All Ages</option>
          {([1, 2, 3, 4, 5] as AgeGroup[]).map((ag) => (
            <option key={ag} value={ag}>
              {AGE_GROUP_LABELS[ag]}
            </option>
          ))}
        </select>

        {/* Sex filter */}
        <select
          value={sexFilter}
          onChange={(e) => updateParams({ sex: e.target.value, page: '1' })}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All Sex</option>
          <option value="M">Male</option>
          <option value="F">Female</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <PageSpinner />
      ) : isError ? (
        <div className="rounded-lg border border-danger/20 bg-danger/5 p-8 text-center">
          <p className="text-sm text-danger">
            Failed to load participants. Please try again.
          </p>
        </div>
      ) : data?.data.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Users className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-foreground">No participants found</p>
          <p className="text-xs text-muted-foreground mt-1">
            {debouncedSearch
              ? 'Try adjusting your search or filters.'
              : 'No participants have been enrolled yet.'}
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
                      onClick={() => handleSort('participant_code')}
                      className="flex items-center gap-1 cursor-pointer hover:text-foreground"
                    >
                      Code <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>Age Group</TableHead>
                  <TableHead>Sex</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>
                    <button
                      onClick={() => handleSort('enrollment_date')}
                      className="flex items-center gap-1 cursor-pointer hover:text-foreground"
                    >
                      Enrolled <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>
                    <button
                      onClick={() => handleSort('completion_pct')}
                      className="flex items-center gap-1 cursor-pointer hover:text-foreground"
                    >
                      Completion <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.data.map((p) => {
                  const pct = Number(p.completion_pct) || 0
                  return (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/participants/${p.id}`)}
                    >
                      <TableCell>
                        <span className="font-mono font-medium text-primary">
                          {p.participant_code}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {AGE_GROUP_LABELS[p.age_group as AgeGroup] ?? p.age_group}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.sex === 'M' ? 'outline' : 'secondary'}>
                          {p.sex === 'M' ? 'Male' : 'Female'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {siteLookup.get(p.collection_site_id) ?? '---'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(p.enrollment_date).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground capitalize">
                          {p.enrollment_source.replace('_', ' ')}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-16 rounded-full bg-muted overflow-hidden">
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
                          <span className="text-xs text-muted-foreground w-8">
                            {pct}%
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
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
