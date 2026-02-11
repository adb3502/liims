import { useOnlineStatus, useOfflineQueue, useSyncStatus } from '@/hooks/useOffline'
import { cn } from '@/lib/utils'
import { Check, CloudOff, Loader2, AlertTriangle } from 'lucide-react'

/**
 * Small badge showing sync status for use in the Layout header.
 * States: synced (green), pending (yellow), syncing (blue), conflict/error (red)
 */
export function SyncStatusBadge() {
  const isOnline = useOnlineStatus()
  const { pendingCount } = useOfflineQueue()
  const { progress } = useSyncStatus()

  const isSyncing = progress.state === 'syncing'
  const hasError = progress.state === 'error'
  const hasPending = pendingCount > 0
  const hasConflicts = progress.conflicts.length > 0

  // Determine the badge state
  let variant: 'synced' | 'pending' | 'syncing' | 'error' | 'offline'
  if (!isOnline) {
    variant = 'offline'
  } else if (isSyncing) {
    variant = 'syncing'
  } else if (hasError || hasConflicts) {
    variant = 'error'
  } else if (hasPending) {
    variant = 'pending'
  } else {
    variant = 'synced'
  }

  // Don't show badge when everything is fine and synced
  if (variant === 'synced' && !progress.lastSyncTime) return null

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        variant === 'synced' && 'bg-success/10 text-success',
        variant === 'pending' && 'bg-warning/10 text-warning',
        variant === 'syncing' && 'bg-primary/10 text-primary',
        variant === 'error' && 'bg-danger/10 text-danger',
        variant === 'offline' && 'bg-muted text-muted-foreground',
      )}
      title={getTooltip(variant, pendingCount, progress)}
    >
      {variant === 'synced' && <Check className="h-3 w-3" />}
      {variant === 'pending' && <CloudOff className="h-3 w-3" />}
      {variant === 'syncing' && <Loader2 className="h-3 w-3 animate-spin" />}
      {variant === 'error' && <AlertTriangle className="h-3 w-3" />}
      {variant === 'offline' && <CloudOff className="h-3 w-3" />}

      <span className="hidden sm:inline">
        {variant === 'synced' && 'Synced'}
        {variant === 'pending' && `${pendingCount} pending`}
        {variant === 'syncing' && 'Syncing...'}
        {variant === 'error' && 'Sync error'}
        {variant === 'offline' && 'Offline'}
      </span>

      {/* Pending count dot for mobile */}
      {hasPending && variant !== 'syncing' && (
        <span className="sm:hidden flex h-4 min-w-4 items-center justify-center rounded-full bg-current/20 text-[10px] px-1">
          {pendingCount}
        </span>
      )}
    </div>
  )
}

function getTooltip(
  variant: string,
  pendingCount: number,
  progress: { lastSyncTime: string | null; conflicts: unknown[] },
): string {
  if (variant === 'offline') return 'You are offline'
  if (variant === 'syncing') return 'Syncing changes to server...'
  if (variant === 'error') return `Sync error. ${progress.conflicts.length} conflicts.`
  if (variant === 'pending') return `${pendingCount} changes waiting to sync`
  if (progress.lastSyncTime) {
    const date = new Date(progress.lastSyncTime)
    return `Last synced: ${date.toLocaleTimeString()}`
  }
  return 'All changes synced'
}
