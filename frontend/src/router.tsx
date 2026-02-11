import { Navigate, Outlet, type RouteObject } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { Layout } from '@/components/layout/Layout'
import { LoginPage } from '@/pages/LoginPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { ParticipantListPage } from '@/features/participants/ParticipantListPage'
import { ParticipantDetailPage } from '@/features/participants/ParticipantDetailPage'
import { ParticipantForm } from '@/features/participants/ParticipantForm'
import { SampleListPage } from '@/features/samples/SampleListPage'
import { SampleDetailPage } from '@/features/samples/SampleDetailPage'
import { SampleRegisterForm } from '@/features/samples/SampleRegisterForm'
import { PageSpinner } from '@/components/ui/spinner'
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
    return <NotFoundPage />
  }

  return <>{children}</>
}

// --- Placeholder page ---

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground">{title}</h1>
      <div className="mt-4 rounded-lg border border-dashed border-border p-12 text-center">
        <p className="text-sm text-muted-foreground">
          This page is under development.
        </p>
      </div>
    </div>
  )
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
          { path: 'odk-sync', element: <PlaceholderPage title="ODK Sync Status" /> },
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
          { path: 'processing', element: <PlaceholderPage title="Sample Processing" /> },
          { path: ':id', element: <SampleDetailPage /> },
        ],
      },

      // Storage
      {
        path: 'storage',
        children: [
          { path: 'freezers', element: <PlaceholderPage title="Freezers" /> },
          { path: 'freezers/:id', element: <PlaceholderPage title="Freezer Detail" /> },
          { path: 'boxes', element: <PlaceholderPage title="Storage Boxes" /> },
          { path: 'boxes/:id', element: <PlaceholderPage title="Box Detail" /> },
          { path: 'search', element: <PlaceholderPage title="Storage Search" /> },
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
          { path: 'events', element: <PlaceholderPage title="Field Events" /> },
          { path: 'events/:id', element: <PlaceholderPage title="Event Detail" /> },
          { path: 'digitization', element: <PlaceholderPage title="Digitization" /> },
          { path: 'conflicts', element: <PlaceholderPage title="Sync Conflicts" /> },
        ],
      },

      // Partners
      {
        path: 'partners',
        children: [
          { path: 'import', element: <PlaceholderPage title="Import Partner Data" /> },
          { path: 'history', element: <PlaceholderPage title="Import History" /> },
          { path: 'results', element: <PlaceholderPage title="Partner Results" /> },
          { path: 'stool-kits', element: <PlaceholderPage title="Stool Kit Tracker" /> },
        ],
      },

      // Instruments
      {
        path: 'instruments',
        children: [
          { index: true, element: <PlaceholderPage title="Instrument Dashboard" /> },
          { path: 'queue', element: <PlaceholderPage title="Sample Queue" /> },
          { path: 'plates', element: <PlaceholderPage title="Plate Designer" /> },
          { path: 'plates/:id', element: <PlaceholderPage title="Plate Detail" /> },
          { path: 'runs', element: <PlaceholderPage title="Instrument Runs" /> },
          { path: 'runs/:id', element: <PlaceholderPage title="Run Detail" /> },
          { path: 'omics', element: <PlaceholderPage title="Omics Results" /> },
          { path: 'icc', element: <PlaceholderPage title="ICC Workflow" /> },
        ],
      },

      // Reports
      {
        path: 'reports',
        children: [
          { path: 'enrollment', element: <PlaceholderPage title="Enrollment Dashboard" /> },
          { path: 'inventory', element: <PlaceholderPage title="Inventory Dashboard" /> },
          { path: 'sites', element: <PlaceholderPage title="Sites Dashboard" /> },
          {
            path: 'data-availability',
            element: <PlaceholderPage title="Data Availability" />,
          },
          { path: 'quality', element: <PlaceholderPage title="Quality Dashboard" /> },
          { path: 'query-builder', element: <PlaceholderPage title="Query Builder" /> },
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
          { path: 'users', element: <PlaceholderPage title="User Management" /> },
          { path: 'users/:id', element: <PlaceholderPage title="User Detail" /> },
          { path: 'replica', element: <PlaceholderPage title="Read Replica Accounts" /> },
          { path: 'audit-logs', element: <PlaceholderPage title="Audit Logs" /> },
          { path: 'access-logs', element: <PlaceholderPage title="Access Logs" /> },
          { path: 'reports', element: <PlaceholderPage title="Scheduled Reports" /> },
          { path: 'settings', element: <PlaceholderPage title="System Settings" /> },
        ],
      },

      // Notifications
      { path: 'notifications', element: <PlaceholderPage title="Notifications" /> },

      // Profile
      { path: 'profile', element: <PlaceholderPage title="Profile" /> },

      // Catch-all
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
