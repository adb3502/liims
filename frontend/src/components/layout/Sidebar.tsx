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
  FileText,
  Dna,
} from 'lucide-react'

interface NavItem {
  label: string
  path: string
  icon: React.ReactNode
  roles?: UserRole[]
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
        roles: ['super_admin', 'lab_manager', 'data_entry', 'field_coordinator'],
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
      { label: 'Labels', path: '/samples/labels' },
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
    roles: ['super_admin', 'lab_manager', 'field_coordinator', 'data_entry', 'pi_researcher'],
    children: [
      { label: 'Events', path: '/field-ops/events' },
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
      { label: 'ODK Sync', path: '/partners/odk-sync' },
      { label: 'Stool Kits', path: '/partners/stool-kits' },
      { label: 'Results', path: '/partners/results' },
    ],
  },
  {
    label: 'Instruments',
    path: '/instruments',
    icon: <Microscope className="h-5 w-5" />,
    roles: ['super_admin', 'lab_manager', 'lab_technician', 'pi_researcher'],
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
    label: 'Analytics',
    path: '/reports',
    icon: <BarChart3 className="h-5 w-5" />,
    children: [
      { label: 'Overview', path: '/reports/enrollment' },
      { label: 'BHARAT Data', path: '/reports/data-explorer' },
      { label: 'Inventory', path: '/reports/inventory' },
      { label: 'Quality', path: '/reports/quality' },
      { label: 'Sites', path: '/reports/sites' },
      { label: 'Query Builder', path: '/reports/query-builder' },
    ],
  },
  {
    label: 'Protocols',
    path: '/protocols',
    icon: <FileText className="h-5 w-5" />,
  },
  {
    label: 'Admin',
    path: '/admin',
    icon: <Shield className="h-5 w-5" />,
    roles: ['super_admin', 'lab_manager'],
    children: [
      { label: 'Users', path: '/admin/users' },
      { label: 'Audit Logs', path: '/admin/audit-logs' },
      { label: 'Access Logs', path: '/admin/access-logs' },
      { label: 'File Manager', path: '/admin/files' },
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
        'flex h-screen flex-col transition-[width] duration-300 ease-in-out',
        collapsed ? 'w-[68px]' : 'w-64'
      )}
      style={{
        background: 'linear-gradient(180deg, #0F172A 0%, #1A1F3A 50%, #162044 100%)',
      }}
    >
      {/* Logo area */}
      <div className="flex h-16 items-center px-4 border-b border-white/[0.06]">
        {!collapsed ? (
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary">
              <Dna className="h-4.5 w-4.5 text-white" />
            </div>
            <div>
              <span className="text-[15px] font-bold tracking-tight text-white">
                LIIMS
              </span>
              <span className="block text-[9px] font-medium tracking-[0.15em] text-white/40 uppercase -mt-0.5">
                Longevity India
              </span>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary">
            <Dna className="h-4.5 w-4.5 text-white" />
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        <ul className="space-y-0.5">
          {navigation.map((item) => {
            if (!hasAccess(item.roles)) return null

            const active = isActive(item.path)
            const showChildren = active && !collapsed && item.children

            return (
              <li key={item.path}>
                <NavLink
                  to={item.children ? item.children[0].path : item.path}
                  className={cn(
                    'group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150',
                    active
                      ? 'bg-white/[0.1] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]'
                      : 'text-white/50 hover:bg-white/[0.05] hover:text-white/80'
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <span className={cn(
                    'flex-shrink-0 transition-colors',
                    active ? 'text-[#5B93FF]' : 'text-white/40 group-hover:text-white/60'
                  )}>
                    {item.icon}
                  </span>
                  {!collapsed && <span>{item.label}</span>}
                  {active && !collapsed && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#5B93FF]" />
                  )}
                </NavLink>

                {showChildren && (
                  <ul className="ml-[26px] mt-0.5 space-y-0.5 border-l border-white/[0.06] pl-3">
                    {item.children!.map((child) => {
                      if (!hasAccess(child.roles)) return null
                      return (
                        <li key={child.path}>
                          <NavLink
                            to={child.path}
                            className={({ isActive: linkActive }) =>
                              cn(
                                'block rounded-md px-2.5 py-1.5 text-[12px] transition-all duration-150',
                                linkActive
                                  ? 'font-medium text-white bg-white/[0.06]'
                                  : 'text-white/40 hover:text-white/70 hover:bg-white/[0.03]'
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

      {/* User section + collapse */}
      <div className="border-t border-white/[0.06] p-2">
        {!collapsed && user && (
          <div className="px-3 py-2 mb-1">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-primary text-[10px] font-bold text-white">
                {user.full_name?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-white/80 truncate">{user.full_name}</p>
                <p className="text-[10px] text-white/30 truncate">{user.email}</p>
              </div>
            </div>
          </div>
        )}
        <button
          onClick={onToggle}
          className="flex w-full items-center justify-center rounded-lg p-2 text-white/30 hover:bg-white/[0.05] hover:text-white/60 transition-all cursor-pointer"
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
