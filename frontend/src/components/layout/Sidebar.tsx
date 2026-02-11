import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'
import type { UserRole } from '@/types'
import {
  LayoutDashboard,
  Users,
  FlaskConical,
  Snowflake,
  MapPin,
  Building2,
  Microscope,
  BarChart3,
  Shield,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

interface NavItem {
  label: string
  path: string
  icon: React.ReactNode
  roles?: UserRole[] // If undefined, visible to all
  children?: Array<{ label: string; path: string; roles?: UserRole[] }>
}

const navigation: NavItem[] = [
  {
    label: 'Dashboard',
    path: '/',
    icon: <LayoutDashboard className="h-5 w-5" />,
  },
  {
    label: 'Participants',
    path: '/participants',
    icon: <Users className="h-5 w-5" />,
    children: [
      { label: 'All Participants', path: '/participants' },
      {
        label: 'Create',
        path: '/participants/create',
        roles: ['super_admin', 'lab_manager'],
      },
      { label: 'ODK Sync', path: '/participants/odk-sync' },
    ],
  },
  {
    label: 'Samples',
    path: '/samples',
    icon: <FlaskConical className="h-5 w-5" />,
    children: [
      { label: 'All Samples', path: '/samples' },
      { label: 'Register', path: '/samples/register' },
      { label: 'Processing', path: '/samples/processing' },
    ],
  },
  {
    label: 'Storage',
    path: '/storage',
    icon: <Snowflake className="h-5 w-5" />,
    children: [
      { label: 'Freezers', path: '/storage/freezers' },
      { label: 'Boxes', path: '/storage/boxes' },
      { label: 'Search', path: '/storage/search' },
    ],
  },
  {
    label: 'Field Operations',
    path: '/field-ops',
    icon: <MapPin className="h-5 w-5" />,
    roles: [
      'super_admin',
      'lab_manager',
      'field_coordinator',
      'data_entry',
      'pi_researcher',
    ],
    children: [
      { label: 'Events', path: '/field-ops/events' },
      { label: 'Digitization', path: '/field-ops/digitization' },
      { label: 'Conflicts', path: '/field-ops/conflicts' },
    ],
  },
  {
    label: 'Partners',
    path: '/partners',
    icon: <Building2 className="h-5 w-5" />,
    children: [
      { label: 'Import Data', path: '/partners/import' },
      { label: 'Import History', path: '/partners/history' },
      { label: 'Results', path: '/partners/results' },
      { label: 'Stool Kits', path: '/partners/stool-kits' },
    ],
  },
  {
    label: 'Instruments',
    path: '/instruments',
    icon: <Microscope className="h-5 w-5" />,
    roles: [
      'super_admin',
      'lab_manager',
      'lab_technician',
      'pi_researcher',
    ],
    children: [
      { label: 'Dashboard', path: '/instruments' },
      { label: 'Queue', path: '/instruments/queue' },
      { label: 'Plate Designer', path: '/instruments/plates' },
      { label: 'Runs', path: '/instruments/runs' },
      { label: 'Omics Results', path: '/instruments/omics' },
      { label: 'ICC Workflow', path: '/instruments/icc' },
    ],
  },
  {
    label: 'Reports',
    path: '/reports',
    icon: <BarChart3 className="h-5 w-5" />,
    children: [
      { label: 'Enrollment', path: '/reports/enrollment' },
      { label: 'Inventory', path: '/reports/inventory' },
      { label: 'Sites', path: '/reports/sites' },
      { label: 'Data Availability', path: '/reports/data-availability' },
      { label: 'Quality', path: '/reports/quality' },
      { label: 'Query Builder', path: '/reports/query-builder' },
    ],
  },
  {
    label: 'Admin',
    path: '/admin',
    icon: <Shield className="h-5 w-5" />,
    roles: ['super_admin', 'lab_manager'],
    children: [
      { label: 'Users', path: '/admin/users' },
      { label: 'Read Replica', path: '/admin/replica' },
      { label: 'Audit Logs', path: '/admin/audit-logs' },
      { label: 'Access Logs', path: '/admin/access-logs' },
      { label: 'Scheduled Reports', path: '/admin/reports' },
      { label: 'System Settings', path: '/admin/settings' },
    ],
  },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const userRole = user?.role

  function hasAccess(roles?: UserRole[]): boolean {
    if (!roles) return true
    if (!userRole) return false
    return roles.includes(userRole)
  }

  function isActive(path: string): boolean {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r border-border bg-card transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo area */}
      <div className="flex h-16 items-center border-b border-border px-4">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <FlaskConical className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold tracking-tight text-foreground">
              LIIMS
            </span>
          </div>
        )}
        {collapsed && (
          <FlaskConical className="mx-auto h-6 w-6 text-primary" />
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1 px-2">
          {navigation.map((item) => {
            if (!hasAccess(item.roles)) return null

            const active = isActive(item.path)
            const showChildren = active && !collapsed && item.children

            return (
              <li key={item.path}>
                <NavLink
                  to={item.children ? item.children[0].path : item.path}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  {item.icon}
                  {!collapsed && <span>{item.label}</span>}
                </NavLink>

                {showChildren && (
                  <ul className="ml-8 mt-1 space-y-1">
                    {item.children!.map((child) => {
                      if (!hasAccess(child.roles)) return null
                      return (
                        <li key={child.path}>
                          <NavLink
                            to={child.path}
                            className={({ isActive: linkActive }) =>
                              cn(
                                'block rounded-md px-3 py-1.5 text-sm transition-colors',
                                linkActive
                                  ? 'font-medium text-primary'
                                  : 'text-muted-foreground hover:text-foreground'
                              )
                            }
                          >
                            {child.label}
                          </NavLink>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-border p-2">
        <button
          onClick={onToggle}
          className="flex w-full items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>
    </aside>
  )
}
