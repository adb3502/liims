import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import {
  addSyncListener,
  triggerSync,
  type SyncProgress,
} from '@/lib/sync-manager'
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Database,
} from 'lucide-react'

export function SyncConflictsPage() {
  const { hasRole } = useAuth()
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null)
  const [syncing, setSyncing] = useState(false)

  const canManage = hasRole('super_admin', 'lab_manager', 'field_coordinator')
  const conflicts = syncProgress?.conflicts ?? []
  const hasPending = (syncProgress?.total ?? 0) - (syncProgress?.completed ?? 0) > 0

  useEffect(() => {
    const unsubscribe = addSyncListener((progress) => {
      setSyncProgress(progress)
      setSyncing(progress.state === 'syncing')
    })
    return unsubscribe
  }, [])

  async function handleManualSync() {
    setSyncing(true)
    try {
      await triggerSync()
    } catch {
      // Error is handled by sync manager
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sync Status</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor offline sync operations and resolve conflicts.
          </p>
        </div>
        {canManage && (
          <Button onClick={handleManualSync} disabled={syncing}>
            {syncing ? (
              <>
                <Spinner size="sm" className="text-primary-foreground" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Manual Sync
              </>
            )}
          </Button>
        )}
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="text-muted-foreground">Status</span>
              {syncProgress?.state === 'syncing' ? (
                <Clock className="h-4 w-4 text-warning" />
              ) : syncProgress?.state === 'error' ? (
                <AlertTriangle className="h-4 w-4 text-danger" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-success" />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {syncProgress?.state === 'syncing'
                ? 'Syncing...'
                : syncProgress?.state === 'error'
                  ? 'Error'
                  : 'Idle'}
            </div>
            {syncProgress?.error && (
              <p className="text-xs text-danger mt-1">{syncProgress.error}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground">
              Pending Mutations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {hasPending
                ? (syncProgress?.total ?? 0) - (syncProgress?.completed ?? 0)
                : 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {syncProgress?.total ?? 0} total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground">
              Conflicts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">
              {conflicts.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Server wins by default
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground">
              Last Sync
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-mono">
              {syncProgress?.lastSyncTime
                ? new Date(syncProgress.lastSyncTime).toLocaleString()
                : <span className="text-muted-foreground">Never</span>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Conflicts Table */}
      {conflicts.length > 0 ? (
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Sync Conflicts
          </h2>
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entity Type</TableHead>
                  <TableHead>Entity ID</TableHead>
                  <TableHead>Field</TableHead>
                  <TableHead>Local Value</TableHead>
                  <TableHead>Server Value</TableHead>
                  <TableHead>Resolution</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conflicts.map((conflict, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium capitalize">
                      {conflict.entity_type}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {conflict.entity_id}
                    </TableCell>
                    <TableCell className="text-sm">
                      {conflict.field}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {conflict.client_value ?? <span className="text-muted-foreground">null</span>}
                    </TableCell>
                    <TableCell className="font-mono text-sm font-medium">
                      {conflict.server_value ?? <span className="text-muted-foreground">null</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="default" className="text-xs">
                        Server Wins
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4 rounded-lg border border-warning/20 bg-warning/5 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-foreground">Conflict Resolution Policy</p>
                <p className="text-muted-foreground mt-1">
                  The system uses a "server wins" policy. Local changes that conflict with server
                  state are overwritten. Users are notified when conflicts occur.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-success mb-3" />
          <p className="text-lg font-medium text-foreground">All Synced</p>
          <p className="text-sm text-muted-foreground mt-1">
            {syncProgress?.lastSyncTime
              ? `Last synced ${new Date(syncProgress.lastSyncTime).toLocaleString()}`
              : 'No sync conflicts detected.'}
          </p>
          {hasPending && (
            <div className="mt-4">
              <Badge variant="warning" className="text-xs">
                {(syncProgress?.total ?? 0) - (syncProgress?.completed ?? 0)} pending mutation(s)
              </Badge>
            </div>
          )}
        </div>
      )}

      {/* Info Section */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Database className="h-5 w-5 text-muted-foreground" />
          About Offline Sync
        </h2>
        <div className="rounded-lg border border-border p-6 space-y-3 text-sm">
          <div>
            <p className="font-medium text-foreground">How it works</p>
            <p className="text-muted-foreground mt-1">
              When working offline, changes are queued locally in IndexedDB. When the
              connection is restored, the sync manager automatically pushes pending mutations
              to the server.
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground">Conflict Resolution</p>
            <p className="text-muted-foreground mt-1">
              If a conflict is detected (e.g., the same entity was modified on both client
              and server), the server value takes precedence. The local change is discarded
              and the user is notified.
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground">Manual Sync</p>
            <p className="text-muted-foreground mt-1">
              You can trigger a manual sync at any time using the "Manual Sync" button above.
              This is useful for testing or forcing an immediate sync.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
