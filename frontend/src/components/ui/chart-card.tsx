import { cn } from '@/lib/utils'
import { Maximize2, Minimize2 } from 'lucide-react'
import { useState } from 'react'

interface ChartCardProps {
  title: string
  subtitle?: string
  action?: React.ReactNode
  children?: React.ReactNode
  className?: string
  fullWidth?: boolean
  loading?: boolean
  empty?: boolean
  emptyMessage?: string
  error?: string
  height?: string
}

export function ChartCard({
  title,
  subtitle,
  action,
  children,
  className,
  fullWidth,
  loading,
  empty,
  emptyMessage = 'No data available',
  error,
  height = 'h-80',
}: ChartCardProps) {
  const [expanded, setExpanded] = useState(false)

  const card = (
    <div
      className={cn(
        'rounded-xl border border-gray-100 overflow-hidden transition-all duration-200',
        !expanded && 'hover:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.06)]',
        expanded && 'fixed inset-4 z-[51] shadow-2xl',
        fullWidth && 'col-span-full',
        className
      )}
      style={{ backgroundColor: '#ffffff' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {action}
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
            title={expanded ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className={cn('px-5 pb-5', expanded ? 'h-[calc(100%-60px)]' : height)}>
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 rounded-full border-2 border-gray-200 border-t-primary animate-spin" />
              <span className="text-xs text-gray-400">Loading chart...</span>
            </div>
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-red-500">{error}</p>
            </div>
          </div>
        ) : empty ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-gray-400">{emptyMessage}</p>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  )

  if (expanded) {
    return (
      <>
        {/* Backdrop — rendered as sibling, not child, so z-index works correctly */}
        <div
          className="fixed inset-0 z-50 bg-black/40"
          onClick={() => setExpanded(false)}
        />
        {card}
      </>
    )
  }

  return card
}

/** Simple filter chip for chart filters */
export function FilterChip({
  label,
  active,
  onClick,
  color,
}: {
  label: string
  active: boolean
  onClick: () => void
  color?: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all cursor-pointer',
        active
          ? 'text-white shadow-sm'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      )}
      style={active ? { backgroundColor: color || '#3674F6' } : undefined}
    >
      {color && !active && (
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      )}
      {label}
    </button>
  )
}
