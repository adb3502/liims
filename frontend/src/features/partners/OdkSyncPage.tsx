import { useState } from 'react'
import {
  useOdkFormConfigs,
  useOdkSyncLogs,
  useTriggerOdkSync,
  useCreateOdkFormConfig,
} from '@/api/partner'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageSpinner, Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import type { OdkSyncStatus } from '@/types'
import {
  RefreshCw,
  Plus,
  Settings,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react'

const SYNC_STATUS_BADGE: Record<OdkSyncStatus, 'success' | 'destructive' | 'warning'> = {
  running: 'warning',
  completed: 'success',
  failed: 'destructive',
}

const SYNC_STATUS_ICON: Record<OdkSyncStatus, typeof CheckCircle2> = {
  running: Clock,
  completed: CheckCircle2,
  failed: XCircle,
}

export function OdkSyncPage() {
  const { hasRole } = useAuth()
  const [showAddForm, setShowAddForm] = useState(false)

  const { data: formConfigs, isLoading: configsLoading } = useOdkFormConfigs()
  const { data: syncLogs, isLoading: logsLoading } = useOdkSyncLogs({ per_page: 20 })
  const triggerSync = useTriggerOdkSync()

  const canManage = hasRole('super_admin', 'lab_manager')
  const logs = syncLogs?.data ?? []

  async function handleTriggerSync(formId?: string) {
    try {
      await triggerSync.mutateAsync(formId)
    } catch {
      // handled by mutation
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ODK Sync</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage ODK Central form configurations and sync operations.
          </p>
        </div>
        <div className="flex gap-2">
          {canManage && (
            <Button variant="outline" onClick={() => setShowAddForm(true)}>
              <Plus className="h-4 w-4" />
              Add Form Config
            </Button>
          )}
          <Button onClick={() => handleTriggerSync()} disabled={triggerSync.isPending}>
            {triggerSync.isPending ? (
              <>
                <Spinner size="sm" className="text-primary-foreground" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Sync All
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Form Configs */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Settings className="h-5 w-5 text-muted-foreground" />
          Form Configurations
        </h2>

        {configsLoading ? (
          <PageSpinner />
        ) : !formConfigs || formConfigs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <Settings className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-foreground">No form configurations</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add an ODK form configuration to start syncing.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {formConfigs.map((config) => (
              <Card key={config.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>{config.form_name}</span>
                    <Badge variant={config.is_active ? 'success' : 'secondary'} className="text-xs">
                      {config.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Form ID</span>
                      <span className="font-mono text-xs">{config.form_id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Version</span>
                      <span className="font-mono text-xs">{config.form_version}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Fields Mapped</span>
                      <span className="font-mono text-xs">
                        {Object.keys(config.field_mapping).length}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-3"
                    onClick={() => handleTriggerSync(config.form_id)}
                    disabled={triggerSync.isPending}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Sync This Form
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Sync Log History */}
      <div>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Clock className="h-5 w-5 text-muted-foreground" />
          Sync History
        </h2>

        {logsLoading ? (
          <PageSpinner />
        ) : logs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <Clock className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-foreground">No sync logs</p>
            <p className="text-xs text-muted-foreground mt-1">
              Trigger a sync to see history here.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Found</TableHead>
                  <TableHead className="text-right">Processed</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => {
                  const StatusIcon = SYNC_STATUS_ICON[log.status]
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="font-mono text-sm">
                        {new Date(log.sync_started_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {log.sync_completed_at
                          ? new Date(log.sync_completed_at).toLocaleString()
                          : <span className="text-muted-foreground">---</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={SYNC_STATUS_BADGE[log.status]} className="text-xs">
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {log.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {log.submissions_found ?? '---'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {log.submissions_processed ?? '---'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-danger">
                        {log.submissions_failed ?? '---'}
                      </TableCell>
                      <TableCell className="text-sm text-danger max-w-[200px] truncate">
                        {log.error_message ?? <span className="text-muted-foreground">---</span>}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Add Form Config Dialog */}
      {showAddForm && (
        <AddFormConfigDialog
          open={showAddForm}
          onClose={() => setShowAddForm(false)}
        />
      )}
    </div>
  )
}

// --- Add Form Config Dialog ---

function AddFormConfigDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createMutation = useCreateOdkFormConfig()
  const [formId, setFormId] = useState('')
  const [formName, setFormName] = useState('')
  const [formVersion, setFormVersion] = useState('')
  const [mappingJson, setMappingJson] = useState('{}')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formId.trim() || !formName.trim() || !formVersion.trim()) return

    let fieldMapping: Record<string, string> = {}
    try {
      fieldMapping = JSON.parse(mappingJson)
    } catch {
      return
    }

    try {
      await createMutation.mutateAsync({
        form_id: formId.trim(),
        form_name: formName.trim(),
        form_version: formVersion.trim(),
        field_mapping: fieldMapping,
      })
      onClose()
    } catch {
      // handled by mutation
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent onClose={onClose} className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Form Configuration</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="odk-form-id">Form ID</Label>
            <Input
              id="odk-form-id"
              value={formId}
              onChange={(e) => setFormId(e.target.value)}
              placeholder="e.g. bharat_enrollment_v1"
              className="font-mono"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="odk-form-name">Form Name</Label>
            <Input
              id="odk-form-name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. BHARAT Enrollment Form"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="odk-form-version">Version</Label>
            <Input
              id="odk-form-version"
              value={formVersion}
              onChange={(e) => setFormVersion(e.target.value)}
              placeholder="e.g. 2025.1"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="odk-mapping">Field Mapping (JSON)</Label>
            <textarea
              id="odk-mapping"
              value={mappingJson}
              onChange={(e) => setMappingJson(e.target.value)}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              placeholder='{"odk_field": "db_field"}'
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <>
                  <Spinner size="sm" className="text-primary-foreground" />
                  Saving...
                </>
              ) : (
                'Save Config'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
