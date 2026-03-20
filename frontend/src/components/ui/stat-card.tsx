import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { LineChart, Line, ResponsiveContainer } from 'recharts'

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  /** @deprecated icons are no longer rendered — prop accepted for backwards compatibility */
  icon?: React.ReactNode
  /** @deprecated accent color is no longer used — prop accepted for backwards compatibility */
  accentColor?: string
  trend?: { value: number; label: string }
  sparkline?: number[]
  sparklineColor?: string
  loading?: boolean
  className?: string
  onClick?: () => void
}

export function StatCard({
  title,
  value,
  subtitle,
  trend,
  sparkline,
  sparklineColor = '#3674F6',
  loading,
  className,
  onClick,
}: StatCardProps) {
  const TrendIcon = trend
    ? trend.value > 0 ? TrendingUp : trend.value < 0 ? TrendingDown : Minus
    : null

  const trendColor = trend
    ? trend.value > 0 ? '#059669' : trend.value < 0 ? '#DC2626' : '#94A3B8'
    : ''

  const sparkData = sparkline?.map((v) => ({ v }))

  return (
    <div
      className={cn(
        'rounded-xl bg-white border border-gray-100 p-5 transition-all duration-200',
        'hover:shadow-[0_4px_12px_-2px_rgba(0,0,0,0.08)] hover:border-gray-200',
        onClick && 'cursor-pointer',
        className
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {loading ? (
            <div className="h-10 w-24 skeleton mb-2" />
          ) : (
            <p
              className="tabular-nums font-bold leading-none text-[#1E293B]"
              style={{ fontSize: '2.5rem' }}
            >
              {typeof value === 'number' ? value.toLocaleString() : value}
            </p>
          )}

          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {loading ? (
              <div className="h-3.5 w-28 skeleton" />
            ) : (
              <span className="text-[0.875rem] font-medium text-[#64748B]">{title}</span>
            )}

            {trend && !loading && TrendIcon && (
              <span
                className="inline-flex items-center gap-0.5 text-[0.75rem] font-medium"
                style={{ color: trendColor }}
              >
                <TrendIcon className="h-3 w-3" />
                {trend.value > 0 ? '+' : ''}{trend.value} {trend.label}
              </span>
            )}
          </div>

          {subtitle && !loading && (
            <p className="mt-0.5 text-[0.75rem] text-[#94A3B8]">{subtitle}</p>
          )}
        </div>

        {sparkData && sparkData.length > 1 && !loading && (
          <div className="shrink-0" style={{ width: 80, height: 32 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke={sparklineColor}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}

/** Skeleton version for loading states */
export function StatCardSkeleton() {
  return (
    <div className="rounded-xl bg-white border border-gray-100 p-5">
      <div className="space-y-3">
        <div className="h-10 w-24 skeleton" />
        <div className="h-3.5 w-28 skeleton" />
      </div>
    </div>
  )
}
