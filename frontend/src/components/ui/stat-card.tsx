import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon?: React.ReactNode
  accentColor?: string
  trend?: { value: number; label: string }
  loading?: boolean
  className?: string
  onClick?: () => void
}

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  accentColor = '#3674F6',
  trend,
  loading,
  className,
  onClick,
}: StatCardProps) {
  const TrendIcon = trend
    ? trend.value > 0 ? TrendingUp : trend.value < 0 ? TrendingDown : Minus
    : null

  const trendColorClass = trend
    ? trend.value > 0 ? 'text-emerald-600 bg-emerald-50' : trend.value < 0 ? 'text-red-600 bg-red-50' : 'text-gray-500 bg-gray-50'
    : ''

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl bg-white border border-gray-100 p-5 transition-all duration-200',
        'hover:shadow-[0_4px_12px_-2px_rgba(0,0,0,0.08)] hover:border-gray-200',
        onClick && 'cursor-pointer',
        className
      )}
      onClick={onClick}
      style={{ '--stat-accent': accentColor } as React.CSSProperties}
    >
      {/* Accent stripe */}
      <div
        className="absolute top-0 left-0 w-1 h-full rounded-r-full"
        style={{ backgroundColor: accentColor }}
      />

      {/* Subtle gradient background */}
      <div
        className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-[0.04] -translate-y-6 translate-x-6"
        style={{ backgroundColor: accentColor }}
      />

      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
            {title}
          </p>

          {loading ? (
            <div className="h-8 w-20 skeleton" />
          ) : (
            <p className="text-2xl font-bold text-gray-900 tabular-nums animate-[countUp_0.6s_ease-out]">
              {typeof value === 'number' ? value.toLocaleString() : value}
            </p>
          )}

          {loading ? (
            <div className="h-4 w-32 skeleton" />
          ) : subtitle ? (
            <p className="text-xs text-gray-500">{subtitle}</p>
          ) : null}
        </div>

        {icon && (
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg opacity-90"
            style={{ backgroundColor: `${accentColor}12`, color: accentColor }}
          >
            {icon}
          </div>
        )}
      </div>

      {/* Trend badge */}
      {trend && !loading && (
        <div className="mt-3 flex items-center gap-1.5">
          <span className={cn('inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium', trendColorClass)}>
            {TrendIcon && <TrendIcon className="h-3 w-3" />}
            {trend.value > 0 ? '+' : ''}{trend.value}%
          </span>
          <span className="text-xs text-gray-400">{trend.label}</span>
        </div>
      )}
    </div>
  )
}

/** Skeleton version for loading states */
export function StatCardSkeleton() {
  return (
    <div className="rounded-xl bg-white border border-gray-100 p-5">
      <div className="space-y-3">
        <div className="h-3 w-24 skeleton" />
        <div className="h-8 w-20 skeleton" />
        <div className="h-3 w-32 skeleton" />
      </div>
    </div>
  )
}
