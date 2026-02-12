import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useStorageSearch, type StorageSearchResult } from '@/api/storage'
import { Badge } from '@/components/ui/badge'
import { PageSpinner, Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import {
  Search,
  MapPin,
  Snowflake,
  Layers,
  Grid3X3,
  ExternalLink,
} from 'lucide-react'

function useDebounce(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function StorageSearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialQuery = searchParams.get('q') ?? ''
  const [searchInput, setSearchInput] = useState(initialQuery)
  const debouncedQuery = useDebounce(searchInput, 400)

  const { data: results, isLoading, isFetching } = useStorageSearch(debouncedQuery)

  function handleInputChange(value: string) {
    setSearchInput(value)
    const newParams = new URLSearchParams(searchParams)
    if (value) newParams.set('q', value)
    else newParams.delete('q')
    setSearchParams(newParams, { replace: true })
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Storage Search</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Find where a sample is stored by its sample code.
        </p>
      </div>

      {/* Search input */}
      <div className="relative max-w-xl mb-8">
        <Search className="absolute left-4 top-3.5 h-5 w-5 text-muted-foreground" />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder="Enter sample code (e.g. DEL01-PLM-001-01)..."
          className={cn(
            'flex h-12 w-full rounded-xl border-2 border-border bg-background pl-12 pr-12 text-sm',
            'ring-offset-background placeholder:text-muted-foreground',
            'focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/20',
            'font-mono transition-all',
          )}
          autoFocus
        />
        {isFetching && (
          <div className="absolute right-4 top-3.5">
            <Spinner size="sm" />
          </div>
        )}
      </div>

      {/* Results */}
      {!debouncedQuery ? (
        <div className="rounded-lg border border-dashed border-border p-16 text-center">
          <Search className="mx-auto h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            Start typing a sample code to search
          </p>
        </div>
      ) : isLoading ? (
        <PageSpinner />
      ) : !results || results.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <MapPin className="mx-auto h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-foreground">No results found</p>
          <p className="text-xs text-muted-foreground mt-1">
            No samples matching &ldquo;<span className="font-mono">{debouncedQuery}</span>&rdquo; are currently stored.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground mb-4">
            Found {results.length} result{results.length !== 1 ? 's' : ''}
          </p>

          {results.map((result) => (
            <StorageResultCard key={result.position_id} result={result} />
          ))}
        </div>
      )}
    </div>
  )
}

function StorageResultCard({ result }: { result: StorageSearchResult }) {
  const navigate = useNavigate()
  const posLabel = `${String.fromCharCode(65 + result.column - 1)}${result.row}`

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden hover:border-primary/30 transition-colors">
      <div className="p-4 sm:p-5">
        {/* Sample code */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="font-mono font-bold text-foreground text-base">
            {result.sample_code}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigate(`/samples/${result.sample_id}`)}
              className="flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer"
            >
              <ExternalLink className="h-3 w-3" />
              Sample
            </button>
            <button
              onClick={() => navigate(`/storage/boxes/${result.box_id}`)}
              className="flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer"
            >
              <ExternalLink className="h-3 w-3" />
              Box
            </button>
          </div>
        </div>

        {/* Location breadcrumb */}
        <div className="flex items-center gap-0 flex-wrap text-sm">
          <LocationStep
            icon={<Snowflake className="h-3.5 w-3.5" />}
            label={result.freezer_name}
            onClick={() => navigate(`/storage/freezers/${result.freezer_id}`)}
          />
          <ChevronSep />
          <LocationStep
            icon={<Layers className="h-3.5 w-3.5" />}
            label={result.rack_name}
          />
          <ChevronSep />
          <LocationStep
            icon={<Grid3X3 className="h-3.5 w-3.5" />}
            label={result.box_name}
            onClick={() => navigate(`/storage/boxes/${result.box_id}`)}
          />
          <ChevronSep />
          <Badge variant="secondary" className="font-mono text-xs font-bold">
            {posLabel}
          </Badge>
        </div>
      </div>
    </div>
  )
}

function LocationStep({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick?: () => void
}) {
  const Wrapper = onClick ? 'button' : 'span'
  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded-md text-sm',
        onClick && 'hover:bg-accent hover:text-primary cursor-pointer transition-colors',
        !onClick && 'text-muted-foreground',
      )}
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="font-medium">{label}</span>
    </Wrapper>
  )
}

function ChevronSep() {
  return (
    <span className="text-muted-foreground/40 mx-0.5 text-xs select-none">/</span>
  )
}
