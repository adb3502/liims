import { Navigate, Outlet, type RouteObject } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { Layout } from '@/components/layout/Layout'
import { LoginPage } from '@/pages/LoginPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { ForbiddenPage } from '@/pages/ForbiddenPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { ParticipantListPage } from '@/features/participants/ParticipantListPage'
import { ParticipantDetailPage } from '@/features/participants/ParticipantDetailPage'
import { ParticipantForm } from '@/features/participants/ParticipantForm'
import { SampleListPage } from '@/features/samples/SampleListPage'
import { SampleDetailPage } from '@/features/samples/SampleDetailPage'
import { SampleRegisterForm } from '@/features/samples/SampleRegisterForm'
import { FreezerListPage } from '@/features/storage/FreezerListPage'
import { FreezerDetailPage } from '@/features/storage/FreezerDetailPage'
import { BoxDetailPage } from '@/features/storage/BoxDetailPage'
import { StorageSearchPage } from '@/features/storage/StorageSearchPage'
import { FieldEventListPage } from '@/features/field-ops/FieldEventListPage'
import { FieldEventDetailPage } from '@/features/field-ops/FieldEventDetailPage'
import { BulkDigitizePage } from '@/features/field-ops/BulkDigitizePage'
import { ImportWizardPage } from '@/features/partners/ImportWizardPage'
import { ImportHistoryPage } from '@/features/partners/ImportHistoryPage'
import { StoolKitTrackerPage } from '@/features/partners/StoolKitTrackerPage'
import { OdkSyncPage } from '@/features/partners/OdkSyncPage'
import { PartnerResultsPage } from '@/features/partners/PartnerResultsPage'
import { SyncConflictsPage } from '@/features/sync/SyncConflictsPage'
import { ReadReplicaPage } from '@/features/admin/ReadReplicaPage'
import { InstrumentDashboardPage } from '@/features/instruments/InstrumentDashboardPage'
import { InstrumentRunsPage } from '@/features/instruments/InstrumentRunsPage'
import { RunDetailPage } from '@/features/instruments/RunDetailPage'
import { PlateDesignerPage } from '@/features/instruments/PlateDesignerPage'
import { PlateDetailPage } from '@/features/instruments/PlateDetailPage'
import { IccWorkflowPage } from '@/features/instruments/IccWorkflowPage'
import { OmicsResultsPage } from '@/features/instruments/OmicsResultsPage'
import { EnrollmentDashboardPage } from '@/features/reports/EnrollmentDashboardPage'
import { InventoryDashboardPage } from '@/features/reports/InventoryDashboardPage'
import { QualityDashboardPage } from '@/features/reports/QualityDashboardPage'
import { DataExplorerPage } from '@/features/reports/DataExplorerPage'
import { QueryBuilderPage } from '@/features/reports/QueryBuilderPage'
import { ReportGeneratorPage } from '@/features/reports/ReportGeneratorPage'
import { FileManagerPage } from '@/features/files/FileManagerPage'
import { UserManagementPage } from '@/features/admin/UserManagementPage'
import { UserDetailPage } from '@/features/admin/UserDetailPage'
import { SystemSettingsPage } from '@/features/admin/SystemSettingsPage'
import { AuditLogsPage } from '@/features/admin/AuditLogsPage'
import { AccessLogsPage } from '@/features/admin/AccessLogsPage'
import { ScheduledReportsPage } from '@/features/admin/ScheduledReportsPage'
import { NotificationsPage } from '@/features/notifications/NotificationsPage'
import { ProfilePage } from '@/features/profile/ProfilePage'
import { ProtocolsPage } from '@/features/protocols/ProtocolsPage'
import { PageSpinner } from '@/components/ui/spinner'
import { SampleProcessingPage } from '@/features/samples/SampleProcessingPage'
import { SampleQueuePage } from '@/features/instruments/SampleQueuePage'
import { LabelGeneratorPage } from '@/features/samples/LabelGeneratorPage'
import { SitesDashboardPage } from '@/features/reports/SitesDashboardPage'
import { SiteEnrollmentDashboardPage } from '@/features/reports/SiteEnrollmentDashboardPage'
import type { UserRole } from '@/types'

// --- Route guards ---

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore()

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <PageSpinner />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore()

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <PageSpinner />
      </div>
    )
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

function RoleGuard({
  roles,
  children,
}: {
  roles: UserRole[]
  children: React.ReactNode
}) {
  const user = useAuthStore((s) => s.user)

  if (!user || !roles.includes(user.role)) {
    return <ForbiddenPage />
  }

  return <>{children}</>
}

// --- Route definitions ---

export const routes: RouteObject[] = [
  {
    path: '/login',
    element: (
      <GuestRoute>
        <LoginPage />
      </GuestRoute>
    ),
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <Layout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <DashboardPage /> },

      // Participants
      {
        path: 'participants',
        children: [
          { index: true, element: <ParticipantListPage /> },
          {
            path: 'create',
            element: (
              <RoleGuard roles={['super_admin', 'lab_manager', 'data_entry', 'field_coordinator']}>
                <ParticipantForm />
              </RoleGuard>
            ),
          },
          { path: 'odk-sync', element: <OdkSyncPage /> },
          { path: ':id', element: <ParticipantDetailPage /> },
        ],
      },

      // Samples
      {
        path: 'samples',
        children: [
          { index: true, element: <SampleListPage /> },
          {
            path: 'register',
            element: (
              <RoleGuard roles={['super_admin', 'lab_manager', 'lab_technician', 'field_coordinator']}>
                <SampleRegisterForm />
              </RoleGuard>
            ),
          },
          { path: 'processing', element: <SampleProcessingPage /> },
          { path: 'labels', element: <LabelGeneratorPage /> },
          { path: ':id', element: <SampleDetailPage /> },
        ],
      },

      // Storage
      {
        path: 'storage',
        children: [
          { path: 'freezers', element: <FreezerListPage /> },
          { path: 'freezers/:id', element: <FreezerDetailPage /> },
          { path: 'boxes', element: <Navigate to="/storage/freezers" replace /> },
          { path: 'boxes/:id', element: <BoxDetailPage /> },
          { path: 'search', element: <StorageSearchPage /> },
        ],
      },

      // Field Operations
      {
        path: 'field-ops',
        element: (
          <RoleGuard
            roles={[
              'super_admin',
              'lab_manager',
              'field_coordinator',
              'data_entry',
              'pi_researcher',
            ]}
          >
            <Outlet />
          </RoleGuard>
        ),
        children: [
          { path: 'events', element: <FieldEventListPage /> },
          { path: 'events/:id', element: <FieldEventDetailPage /> },
          { path: 'events/:id/digitize', element: <BulkDigitizePage /> },
          { path: 'conflicts', element: <SyncConflictsPage /> },
        ],
      },

      // Partners
      {
        path: 'partners',
        children: [
          { path: 'import', element: <ImportWizardPage /> },
          { path: 'history', element: <ImportHistoryPage /> },
          { path: 'results', element: <PartnerResultsPage /> },
          { path: 'stool-kits', element: <StoolKitTrackerPage /> },
          { path: 'odk-sync', element: <OdkSyncPage /> },
        ],
      },

      // Instruments
      {
        path: 'instruments',
        children: [
          { index: true, element: <InstrumentDashboardPage /> },
          { path: 'queue', element: <SampleQueuePage /> },
          { path: 'plates', element: <PlateDesignerPage /> },
          { path: 'plates/:id', element: <PlateDetailPage /> },
          { path: 'runs', element: <InstrumentRunsPage /> },
          { path: 'runs/:id', element: <RunDetailPage /> },
          { path: 'omics', element: <OmicsResultsPage /> },
          { path: 'icc', element: <IccWorkflowPage /> },
        ],
      },

      // Reports
      {
        path: 'reports',
        children: [
          { path: 'enrollment', element: <EnrollmentDashboardPage /> },
          { path: 'enrollment/sites/:siteCode', element: <SiteEnrollmentDashboardPage /> },
          { path: 'inventory', element: <InventoryDashboardPage /> },
          { path: 'sites', element: <SitesDashboardPage /> },
          { path: 'data-availability', element: <ReportGeneratorPage /> },
          { path: 'quality', element: <QualityDashboardPage /> },
          { path: 'data-explorer', element: <DataExplorerPage /> },
          { path: 'query-builder', element: <QueryBuilderPage /> },
        ],
      },

      // Admin
      {
        path: 'admin',
        element: (
          <RoleGuard roles={['super_admin', 'lab_manager']}>
            <Outlet />
          </RoleGuard>
        ),
        children: [
          { path: 'users', element: <UserManagementPage /> },
          { path: 'users/:id', element: <UserDetailPage /> },
          { path: 'replica', element: <ReadReplicaPage /> },
          { path: 'audit-logs', element: <AuditLogsPage /> },
          { path: 'access-logs', element: <AccessLogsPage /> },
          { path: 'reports', element: <ScheduledReportsPage /> },
          { path: 'settings', element: <SystemSettingsPage /> },
          { path: 'files', element: <FileManagerPage /> },
        ],
      },

      // Notifications
      { path: 'notifications', element: <NotificationsPage /> },

      // Profile
      { path: 'profile', element: <ProfilePage /> },

      // Protocols / SOP library
      { path: 'protocols', element: <ProtocolsPage /> },

      // Catch-all
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
