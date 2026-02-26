import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  subtitle?: string
  icon?: React.ReactNode
  actions?: React.ReactNode
  gradient?: boolean
  className?: string
}

export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
  gradient = false,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6', className)}>
      <div className="flex items-center gap-3">
        {icon && (
          <div className={cn(
            'flex h-10 w-10 items-center justify-center rounded-xl',
            gradient ? 'bg-gradient-primary text-white' : 'bg-primary/10 text-primary'
          )}>
            {icon}
          </div>
        )}
        <div>
          <h1 className={cn(
            'text-xl font-bold tracking-tight',
            gradient ? 'text-gradient-primary' : 'text-gray-900'
          )}>
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>

      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {actions}
        </div>
      )}
    </div>
  )
}
