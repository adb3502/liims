import { useState } from 'react'
import { useSettings, useUpdateSetting } from '@/api/settings'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { PageSpinner, Spinner } from '@/components/ui/spinner'
import { Settings, Edit, Database, Mail, ChartBar, FileArchive, Cog, FlaskConical, Beaker } from 'lucide-react'
import type { SystemSetting } from '@/types'

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  session: Settings,
  odk: Database,
  email: Mail,
  dashboard: ChartBar,
  backup: FileArchive,
  processing: Cog,
  study: FlaskConical,
  aliquot_rules: Beaker,
}

const CATEGORY_LABELS: Record<string, string> = {
  session: 'Session',
  odk: 'ODK Integration',
  email: 'Email',
  dashboard: 'Dashboard',
  backup: 'Backup',
  processing: 'Processing',
  study: 'Study',
  aliquot_rules: 'Aliquot Rules',
}

export function SystemSettingsPage() {
  const { hasRole } = useAuth()
  const { data: settingsGroups, isLoading, isError } = useSettings()
  const updateMutation = useUpdateSetting()

  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [selectedSetting, setSelectedSetting] = useState<SystemSetting | null>(null)
  const [editValue, setEditValue] = useState('')
  const [activeTab, setActiveTab] = useState<string>('session')

  const canManage = hasRole('super_admin')

  function openEditDialog(setting: SystemSetting) {
    setSelectedSetting(setting)
    setEditValue(setting.value)
    setEditDialogOpen(true)
  }

  async function handleUpdateSetting() {
    if (!selectedSetting) return

    try {
      await updateMutation.mutateAsync({
        category: selectedSetting.category,
        key: selectedSetting.key,
        value: editValue,
      })
      setEditDialogOpen(false)
      setSelectedSetting(null)
      setEditValue('')
    } catch {
      // handled by mutation
    }
  }

  function renderSettingValue(setting: SystemSetting) {
    switch (setting.value_type) {
      case 'boolean':
        return (
          <Badge variant={setting.value === 'true' ? 'success' : 'secondary'}>
            {setting.value === 'true' ? 'Enabled' : 'Disabled'}
          </Badge>
        )
      case 'integer':
        return <span className="font-mono text-sm">{setting.value}</span>
      case 'json':
        return (
          <code className="text-xs bg-muted px-2 py-1 rounded">
            {setting.value.length > 50 ? `${setting.value.slice(0, 50)}...` : setting.value}
          </code>
        )
      default:
        return <span className="text-sm">{setting.value}</span>
    }
  }

  function renderEditInput() {
    if (!selectedSetting) return null

    switch (selectedSetting.value_type) {
      case 'boolean':
        return (
          <div className="space-y-2">
            <Label>Value</Label>
            <select
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </div>
        )
      case 'integer':
        return (
          <div className="space-y-1.5">
            <Label htmlFor="edit_value">Value</Label>
            <Input
              id="edit_value"
              type="number"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
            />
          </div>
        )
      case 'json':
        return (
          <div className="space-y-1.5">
            <Label htmlFor="edit_value">Value (JSON)</Label>
            <textarea
              id="edit_value"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              placeholder='{"key": "value"}'
            />
          </div>
        )
      default:
        return (
          <div className="space-y-1.5">
            <Label htmlFor="edit_value">Value</Label>
            <Input
              id="edit_value"
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
            />
          </div>
        )
    }
  }

  if (!canManage) {
    return (
      <div className="rounded-lg border border-danger/20 bg-danger/5 p-8 text-center">
        <p className="text-sm text-danger">
          You do not have permission to view this page.
        </p>
      </div>
    )
  }

  if (isLoading) {
    return <PageSpinner />
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-danger/20 bg-danger/5 p-8 text-center">
        <p className="text-sm text-danger">
          Failed to load settings. Please try again.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">System Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure system-wide settings and preferences
        </p>
      </div>

      {/* Settings Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4">
          {settingsGroups?.map((group) => {
            const Icon = CATEGORY_ICONS[group.category] ?? Settings
            return (
              <TabsTrigger key={group.category} value={group.category}>
                <Icon className="h-4 w-4 mr-2" />
                {CATEGORY_LABELS[group.category] ?? group.category}
              </TabsTrigger>
            )
          })}
        </TabsList>

        {settingsGroups?.map((group) => (
          <TabsContent key={group.category} value={group.category}>
            <div className="grid gap-4 md:grid-cols-2">
              {group.settings.map((setting) => (
                <Card key={setting.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-foreground">{setting.key}</h3>
                        <Badge variant="outline" className="text-xs">
                          {setting.value_type}
                        </Badge>
                      </div>
                      {setting.description && (
                        <p className="text-xs text-muted-foreground mb-2">
                          {setting.description}
                        </p>
                      )}
                      <div className="mt-2">{renderSettingValue(setting)}</div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Last updated: {new Date(setting.updated_at).toLocaleString()}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditDialog(setting)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>

            {group.settings.length === 0 && (
              <div className="rounded-lg border border-dashed border-border p-12 text-center">
                <Settings className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-foreground">No settings found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  This category has no configurable settings.
                </p>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Edit Setting Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent onClose={() => setEditDialogOpen(false)} className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Setting</DialogTitle>
            <DialogDescription>
              {selectedSetting?.key} ({selectedSetting?.value_type})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {selectedSetting?.description && (
              <p className="text-sm text-muted-foreground">
                {selectedSetting.description}
              </p>
            )}
            {renderEditInput()}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdateSetting}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <>
                  <Spinner size="sm" className="text-primary-foreground" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
