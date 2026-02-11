import { useOnlineStatus, useOfflineQueue, useSyncStatus } from '@/hooks/useOffline'
import { cn } from '@/lib/utils'
import { CloudOff, Loader2, RefreshCw, WifiOff } from 'lucide-react'

/**
 * Banner shown at the top of the page when offline or syncing.
 * - "You're offline" banner when disconnected
 * - "Syncing..." with progress when reconnecting
 * - Shows pending changes count
 */
export function OfflineBanner() {
  const isOnline = useOnlineStatus()
  const { pendingCount } = useOfflineQueue()
  const { progress, sync } = useSyncStatus()

  // Don't show anything if online and no pending changes and not syncing
  if (isOnline && pendingCount === 0 && progress.state === 'idle') {
    return null
  }

  const isSyncing = progress.state === 'syncing'
  const hasError = progress.state === 'error'

  return (
    <div
      className={cn(
        'flex items-center justify-between px-4 py-2 text-sm font-medium transition-colors',
        !isOnline && 'bg-warning/15 text-warning',
        isOnline && isSyncing && 'bg-primary/10 text-primary',
        isOnline && hasError && 'bg-danger/10 text-danger',
        isOnline && !isSyncing && !hasError && pendingCount > 0 && 'bg-warning/10 text-warning',
      )}
    >
      <div className="flex items-center gap-2">
        {!isOnline ? (
          <>
            <WifiOff className="h-4 w-4" />
            <span>
              You are offline.
              {pendingCount > 0 && (
                <> {pendingCount} change{pendingCount !== 1 ? 's' : ''} will sync when reconnected.</>
              )}
            </span>
          </>
        ) : isSyncing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>
              Syncing changes...
              {progress.total > 0 && (
                <> ({progress.completed}/{progress.total})</>
              )}
            </span>
          </>
        ) : hasError ? (
          <>
            <CloudOff className="h-4 w-4" />
            <span>
              Sync failed.
              {progress.error && <> {progress.error}</>}
            </span>
          </>
        ) : pendingCount > 0 ? (
          <>
            <CloudOff className="h-4 w-4" />
            <span>
              {pendingCount} pending change{pendingCount !== 1 ? 's' : ''} to sync.
            </span>
          </>
        ) : null}
      </div>

      {/* Retry / sync button */}
      {isOnline && (isSyncing || hasError || pendingCount > 0) && (
        <button
          onClick={sync}
          disabled={isSyncing}
          className={cn(
            'flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors cursor-pointer',
            'hover:bg-black/5 disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          <RefreshCw className={cn('h-3 w-3', isSyncing && 'animate-spin')} />
          {isSyncing ? 'Syncing...' : 'Sync now'}
        </button>
      )}

      {/* Conflict notification */}
      {progress.conflicts.length > 0 && (
        <span className="ml-2 text-xs text-muted-foreground">
          ({progress.conflicts.length} conflict{progress.conflicts.length !== 1 ? 's' : ''} resolved by server)
        </span>
      )}
    </div>
  )
}
