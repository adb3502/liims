import { useState } from 'react'
import {
  useScheduledReports,
  useCreateScheduledReport,
  useUpdateScheduledReport,
  useDeleteScheduledReport,
  type ScheduledReport,
  type ScheduledReportCreate,
  type ScheduledReportType,
} from '@/api/reports'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { PageSpinner } from '@/components/ui/spinner'
import { Plus, Pencil, Trash2, Calendar, Mail, FileText } from 'lucide-react'
import { format } from 'date-fns'

const REPORT_TYPE_LABELS: Record<ScheduledReportType, string> = {
  enrollment_summary: 'Enrollment Summary',
  inventory_summary: 'Inventory Summary',
  quality_summary: 'Quality Summary',
  compliance: 'Compliance',
}

const ALL_REPORT_TYPES: ScheduledReportType[] = [
  'enrollment_summary',
  'inventory_summary',
  'quality_summary',
  'compliance',
]

export function ScheduledReportsPage() {
  const { data, isLoading } = useScheduledReports()
  const createReport = useCreateScheduledReport()
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const deleteReport = useDeleteScheduledReport(deleteId ?? '')

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [currentReport, setCurrentReport] = useState<ScheduledReport | null>(null)

  const [formData, setFormData] = useState<ScheduledReportCreate>({
    name: '',
    report_type: 'enrollment_summary',
    schedule_cron: '0 9 * * 1',
    recipients: [],
    is_active: true,
  })
  const [recipientsInput, setRecipientsInput] = useState('')

  const updateReport = useUpdateScheduledReport(currentReport?.id ?? '')

  const handleCreate = () => {
    const recipients = recipientsInput
      .split(',')
      .map((email) => email.trim())
      .filter((email) => email.length > 0)

    createReport.mutate(
      { ...formData, recipients },
      {
        onSuccess: () => {
          setCreateDialogOpen(false)
          resetForm()
        },
      }
    )
  }

  const handleEdit = () => {
    const recipients = recipientsInput
      .split(',')
      .map((email) => email.trim())
      .filter((email) => email.length > 0)

    updateReport.mutate(
      {
        name: formData.name,
        schedule_cron: formData.schedule_cron,
        recipients,
        is_active: formData.is_active,
      },
      {
        onSuccess: () => {
          setEditDialogOpen(false)
          setCurrentReport(null)
          resetForm()
        },
      }
    )
  }

  const handleDelete = () => {
    if (deleteId) {
      deleteReport.mutate(undefined, {
        onSuccess: () => {
          setDeleteDialogOpen(false)
          setDeleteId(null)
        },
      })
    }
  }

  const openEditDialog = (report: ScheduledReport) => {
    setCurrentReport(report)
    setFormData({
      name: report.name,
      report_type: report.report_type,
      schedule_cron: report.schedule_cron,
      recipients: report.recipients,
      is_active: report.is_active,
    })
    setRecipientsInput(report.recipients.join(', '))
    setEditDialogOpen(true)
  }

  const openDeleteDialog = (id: string) => {
    setDeleteId(id)
    setDeleteDialogOpen(true)
  }

  const resetForm = () => {
    setFormData({
      name: '',
      report_type: 'enrollment_summary',
      schedule_cron: '0 9 * * 1',
      recipients: [],
      is_active: true,
    })
    setRecipientsInput('')
  }

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <PageSpinner />
      </div>
    )
  }

  const reports = data?.data ?? []

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Scheduled Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage automated report generation and delivery
          </p>
        </div>
        <Button
          onClick={() => {
            resetForm()
            setCreateDialogOpen(true)
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Create Report
        </Button>
      </div>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Scheduled Report</DialogTitle>
              <DialogDescription>
                Configure a new automated report to be generated and emailed on schedule.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="create-name">Report Name</Label>
                <Input
                  id="create-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Weekly Enrollment Report"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="create-type">Report Type</Label>
                <Select
                  id="create-type"
                  value={formData.report_type}
                  onChange={(e) =>
                    setFormData({ ...formData, report_type: e.target.value as ScheduledReportType })
                  }
                  options={ALL_REPORT_TYPES.map((type) => ({
                    value: type,
                    label: REPORT_TYPE_LABELS[type],
                  }))}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="create-schedule">Schedule (Cron Expression)</Label>
                <Input
                  id="create-schedule"
                  value={formData.schedule_cron}
                  onChange={(e) => setFormData({ ...formData, schedule_cron: e.target.value })}
                  placeholder="0 9 * * 1"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Example: "0 9 * * 1" = Every Monday at 9:00 AM
                </p>
              </div>

              <div>
                <Label htmlFor="create-recipients">Recipients (comma-separated emails)</Label>
                <Input
                  id="create-recipients"
                  value={recipientsInput}
                  onChange={(e) => setRecipientsInput(e.target.value)}
                  placeholder="user1@example.com, user2@example.com"
                  className="mt-1"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="create-active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="create-active" className="font-normal cursor-pointer">
                  Active
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={createReport.isPending || !formData.name}>
                {createReport.isPending ? 'Creating...' : 'Create Report'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      {/* Reports table */}
      {reports.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">No scheduled reports configured yet.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Report Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Recipients</TableHead>
                <TableHead>Last Generated</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((report) => (
                <TableRow key={report.id}>
                  <TableCell className="font-medium">{report.name}</TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {REPORT_TYPE_LABELS[report.report_type]}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <code className="text-xs">{report.schedule_cron}</code>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Mail className="h-4 w-4" />
                      <span>{report.recipients.length} recipient(s)</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {report.last_generated_at
                      ? format(new Date(report.last_generated_at), 'MMM d, yyyy h:mm a')
                      : 'Never'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={report.is_active ? 'success' : 'secondary'}>
                      {report.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(report)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openDeleteDialog(report.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Scheduled Report</DialogTitle>
            <DialogDescription>Update report configuration and schedule.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="edit-name">Report Name</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="edit-schedule">Schedule (Cron Expression)</Label>
              <Input
                id="edit-schedule"
                value={formData.schedule_cron}
                onChange={(e) => setFormData({ ...formData, schedule_cron: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="edit-recipients">Recipients (comma-separated emails)</Label>
              <Input
                id="edit-recipients"
                value={recipientsInput}
                onChange={(e) => setRecipientsInput(e.target.value)}
                className="mt-1"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit-active"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="edit-active" className="font-normal cursor-pointer">
                Active
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={updateReport.isPending || !formData.name}>
              {updateReport.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Scheduled Report</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this scheduled report? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteReport.isPending}
            >
              {deleteReport.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
