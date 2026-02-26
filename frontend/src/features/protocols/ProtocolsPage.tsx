import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { PageSpinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import {
  FileText,
  Search,
  Download,
  FlaskConical,
  Microscope,
  MapPin,
  Users,
} from 'lucide-react'

// --- Types ---

type ProtocolCategory =
  | 'Sample Collection'
  | 'Lab Processing'
  | 'Field Operations'
  | 'Coordination'

interface Protocol {
  filename: string
  title: string
  category: ProtocolCategory
  description: string
}

// --- Category config ---

const CATEGORY_ICONS: Record<ProtocolCategory, React.ElementType> = {
  'Sample Collection': FlaskConical,
  'Lab Processing': Microscope,
  'Field Operations': MapPin,
  Coordination: Users,
}

const CATEGORY_ICON_COLORS: Record<ProtocolCategory, string> = {
  'Sample Collection': 'bg-blue-50 text-blue-700 border-blue-100',
  'Lab Processing': 'bg-purple-50 text-purple-700 border-purple-100',
  'Field Operations': 'bg-emerald-50 text-emerald-700 border-emerald-100',
  Coordination: 'bg-amber-50 text-amber-700 border-amber-100',
}

const CATEGORY_BADGE_STYLE: Record<ProtocolCategory, string> = {
  'Sample Collection': 'bg-blue-100 text-blue-700',
  'Lab Processing': 'bg-purple-100 text-purple-700',
  'Field Operations': 'bg-emerald-100 text-emerald-700',
  Coordination: 'bg-amber-100 text-amber-700',
}

const ALL_CATEGORIES: ProtocolCategory[] = [
  'Sample Collection',
  'Lab Processing',
  'Field Operations',
  'Coordination',
]

// --- API hook ---

interface ProtocolListItem {
  filename: string
  title: string
  category: string
  description: string
}

function useProtocols() {
  return useQuery<Protocol[]>({
    queryKey: ['protocols'],
    queryFn: async () => {
      const res = await api.get<{ data: ProtocolListItem[] }>('/protocols')
      return res.data.data as Protocol[]
    },
    retry: false,
  })
}

// --- Download helper ---

function downloadProtocol(filename: string) {
  const baseUrl = String(api.defaults.baseURL ?? '')
  const url = `${baseUrl}/protocols/${encodeURIComponent(filename)}`
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

// --- Protocol Card ---

function ProtocolCard({ protocol }: { protocol: Protocol }) {
  const Icon = CATEGORY_ICONS[protocol.category] ?? FileText
  const iconColor =
    CATEGORY_ICON_COLORS[protocol.category] ?? 'bg-gray-50 text-gray-700 border-gray-100'
  const badgeClass =
    CATEGORY_BADGE_STYLE[protocol.category] ?? 'bg-gray-100 text-gray-700'

  function handleClick() {
    downloadProtocol(protocol.filename)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      downloadProtocol(protocol.filename)
    }
  }

  return (
    <div
      className="group relative rounded-xl border border-border bg-white p-5 transition-shadow hover:shadow-md cursor-pointer flex flex-col gap-3"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`Download ${protocol.title}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border',
            iconColor
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground leading-snug group-hover:text-primary transition-colors">
            {protocol.title}
          </h3>
          <span
            className={cn(
              'mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium',
              badgeClass
            )}
          >
            {protocol.category}
          </span>
        </div>
        <Download className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">{protocol.description}</p>

      <p className="text-xs font-mono text-muted-foreground/60 truncate">{protocol.filename}</p>
    </div>
  )
}

// --- Main page ---

export function ProtocolsPage() {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<ProtocolCategory | ''>('')

  const { data: protocols, isLoading, isError } = useProtocols()

  const filtered = useMemo(() => {
    if (!protocols) return []
    const q = search.toLowerCase().trim()
    return protocols.filter((p) => {
      const matchesSearch =
        !q ||
        p.title.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.filename.toLowerCase().includes(q)
      const matchesCategory = !categoryFilter || p.category === categoryFilter
      return matchesSearch && matchesCategory
    })
  }, [protocols, search, categoryFilter])

  const grouped = useMemo(() => {
    const groups: Partial<Record<ProtocolCategory, Protocol[]>> = {}
    for (const p of filtered) {
      if (!groups[p.category]) groups[p.category] = []
      groups[p.category]!.push(p)
    }
    return groups
  }, [filtered])

  const activeCategoryOrder = ALL_CATEGORIES.filter(
    (cat) => (categoryFilter ? cat === categoryFilter : true) && (grouped[cat]?.length ?? 0) > 0
  )

  return (
    <div>
      <PageHeader
        title="Standard Operating Procedures"
        subtitle="Study protocols and SOPs — click any card to download"
        icon={<FileText className="h-5 w-5" />}
      />

      {/* Search + category filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search protocols..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setCategoryFilter('')}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-medium border transition-colors',
              categoryFilter === ''
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-white text-muted-foreground border-border hover:border-primary/40'
            )}
          >
            All
          </button>
          {ALL_CATEGORIES.map((cat) => {
            const Icon = CATEGORY_ICONS[cat]
            const isActive = categoryFilter === cat
            return (
              <button
                key={cat}
                onClick={() => setCategoryFilter(isActive ? '' : cat)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-white text-muted-foreground border-border hover:border-primary/40'
                )}
              >
                <Icon className="h-3 w-3" />
                {cat}
              </button>
            )
          })}
        </div>
      </div>

      {/* States */}
      {isLoading ? (
        <PageSpinner />
      ) : isError ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="Protocols unavailable"
          description="The protocols library could not be loaded. Contact your system administrator to ensure the protocols API endpoint is configured."
        />
      ) : !protocols || protocols.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="No protocols found"
          description="No SOP documents have been added to the system yet."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Search className="h-6 w-6" />}
          title="No matching protocols"
          description="Try adjusting your search or removing the category filter."
          action={
            <button
              onClick={() => {
                setSearch('')
                setCategoryFilter('')
              }}
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              Clear filters
            </button>
          }
        />
      ) : (
        <div className="space-y-8">
          {activeCategoryOrder.map((category) => {
            const items = grouped[category] ?? []
            if (!items.length) return null
            const Icon = CATEGORY_ICONS[category]
            return (
              <section key={category}>
                <div className="flex items-center gap-2 mb-4">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-foreground">{category}</h2>
                  <Badge variant="secondary" className="text-xs">
                    {items.length}
                  </Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {items.map((p) => (
                    <ProtocolCard key={p.filename} protocol={p} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
