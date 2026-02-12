import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications, useMarkAsRead, useMarkAllAsRead } from '@/api/notifications'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { Select } from '@/components/ui/select'
import { PageSpinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import type { NotificationType, NotificationSeverity } from '@/types'
import {
  Bell,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Database,
  Thermometer,
  FileWarning,
  Calendar,
  FileCheck,
  HardDrive,
  Activity,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

const PER_PAGE = 20

// Notification type mappings
const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  odk_sync_failure: 'ODK Sync Failure',
  freezer_capacity_warning: 'Freezer Capacity Warning',
  temperature_excursion: 'Temperature Excursion',
  sample_processing_overdue: 'Sample Processing Overdue',
  partner_import_complete: 'Partner Import Complete',
  scheduled_report_generated: 'Scheduled Report Generated',
  file_discovered: 'File Discovered',
  file_integrity_failed: 'File Integrity Failed',
  system_alert: 'System Alert',
  general: 'General',
  freezer_temp_event: 'Temperature Excursion',
  consent_withdrawal: 'Consent Withdrawal',
  import_error: 'Import Error',
  backup_stale: 'Backup Stale',
  discard_request: 'Discard Request',
  processing_timer_exceeded: 'Processing Overdue',
}

const NOTIFICATION_TYPE_ICONS: Record<NotificationType, typeof Bell> = {
  odk_sync_failure: Database,
  freezer_capacity_warning: Thermometer,
  temperature_excursion: Thermometer,
  sample_processing_overdue: Calendar,
  partner_import_complete: FileCheck,
  scheduled_report_generated: FileCheck,
  file_discovered: HardDrive,
  file_integrity_failed: FileWarning,
  system_alert: Activity,
  general: Bell,
  freezer_temp_event: Thermometer,
  consent_withdrawal: FileWarning,
  import_error: FileWarning,
  backup_stale: HardDrive,
  discard_request: AlertCircle,
  processing_timer_exceeded: Calendar,
}

const SEVERITY_BADGE_VARIANT: Record<NotificationSeverity, 'default' | 'warning' | 'destructive'> = {
  info: 'default',
  warning: 'warning',
  error: 'destructive',
  critical: 'destructive',
}

const ALL_TYPES: NotificationType[] = [
  'odk_sync_failure',
  'freezer_capacity_warning',
  'temperature_excursion',
  'sample_processing_overdue',
  'partner_import_complete',
  'scheduled_report_generated',
  'file_discovered',
  'file_integrity_failed',
  'system_alert',
  'general',
]

const ALL_SEVERITIES: NotificationSeverity[] = ['info', 'warning', 'error', 'critical']

export function NotificationsPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [severityFilter, setSeverityFilter] = useState<string>('')
  const [readFilter, setReadFilter] = useState<string>('')

  const { data, isLoading } = useNotifications({
    page,
    per_page: PER_PAGE,
    type: typeFilter || undefined,
    severity: severityFilter || undefined,
    is_read: readFilter === 'read' ? true : readFilter === 'unread' ? false : undefined,
  })

  const markAsRead = useMarkAsRead()
  const markAllAsRead = useMarkAllAsRead()

  const handleNotificationClick = (id: string, isRead: boolean, entityType: string | null, entityId: string | null) => {
    if (!isRead) {
      markAsRead.mutate(id)
    }
    // Navigate to entity if available
    if (entityType && entityId) {
      if (entityType === 'sample') {
        navigate(`/samples/${entityId}`)
      } else if (entityType === 'participant') {
        navigate(`/participants/${entityId}`)
      } else if (entityType === 'freezer') {
        navigate(`/storage/freezers/${entityId}`)
      }
    }
  }

  const handleMarkAllRead = () => {
    markAllAsRead.mutate()
  }

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <PageSpinner />
      </div>
    )
  }

  const notifications = data?.data ?? []
  const meta = data?.meta ?? { page: 1, per_page: PER_PAGE, total: 0 }
  const totalPages = Math.ceil(meta.total / meta.per_page)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage and view all system notifications
          </p>
        </div>
        <Button
          onClick={handleMarkAllRead}
          disabled={markAllAsRead.isPending || notifications.every((n) => n.is_read)}
          variant="outline"
        >
          <CheckCheck className="h-4 w-4 mr-2" />
          Mark All Read
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div className="w-48">
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            options={[
              { value: '', label: 'All Types' },
              ...ALL_TYPES.map((type) => ({
                value: type,
                label: NOTIFICATION_TYPE_LABELS[type],
              })),
            ]}
            placeholder="All Types"
          />
        </div>

        <div className="w-48">
          <Select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            options={[
              { value: '', label: 'All Severities' },
              ...ALL_SEVERITIES.map((severity) => ({
                value: severity,
                label: severity.charAt(0).toUpperCase() + severity.slice(1),
              })),
            ]}
            placeholder="All Severities"
          />
        </div>

        <div className="w-48">
          <Select
            value={readFilter}
            onChange={(e) => setReadFilter(e.target.value)}
            options={[
              { value: '', label: 'All Notifications' },
              { value: 'unread', label: 'Unread Only' },
              { value: 'read', label: 'Read Only' },
            ]}
            placeholder="All Notifications"
          />
        </div>
      </div>

      {/* Notifications table */}
      {notifications.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">
            {typeFilter || severityFilter || readFilter
              ? 'No notifications match your filters.'
              : 'No notifications yet.'}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead className="w-12"></TableHead>
                <TableHead>Title / Message</TableHead>
                <TableHead className="w-32">Type</TableHead>
                <TableHead className="w-24">Severity</TableHead>
                <TableHead className="w-40">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notifications.map((notification) => {
                const Icon = NOTIFICATION_TYPE_ICONS[notification.notification_type]
                const isClickable = notification.entity_type && notification.entity_id

                return (
                  <TableRow
                    key={notification.id}
                    className={cn(
                      !notification.is_read && 'bg-accent/50',
                      isClickable && 'cursor-pointer hover:bg-accent/70'
                    )}
                    onClick={() =>
                      handleNotificationClick(
                        notification.id,
                        notification.is_read,
                        notification.entity_type,
                        notification.entity_id
                      )
                    }
                  >
                    <TableCell>
                      {!notification.is_read && (
                        <div className="h-2 w-2 rounded-full bg-primary" title="Unread" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Icon className="h-5 w-5 text-muted-foreground" />
                    </TableCell>
                    <TableCell>
                      <div className={cn('font-medium', !notification.is_read && 'text-foreground')}>
                        {notification.title}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {notification.message}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {NOTIFICATION_TYPE_LABELS[notification.notification_type]}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={SEVERITY_BADGE_VARIANT[notification.severity]}>
                        {notification.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * PER_PAGE + 1} to {Math.min(page * PER_PAGE, meta.total)} of{' '}
            {meta.total} notifications
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
